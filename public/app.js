const $ = (id) => document.getElementById(id)
const log = $('log'), mic = $('mic'), status = $('status')
const QUESTIONS = [
  'What should we know about your life story?',
  "What's your #1 superpower?",
  'What are the top 3 areas you’d like to grow in?',
  'What misconception do your coworkers have about you?',
  'How do you push your boundaries and limits?',
]
const history = []
let recorder, stream, chunks = [], timer, audio, busy = false, gen = 0

const say = (t) => (status.textContent = t)
function add(who, text) {
  const d = document.createElement('div')
  d.className = 'msg ' + (who === 'you' ? 'you' : 'bot')
  d.innerHTML = '<small></small><span></span>'
  d.firstChild.textContent = who === 'you' ? 'You' : 'Sudhanshu'
  d.lastChild.textContent = text
  log.append(d)
  d.scrollIntoView({ block: 'nearest' })
}

function stopSpeaking() {
  gen++
  audio?.pause()
  speechSynthesis?.cancel()
  audio = null
}

async function post(path, body) {
  const r = await fetch('/api/' + path, body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (r.status === 429) throw new Error("I've had a lot of questions in a short time. Please try again in a few minutes.")
  if (!r.ok) throw new Error('Something went wrong. Please try again.')
  return r
}

// Split into a short first chunk (so audio starts fast) and larger chunks after it; all are fetched in parallel.
function chunk(text) {
  const out = []
  for (const x of text.match(/[^.!?]+[.!?]*\s*/g) || [text]) {
    if (out.length && out.length > 1 && out.at(-1).length + x.length < 250) out[out.length - 1] += x
    else out.push(x)
  }
  return out
}

async function speak(text, onStart) {
  const my = ++gen
  const parts = chunk(text)
  const blobs = parts.map((t) => post('tts', { text: t }).then((r) => r.blob()))
  blobs.forEach((p) => p.catch(() => {})) // errors are handled when each chunk is awaited
  let started = false
  for (let i = 0; i < parts.length; i++) {
    if (my !== gen) return
    let blob
    try {
      blob = await blobs[i]
    } catch {
      // Groq TTS unavailable: the browser's own voice reads the rest so the bot still talks.
      if (!started) onStart?.()
      if (my !== gen || !('speechSynthesis' in window)) return
      say('Speaking… tap the mic to interrupt')
      await new Promise((res) => {
        const u = new SpeechSynthesisUtterance(parts.slice(i).join(' '))
        u.onend = u.onerror = res
        speechSynthesis.speak(u)
      })
      return
    }
    if (my !== gen) return
    audio = new Audio(URL.createObjectURL(blob))
    if (!started) (started = true), onStart?.()
    say('Speaking… tap the mic to interrupt')
    await audio.play().catch(() => {})
    await new Promise((res) => ((audio.onended = res), (audio.onerror = res), (audio.onpause = res)))
  }
}

async function ask(question) {
  busy = true
  mic.disabled = true
  add('you', question)
  history.push({ role: 'user', content: question })
  try {
    say('Thinking…')
    const { reply } = await (await post('chat', { messages: history })).json()
    if (!reply) throw new Error('I had no answer to that. Please try again.')
    history.push({ role: 'assistant', content: reply })
    busy = false // so the mic can interrupt the spoken answer
    mic.disabled = false
    let shown = false
    const show = () => shown || ((shown = true), add('bot', reply))
    await speak(reply, show)
    show()
    if (recorder?.state !== 'recording') say('Tap the mic to ask another question')
  } catch (e) {
    history.pop()
    add('bot', e.message)
    say('Tap the mic to try again')
  } finally {
    busy = false
    mic.disabled = false
  }
}

async function start() {
  stopSpeaking()
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    say('Microphone blocked. Allow it in the browser, or type your question below.')
    return
  }
  chunks = []
  recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop())
    mic.classList.remove('rec')
    mic.setAttribute('aria-label', 'Start recording')
    const blob = new Blob(chunks, { type: recorder.mimeType })
    if (blob.size < 2000) return say("I didn't catch that. Tap the mic and try again.")
    busy = true
    mic.disabled = true
    say('Listening…')
    try {
      const form = new FormData()
      form.set('audio', blob, 'speech.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'))
      const { text } = await (await post('stt', form)).json()
      busy = false
      if (!text) return (mic.disabled = false), say("I didn't catch that. Tap the mic and try again.")
      await ask(text)
    } catch (e) {
      busy = false
      mic.disabled = false
      say(e.message)
    }
  }
  recorder.start()
  mic.classList.add('rec')
  mic.setAttribute('aria-label', 'Stop recording and send')
  say('Recording… tap again to send')
  timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 30000)
}

mic.onclick = () => {
  if (busy) return
  if (recorder?.state === 'recording') {
    clearTimeout(timer)
    recorder.stop()
  } else if (navigator.mediaDevices && window.MediaRecorder) start()
  else say('Voice recording is not supported in this browser. Please type your question below.')
}

$('form').onsubmit = (e) => {
  e.preventDefault()
  const q = $('text').value.trim()
  if (!q || busy) return
  $('text').value = ''
  stopSpeaking()
  ask(q)
}

for (const q of QUESTIONS) {
  const b = document.createElement('button')
  b.textContent = q
  b.onclick = () => !busy && (stopSpeaking(), ask(q))
  $('chips').append(b)
}
