from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .action_space import ACTION_ID_TO_TYPE, ACTION_TYPE_TO_ID, ALWAYS_ALLOWED_ACTION_IDS, fallback_action_id, is_valid_action_id, normalize_allowed_action_ids
from .featurizer import FEATURE_DIM, build_observation_vector
from .replay_store import ReplayStore
from .train_online import OnlinePolicyTrainer

ROOT_DIR = Path(__file__).resolve().parent
CHECKPOINT_PATH = ROOT_DIR / "checkpoints" / "latest.pt"
REPLAY_PATH = ROOT_DIR / "replay" / "replay.jsonl"

app = FastAPI(title="Visint RL Policy Server")
replay_store = ReplayStore(REPLAY_PATH)
trainer = OnlinePolicyTrainer(
    replay_store=replay_store,
    checkpoint_path=CHECKPOINT_PATH,
)
pending_recommendations: dict[str, dict[str, Any]] = {}


class ContextualActionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    payload: dict[str, Any]


class ObservationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scene_type: Literal["event", "receipt", "contact", "link", "foreign_text", "math", "parking", "general"]
    summary: str
    actions: list[ContextualActionModel]
    allowed_action_ids: list[int]
    image_features: None = None

    @field_validator("allowed_action_ids")
    @classmethod
    def validate_allowed_action_ids(cls, value: list[int]) -> list[int]:
        normalized = normalize_allowed_action_ids(value)
        if any(not is_valid_action_id(action_id) for action_id in normalized):
            raise ValueError("allowed_action_ids contains an invalid action id.")
        return normalized


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_id: str
    observation: ObservationModel


class RecommendResponse(BaseModel):
    recommended_action_id: int
    recommended_action_type: str
    confidence: float
    policy_debug: dict[str, Any]


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_id: str
    source: Literal["manual", "recommendation"]
    recommended_action_id: int | None
    chosen_action_id: int | None
    accepted: bool
    reward: float
    allowed_action_ids: list[int]
    observation: ObservationModel

    @field_validator("recommended_action_id")
    @classmethod
    def validate_recommended_action_id(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if not is_valid_action_id(value):
            raise ValueError("recommended_action_id is invalid.")
        return value

    @field_validator("chosen_action_id")
    @classmethod
    def validate_chosen_action_id(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if not is_valid_action_id(value):
            raise ValueError("chosen_action_id is invalid.")
        return value

    @field_validator("allowed_action_ids")
    @classmethod
    def validate_feedback_allowed_action_ids(cls, value: list[int]) -> list[int]:
        return normalize_allowed_action_ids(value)


@app.on_event("startup")
async def startup_event() -> None:
    trainer.start()


@app.on_event("shutdown")
async def shutdown_event() -> None:
    trainer.stop()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "feature_dim": FEATURE_DIM,
        "checkpoint": trainer.last_checkpoint,
        "replay_size": replay_store.size,
        "device": str(trainer.device),
        "traj_encoder": trainer.model.traj_encoder_name,
    }


@app.post("/recommend", response_model=RecommendResponse)
async def recommend(payload: RecommendRequest) -> RecommendResponse:
    allowed_action_ids = normalize_allowed_action_ids(payload.observation.allowed_action_ids)
    observation_vector = build_observation_vector(
        payload.observation.model_dump(),
        replay_store.history_state(),
    )
    result = trainer.recommend(observation_vector, allowed_action_ids)

    if result.action_id not in allowed_action_ids:
        fallback_id = fallback_action_id(allowed_action_ids)
        result.action_id = fallback_id
        result.action_type = ACTION_ID_TO_TYPE[fallback_id]
        result.warning = "Policy recommendation was invalid and was replaced with a masked fallback."

    pending_recommendations[payload.episode_id] = {
        "observation": payload.observation.model_dump(),
        "observation_vector": observation_vector,
        "allowed_action_ids": allowed_action_ids,
        "recommended_action_id": result.action_id,
    }

    return RecommendResponse(
        recommended_action_id=result.action_id,
        recommended_action_type=result.action_type,
        confidence=result.confidence,
        policy_debug={
            "allowed_action_ids": allowed_action_ids,
            "masked": True,
            "checkpoint": trainer.last_checkpoint,
            "replay_size": replay_store.size,
            "mode": result.mode,
            "warning": result.warning,
        },
    )


@app.post("/feedback")
async def feedback(payload: FeedbackRequest) -> dict[str, Any]:
    allowed_action_ids = normalize_allowed_action_ids(payload.allowed_action_ids)

    if payload.source == "manual" and payload.chosen_action_id is None:
        raise HTTPException(status_code=400, detail="manual feedback requires chosen_action_id.")

    if payload.chosen_action_id is not None and payload.chosen_action_id not in allowed_action_ids:
        raise HTTPException(status_code=400, detail="chosen_action_id is not in allowed_action_ids.")

    if payload.source == "recommendation":
        if payload.recommended_action_id is None:
            raise HTTPException(status_code=400, detail="recommended_action_id is required for recommendation feedback.")
        if payload.recommended_action_id not in allowed_action_ids:
            raise HTTPException(status_code=400, detail="recommended_action_id is not allowed for this observation.")

    if payload.source == "manual" and payload.recommended_action_id is not None:
        raise HTTPException(status_code=400, detail="manual feedback should not include recommended_action_id.")

    pending = pending_recommendations.get(payload.episode_id)
    observation_dict = payload.observation.model_dump()
    observation_vector = build_observation_vector(observation_dict, replay_store.history_state())

    if pending is not None:
        observation_vector = pending["observation_vector"]

    replay_store.append(
        episode_id=payload.episode_id,
        observation=observation_dict,
        observation_vector=observation_vector,
        allowed_action_ids=allowed_action_ids,
        source=payload.source,
        recommended_action_id=payload.recommended_action_id,
        chosen_action_id=payload.chosen_action_id,
        accepted=payload.accepted,
        reward=payload.reward,
    )
    pending_recommendations.pop(payload.episode_id, None)
    trainer.notify_feedback()

    return {
        "ok": True,
        "stored": True,
        "replay_size": replay_store.size,
        "checkpoint": trainer.last_checkpoint,
    }
