# Realtime voice agent (LiveKit Agents)

Same persona, speech-to-text, LLM and local Kokoro voice as `../realtime` (Pipecat), so the two frameworks compare like for like.

## Run locally (no LiveKit server needed)
1. Run the Pipecat agent once first so the Kokoro model files exist in `~/.cache/pipecat/kokoro-onnx`.
2. `cd realtime-livekit`, copy `.env.example` to `.env`, set `GROQ_API_KEY`.
3. `uv run agent.py console` and talk. It uses your computer's mic and speakers directly in the terminal.

## Run with a browser (needs LiveKit)
`uv run agent.py dev` connects to a LiveKit server. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env` (LiveKit Cloud free plan, or a local `livekit-server --dev`), then join the room from LiveKit's Agents Playground.
