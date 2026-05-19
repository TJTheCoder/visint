from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from pathlib import Path

from .featurizer import HistoryState, build_observation_vector


@dataclass(slots=True)
class ReplayRecord:
    episode_id: str
    observation: dict
    observation_vector: list[float]
    allowed_action_ids: list[int]
    source: str
    recommended_action_id: int | None
    chosen_action_id: int | None
    accepted: bool
    reward: float
    created_at: str


class ReplayStore:
    def __init__(self, replay_path: str | Path):
        self.replay_path = Path(replay_path)
        self.replay_path.parent.mkdir(parents=True, exist_ok=True)
        self.records: list[ReplayRecord] = []
        self._load()

    @property
    def size(self) -> int:
        return len(self.records)

    def _load(self) -> None:
        if not self.replay_path.exists():
            return

        migrated_records: list[ReplayRecord] = []
        history = HistoryState()

        with self.replay_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue

                try:
                    payload = json.loads(line)
                    observation = payload["observation"]
                    observation_vector = build_observation_vector(observation, history)
                    record = ReplayRecord(
                        episode_id=payload["episode_id"],
                        observation=observation,
                        observation_vector=observation_vector,
                        allowed_action_ids=payload["allowed_action_ids"],
                        source=payload["source"],
                        recommended_action_id=payload.get("recommended_action_id"),
                        chosen_action_id=payload.get("chosen_action_id"),
                        accepted=payload["accepted"],
                        reward=payload["reward"],
                        created_at=payload["created_at"],
                    )
                    migrated_records.append(record)
                    history = HistoryState(
                        last_recommended_action_id=record.recommended_action_id,
                        last_chosen_action_id=record.chosen_action_id,
                        last_reward=record.reward,
                    )
                except Exception:
                    continue

        self.records = migrated_records

    def append(
        self,
        *,
        episode_id: str,
        observation: dict,
        observation_vector: list[float],
        allowed_action_ids: list[int],
        source: str,
        recommended_action_id: int | None,
        chosen_action_id: int | None,
        accepted: bool,
        reward: float,
    ) -> ReplayRecord:
        record = ReplayRecord(
            episode_id=episode_id,
            observation=observation,
            observation_vector=observation_vector,
            allowed_action_ids=allowed_action_ids,
            source=source,
            recommended_action_id=recommended_action_id,
            chosen_action_id=chosen_action_id,
            accepted=accepted,
            reward=reward,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.records.append(record)

        with self.replay_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")

        return record

    def recent(self, limit: int) -> list[ReplayRecord]:
        if limit <= 0:
            return []
        return self.records[-limit:]

    def history_state(self) -> HistoryState:
        if not self.records:
            return HistoryState()

        last = self.records[-1]
        return HistoryState(
            last_recommended_action_id=last.recommended_action_id,
            last_chosen_action_id=last.chosen_action_id,
            last_reward=last.reward,
        )
