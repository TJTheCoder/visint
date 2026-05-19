from __future__ import annotations

import gymnasium as gym
import numpy as np

from .action_space import NUM_ACTIONS
from .featurizer import FEATURE_DIM


class VisintRecommendationEnv(gym.Env):
    """Minimal Gymnasium-compatible wrapper for the Phase 3 recommendation task."""

    metadata = {"render_modes": []}

    def __init__(self) -> None:
        super().__init__()
        self.action_space = gym.spaces.Discrete(NUM_ACTIONS)
        self.observation_space = gym.spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(FEATURE_DIM,),
            dtype=np.float32,
        )

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        return np.zeros((FEATURE_DIM,), dtype=np.float32), {}

    def step(self, action):
        return np.zeros((FEATURE_DIM,), dtype=np.float32), 0.0, True, False, {"action": action}
