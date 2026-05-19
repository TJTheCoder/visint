from __future__ import annotations

import random
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import gymnasium as gym
import numpy as np
import torch
import torch.nn.functional as F
from torch import nn

from amago.nets import transformer
from amago.nets.tstep_encoders import FFTstepEncoder
from amago.nets.traj_encoders import TformerTrajEncoder

from .action_space import ACTION_ID_TO_TYPE, ACTION_TYPE_TO_ID, NUM_ACTIONS, fallback_action_id, normalize_allowed_action_ids
from .featurizer import FEATURE_DIM
from .replay_store import ReplayRecord, ReplayStore


@dataclass(slots=True)
class RecommendationResult:
    action_id: int
    action_type: str
    confidence: float
    mode: str
    warning: str | None = None


class AMAGOSequencePolicy(nn.Module):
    def __init__(self, obs_dim: int, num_actions: int, max_seq_len: int = 16):
        super().__init__()
        self.max_seq_len = max_seq_len
        self.obs_dim = obs_dim
        self.num_actions = num_actions
        obs_space = gym.spaces.Dict(
            {
                "features": gym.spaces.Box(
                    low=-10_000.0,
                    high=10_000.0,
                    shape=(obs_dim,),
                    dtype=np.float32,
                )
            }
        )
        rl2_space = gym.spaces.Box(
            low=-10_000.0,
            high=10_000.0,
            shape=(1 + num_actions,),
            dtype=np.float32,
        )
        attention_type = (
            transformer.FlashAttention
            if getattr(transformer, "flash_attn", None) is not None
            else transformer.VanillaAttention
        )
        self.tstep_encoder = FFTstepEncoder(
            obs_space=obs_space,
            rl2_space=rl2_space,
            n_layers=2,
            d_hidden=256,
            d_output=128,
            out_norm="layer",
            normalize_inputs=True,
        )
        self.traj_encoder = TformerTrajEncoder(
            tstep_dim=self.tstep_encoder.emb_dim,
            max_seq_len=max_seq_len,
            d_model=128,
            n_heads=8,
            d_ff=512,
            n_layers=2,
            dropout_ff=0.0,
            dropout_emb=0.0,
            dropout_attn=0.0,
            dropout_qkv=0.0,
            attention_type=attention_type,
        )
        self.policy_head = nn.Sequential(
            nn.LayerNorm(self.traj_encoder.emb_dim),
            nn.Linear(self.traj_encoder.emb_dim, num_actions),
        )

    def forward(self, obs_seq: torch.Tensor, rl2_seq: torch.Tensor, time_idxs: torch.Tensor) -> torch.Tensor:
        tstep = self.tstep_encoder({"features": obs_seq}, rl2_seq)
        traj, _ = self.traj_encoder(tstep, time_idxs)
        return self.policy_head(traj[:, -1])


