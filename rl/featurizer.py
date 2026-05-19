from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any

from .action_space import ACTION_TYPE_TO_ID, NUM_ACTIONS, normalize_allowed_action_ids

SCENE_TYPES = (
    "event",
    "receipt",
    "contact",
    "link",
    "foreign_text",
    "math",
    "parking",
    "general",
)

SCENE_TYPE_TO_ID = {scene_type: idx for idx, scene_type in enumerate(SCENE_TYPES)}
FEATURE_DIM = len(SCENE_TYPES) + NUM_ACTIONS + NUM_ACTIONS + 8 + NUM_ACTIONS + NUM_ACTIONS + 1


@dataclass(slots=True)
class HistoryState:
    last_recommended_action_id: int | None = None
    last_chosen_action_id: int | None = None
    last_reward: float = 0.0


def build_observation_vector(
    observation: dict[str, Any],
    history: HistoryState | None = None,
) -> list[float]:
    history = history or HistoryState()
    scene_type = observation.get("scene_type", "general")
    summary = str(observation.get("summary") or "")
    actions = observation.get("actions") or []
    allowed_action_ids = normalize_allowed_action_ids(observation.get("allowed_action_ids") or [])

    scene_one_hot = one_hot_scene(scene_type)
    allowed_mask = action_mask_from_ids(allowed_action_ids)
    confidence_by_action = [0.0] * NUM_ACTIONS

    for action in actions:
        action_type = action.get("type")
        if action_type in ACTION_TYPE_TO_ID:
            confidence_by_action[ACTION_TYPE_TO_ID[action_type]] = float(action.get("confidence", 0.0))

    text_blob = build_text_blob(summary, actions)
    text_features = [
        float(bool(find_date(text_blob))),
        float(bool(find_time(text_blob))),
        float(bool(re.search(r"(?:\$|USD\s?)\d+[.,]?\d{0,2}", text_blob, flags=re.I))),
        float(bool(find_url(text_blob))),
        float(bool(find_phone(text_blob))),
        float(bool(find_email(text_blob))),
        float(has_foreign_text(text_blob)),
        float(has_math_problem(text_blob)),
    ]

    previous_recommended = one_hot_action(history.last_recommended_action_id)
    previous_chosen = one_hot_action(history.last_chosen_action_id)
    previous_reward = [float(history.last_reward)]

    return [
        *scene_one_hot,
        *allowed_mask,
        *confidence_by_action,
        *text_features,
        *previous_recommended,
        *previous_chosen,
        *previous_reward,
    ]


def build_text_blob(summary: str, actions: list[dict[str, Any]]) -> str:
    payload_text = []

    for action in actions:
        payload = action.get("payload")
        if payload:
            payload_text.append(json.dumps(payload, ensure_ascii=False))

    return f"{summary}\n" + "\n".join(payload_text)


def one_hot_scene(scene_type: str) -> list[float]:
    values = [0.0] * len(SCENE_TYPES)
    values[SCENE_TYPE_TO_ID.get(scene_type, SCENE_TYPE_TO_ID["general"])] = 1.0
    return values


def one_hot_action(action_id: int | None) -> list[float]:
    values = [0.0] * NUM_ACTIONS

    if action_id is not None and 0 <= action_id < NUM_ACTIONS:
        values[action_id] = 1.0

    return values


def action_mask_from_ids(allowed_action_ids: list[int]) -> list[float]:
    values = [0.0] * NUM_ACTIONS

    for action_id in allowed_action_ids:
        values[action_id] = 1.0

    return values


def has_foreign_text(text: str) -> bool:
    return bool(re.search(r"[^\u0000-\u007f]", text)) or bool(
        re.search(r"\b(chinese|japanese|korean|spanish|french|german|arabic|hindi)\b", text, flags=re.I)
    )


def has_math_problem(text: str) -> bool:
    return bool(
        re.search(
            r"\b(solve|simplify|equation|integral|derivative|worksheet|homework|traceback|syntaxerror|referenceerror)\b",
            text,
            flags=re.I,
        )
    ) or bool(re.search(r"[=][^=]", text) and re.search(r"[\dxy+\-*/^]", text, flags=re.I))


def find_date(text: str) -> str | None:
    patterns = (
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b",
        r"\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?\b",
    )

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return match.group(0)

    return None


def find_time(text: str) -> str | None:
    match = re.search(r"\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b", text, flags=re.I) or re.search(
        r"\b\d{1,2}:\d{2}\b", text
    )
    return match.group(0) if match else None


def find_url(text: str) -> str | None:
    match = re.search(r"https?://[^\s)]+", text, flags=re.I) or re.search(
        r"\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:/[^\s]*)?\b", text, flags=re.I
    )
    return match.group(0) if match else None


def find_phone(text: str) -> str | None:
    match = re.search(r"(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}", text)
    return match.group(0) if match else None


def find_email(text: str) -> str | None:
    match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, flags=re.I)
    return match.group(0) if match else None
