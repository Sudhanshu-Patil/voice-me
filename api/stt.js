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
  form.set('response_format', 'verbose_json') // per-segment confidence, used to drop non-speech
  const r = await groq('audio/transcriptions', { method: 'POST', body: form }).catch(() => null)
  if (!r?.ok) return err('stt_failed', 502)
  const { text, segments = [] } = await r.json()
  // Whisper invents text for silence and music. Drop it when every segment looks like non-speech.
  const real = segments.filter((s) => s.no_speech_prob < 0.6 && s.avg_logprob > -1.0)
  const t = (real.length ? real.map((s) => s.text).join('') : segments.length ? '' : text || '').trim()
  const junk = /^(thank you[.!]?|thanks for watching[.!]?|bye[.!]?|you)$/i.test(t)
  return Response.json({ text: junk ? '' : t })
}
