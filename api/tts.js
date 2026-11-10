import { groq, limited, err } from './_lib.js'

// Groq's TTS model may need one-time terms acceptance in console.groq.com; on any failure the page falls back to the browser voice.
export async function POST(req) {
  if (!process.env.GROQ_API_KEY) return err('offline', 503)
  if (limited(req)) return err('rate_limited', 429)
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 1000) : ''
  if (!text) return err('bad_request', 400)
  const r = await groq('audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.TTS_MODEL || 'canopylabs/orpheus-v1-english',
      voice: process.env.TTS_VOICE || 'troy',
      input: text,
      response_format: 'wav',
    }),
  }).catch(() => null)
  if (!r?.ok) {
    console.error('groq tts', r?.status, await r?.text().catch(() => ''))
    return err('tts_failed', 502)
  }
  return new Response(r.body, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
}
