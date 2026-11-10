// Shared by the three Groq proxies. The key lives only in Vercel env; the browser never sees it.
const hits = new Map()
// shortcut: per-instance memory resets on cold start; move to Upstash if abuse shows up.
export function limited(req, max = 40) {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > max
}
export const groq = (path, init) =>
  fetch(`https://api.groq.com/openai/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, ...init.headers },
  })
export const err = (error, status) => Response.json({ error }, { status })
