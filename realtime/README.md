# Realtime voice agent (Pipecat)

Same persona as the web app (`../persona.md`), but a live conversation: it answers as soon as you pause and you can interrupt it.

    mic -> Silero VAD -> Groq Whisper -> Groq LLM -> Kokoro TTS (local) -> speaker

## Run locally
1. `cd realtime`, copy `.env.example` to `.env`, set `GROQ_API_KEY`.
2. `uv run bot.py` (first run downloads the Kokoro voice model, about 300 MB).
3. Open http://localhost:7860/client in Chrome, click Connect, allow the mic and talk.

Speech-to-text is local Whisper by default (free, offline). First run downloads the model. On an NVIDIA GPU: `WHISPER_MODEL=small WHISPER_DEVICE=cuda WHISPER_COMPUTE=int8_float16`. `STT=groq` uses Groq's hosted Whisper instead.

Other options in `.env`: `TTS=groq` (Groq voice; free tier is only 3,600 tokens a day), `KOKORO_VOICE=am_michael`, `GROQ_MODEL`.

## Notes
- Public hosting needs an always-on process and relay (TURN) servers; see the plan in the main README.
- Local only for now: nothing here is deployed.
