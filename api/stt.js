import { groq, limited, err } from './_lib.js'

export async function POST(req) {
  if (!process.env.GROQ_API_KEY) return err('offline', 503)
  if (limited(req)) return err('rate_limited', 429)
  let audio
  try {
    audio = (await req.formData()).get('audio')
  } catch {
    return err('bad_request', 400)
  }
  if (!audio || typeof audio === 'string' || audio.size > 2_000_000) return err('bad_request', 400)
  const form = new FormData()
  form.set('file', audio, audio.name || 'speech.webm')
  form.set('model', process.env.STT_MODEL || 'whisper-large-v3-turbo')
  form.set('language', 'en')
  form.set('temperature', '0')
  const r = await groq('audio/transcriptions', { method: 'POST', body: form }).catch(() => null)
  if (!r?.ok) return err('stt_failed', 502)
  const { text } = await r.json()
  return Response.json({ text: (text || '').trim() })
}
