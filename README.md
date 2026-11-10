# voice-me

A voice bot that answers interview questions as me. Tap the mic, speak, hear the answer. No sign-up or API keys for visitors.

Flow: browser mic -> `/api/stt` (Groq Whisper) -> `/api/chat` (Groq LLM + `persona.md`) -> browser voice (Groq TTS free tier is only 3,600 tokens/day).

## Deploy
1. Free key at console.groq.com. For TTS, accept the Orpheus model terms once in the Groq console.
2. Import this repo in Vercel, set `GROQ_API_KEY`.
3. Edit `persona.md` to make the bot yours.

Env (optional): `GROQ_MODEL`, `STT_MODEL`, `TTS_MODEL`, `TTS_VOICE`.
