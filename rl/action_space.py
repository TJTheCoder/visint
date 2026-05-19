from __future__ import annotations

from typing import Iterable

ACTION_TYPES = (
    "ASK",
    "SEARCH",
    "TRANSLATE",
    "OPEN_LINK",
    "SOLVE",
    "ADD_CONTACT",
    "SAVE_EXPENSE",
    "SET_REMINDER",
    "ADD_EVENT",
)

ACTION_TYPE_TO_ID = {action_type: idx for idx, action_type in enumerate(ACTION_TYPES)}
ACTION_ID_TO_TYPE = {idx: action_type for action_type, idx in ACTION_TYPE_TO_ID.items()}
NUM_ACTIONS = len(ACTION_TYPES)
ALWAYS_ALLOWED_ACTION_IDS = (
    ACTION_TYPE_TO_ID["ASK"],
    ACTION_TYPE_TO_ID["SEARCH"],
)
HEURISTIC_PRIORITY = (
    ACTION_TYPE_TO_ID["ADD_EVENT"],
    ACTION_TYPE_TO_ID["SAVE_EXPENSE"],
    ACTION_TYPE_TO_ID["SET_REMINDER"],
    ACTION_TYPE_TO_ID["ADD_CONTACT"],
    ACTION_TYPE_TO_ID["SOLVE"],
    ACTION_TYPE_TO_ID["TRANSLATE"],
    ACTION_TYPE_TO_ID["OPEN_LINK"],
    ACTION_TYPE_TO_ID["SEARCH"],
    ACTION_TYPE_TO_ID["ASK"],
)


def normalize_allowed_action_ids(allowed_action_ids: Iterable[int]) -> list[int]:
    normalized = {int(action_id) for action_id in allowed_action_ids}
    normalized.update(ALWAYS_ALLOWED_ACTION_IDS)
    validated = sorted(action_id for action_id in normalized if 0 <= action_id < NUM_ACTIONS)
    return validated


def is_valid_action_id(action_id: int) -> bool:
    return 0 <= int(action_id) < NUM_ACTIONS


def fallback_action_id(allowed_action_ids: Iterable[int]) -> int:
    normalized = normalize_allowed_action_ids(allowed_action_ids)

    for action_id in HEURISTIC_PRIORITY:
        if action_id in normalized:
            return action_id

    return ACTION_TYPE_TO_ID["SEARCH"]