class OnlinePolicyTrainer:
    def __init__(
        self,
        *,
        replay_store: ReplayStore,
        checkpoint_path: str | Path,
        max_seq_len: int = 16,
        warmup_replay_size: int = 10,
        batch_size: int = 16,
        learning_rate: float = 2e-4,
    ):
        self.replay_store = replay_store
        self.checkpoint_path = Path(checkpoint_path)
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self.max_seq_len = max_seq_len
        self.warmup_replay_size = warmup_replay_size
        self.batch_size = batch_size
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AMAGOSequencePolicy(FEATURE_DIM, NUM_ACTIONS, max_seq_len=max_seq_len).to(self.device)
        self.optimizer = torch.optim.AdamW(self.model.parameters(), lr=learning_rate)
        self.training_lock = threading.Lock()
        self.training_event = threading.Event()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.train_steps = 0
        self.last_checkpoint = str(self.checkpoint_path) if self.checkpoint_path.exists() else None
        self.load_checkpoint()

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._background_loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        self.training_event.set()
        if self.thread:
            self.thread.join(timeout=5)

    def notify_feedback(self) -> None:
        self.training_event.set()

    def recommend(self, current_vector: list[float], allowed_action_ids: Iterable[int]) -> RecommendationResult:
        allowed_action_ids = normalize_allowed_action_ids(allowed_action_ids)

        if self.replay_store.size < self.warmup_replay_size:
            action_id = fallback_action_id(allowed_action_ids)
            return RecommendationResult(
                action_id=action_id,
                action_type=ACTION_ID_TO_TYPE[action_id],
                confidence=0.58,
                mode="heuristic",
            )

        obs_seq, rl2_seq, time_idxs = self._build_inference_sequence(current_vector)

        with self.training_lock:
            self.model.eval()
            with torch.no_grad():
                logits = self.model(obs_seq, rl2_seq, time_idxs)

        masked_logits = mask_logits(logits, allowed_action_ids)
        probs = torch.softmax(masked_logits, dim=-1)
        action_id = int(torch.argmax(masked_logits, dim=-1).item())
        confidence = float(probs[0, action_id].item())
        warning = None

        if action_id not in allowed_action_ids:
            action_id = fallback_action_id(allowed_action_ids)
            confidence = 0.51
            warning = "Policy proposed a masked action, so a safe fallback was used."

        return RecommendationResult(
            action_id=action_id,
            action_type=ACTION_ID_TO_TYPE[action_id],
            confidence=confidence,
            mode="amago_policy",
            warning=warning,
        )

    def train_now(self, updates: int = 8) -> None:
        if self.replay_store.size == 0:
            return

        self.model.train()

        for _ in range(updates):
            batch = self._sample_batch()
            if not batch:
                return

            total_loss = torch.tensor(0.0, device=self.device)
            effective_items = 0

            for record_index in batch:
                loss = self._compute_record_loss(record_index)
                if loss is None:
                    continue
                total_loss = total_loss + loss
                effective_items += 1

            if effective_items == 0:
                continue

            total_loss = total_loss / effective_items
            self.optimizer.zero_grad(set_to_none=True)
            total_loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            self.optimizer.step()
            self.train_steps += 1

        self.save_checkpoint()

    def load_checkpoint(self) -> None:
        if not self.checkpoint_path.exists():
            return

        checkpoint = torch.load(self.checkpoint_path, map_location=self.device)
        self.model.load_state_dict(checkpoint["model"])
        self.optimizer.load_state_dict(checkpoint["optimizer"])
        self.train_steps = int(checkpoint.get("train_steps", 0))
        self.last_checkpoint = str(self.checkpoint_path)

    def save_checkpoint(self) -> None:
        checkpoint = {
            "model": self.model.state_dict(),
            "optimizer": self.optimizer.state_dict(),
            "train_steps": self.train_steps,
        }
        torch.save(checkpoint, self.checkpoint_path)
        self.last_checkpoint = str(self.checkpoint_path)

    def _background_loop(self) -> None:
        while not self.stop_event.is_set():
            triggered = self.training_event.wait(timeout=2.0)
            if self.stop_event.is_set():
                return
            if not triggered:
                if self.replay_store.size >= self.warmup_replay_size:
                    self.train_now(updates=2)
                continue

            self.training_event.clear()
            self.train_now(updates=10)

    def _sample_batch(self) -> list[int]:
        if self.replay_store.size == 0:
            return []
        sample_size = min(self.batch_size, self.replay_store.size)
        return random.sample(range(self.replay_store.size), sample_size)

    def _compute_record_loss(self, index: int) -> torch.Tensor | None:
        record = self.replay_store.records[index]
        obs_seq, rl2_seq, time_idxs = self._build_training_sequence(index)
        logits = self.model(obs_seq, rl2_seq, time_idxs)
        masked_logits = mask_logits(logits, record.allowed_action_ids)
        probs = torch.softmax(masked_logits, dim=-1)
        total_loss = torch.tensor(0.0, device=self.device)

        if record.chosen_action_id is not None:
            target = torch.tensor([record.chosen_action_id], device=self.device)
            imitation_weight = 1.0 if record.accepted else 0.35
            total_loss = total_loss + imitation_weight * F.cross_entropy(masked_logits, target)

        if record.reward < 0 and record.recommended_action_id in record.allowed_action_ids:
            penalty_strength = min(abs(record.reward), 1.0)
            total_loss = total_loss + penalty_strength * probs[0, record.recommended_action_id]

        return total_loss if total_loss.requires_grad else None

    def _build_inference_sequence(self, current_vector: list[float]):
        records = self.replay_store.recent(self.max_seq_len - 1)
        vectors = [record.observation_vector for record in records] + [current_vector]
        previous_records = records
        return build_sequence_tensors(vectors, previous_records, self.device)

    def _build_training_sequence(self, index: int):
        start = max(0, index - self.max_seq_len + 1)
        records = self.replay_store.records[start : index + 1]
        vectors = [record.observation_vector for record in records]
        return build_sequence_tensors(vectors, records[:-1], self.device)


def build_sequence_tensors(
    vectors: list[list[float]],
    previous_records: list[ReplayRecord],
    device: torch.device,
):
    length = len(vectors)
    obs_seq = torch.tensor(vectors, dtype=torch.float32, device=device).unsqueeze(0)
    rl2_features = []

    for index in range(length):
        if index == 0:
            rl2_features.append([0.0] * (1 + NUM_ACTIONS))
            continue

        prev_record = previous_records[index - 1]
        prev_action = prev_record.chosen_action_id
        if prev_action is None:
            prev_action = prev_record.recommended_action_id

        prev_action_one_hot = [0.0] * NUM_ACTIONS
        if prev_action is not None and 0 <= prev_action < NUM_ACTIONS:
            prev_action_one_hot[prev_action] = 1.0

        rl2_features.append([float(prev_record.reward), *prev_action_one_hot])

    rl2_seq = torch.tensor(rl2_features, dtype=torch.float32, device=device).unsqueeze(0)
    time_idxs = torch.arange(length, dtype=torch.int64, device=device).view(1, length, 1)
    return obs_seq, rl2_seq, time_idxs


def mask_logits(logits: torch.Tensor, allowed_action_ids: Iterable[int]) -> torch.Tensor:
    allowed_action_ids = normalize_allowed_action_ids(allowed_action_ids)
    mask = torch.full_like(logits, fill_value=-1e9)
    mask[:, allowed_action_ids] = 0.0
    return logits + mask
