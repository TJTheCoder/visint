# Visint Phase 3 RL

This directory contains the local Phase 3 recommendation sidecar.

Components:
- `policy_server.py`: FastAPI service on `127.0.0.1:8765`
- `train_online.py`: AMAGO-backed sequence policy and online training loop
- `replay_store.py`: JSONL replay persistence
- `featurizer.py`: deterministic observation vector builder
- `action_space.py`: fixed 9-action universe and masking helpers
- `visint_env.py`: minimal Gymnasium-compatible wrapper

Expected setup for the current vanilla-attention path:
1. `conda activate visint`
2. `pip install -e ../amago`
3. `pip install fastapi uvicorn pydantic numpy torch gymnasium==0.29.1`
4. `uvicorn rl.policy_server:app --host 127.0.0.1 --port 8765`

The trainer falls back to heuristic recommendations until enough feedback exists,
but the policy network itself uses AMAGO timestep and trajectory encoders.

FlashAttention can be revisited later once the local CUDA toolchain and PyTorch
wheel are aligned for a clean `flash-attn` build.
