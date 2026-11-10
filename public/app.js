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

// Play one sentence: Groq voice, or the browser's own voice if Groq TTS fails, so the bot always talks.
async function playPart(p, text, my) {
  if (my !== gen) return
  let blob
  try {
    blob = await p
  } catch {
    if (my !== gen || !('speechSynthesis' in window)) return
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text)
      u.onend = u.onerror = res
      speechSynthesis.speak(u)
    })
  }
  if (my !== gen) return
  audio = new Audio(URL.createObjectURL(blob))
  await audio.play().catch(() => {})
  await new Promise((res) => ((audio.onended = res), (audio.onerror = res), (audio.onpause = res)))
}

async function ask(question) {
  busy = true
  mic.disabled = true
  add('you', question)
  history.push({ role: 'user', content: question })
  const my = ++gen
  let full = ''
  try {
    say('Thinking…')
    const r = await post('chat', { messages: history })
    busy = false // from here the mic can interrupt
    mic.disabled = false
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let bubble, pending = '', chain = Promise.resolve()
    const queue = (text) => {
      const p = post('tts', { text }).then((x) => x.blob())
      p.catch(() => {}) // failures are handled when this sentence's turn comes
      chain = chain.then(() => playPart(p, text, my))
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (my !== gen) return reader.cancel()
      const t = done ? '' : dec.decode(value, { stream: true })
      full += t
      pending += t
      if (full.trim() && !bubble) (add('bot', ''), (bubble = log.lastChild.lastChild))
      if (bubble) bubble.textContent = full
      if (!done) {
        say('Speaking… tap the mic to interrupt')
        // emit each finished sentence (period + whitespace, so "0.5" is not split) once it is long enough
        for (let m; (m = pending.match(/^[\s\S]*?[.!?]\s+/)) && m[0].trim().length >= 20; ) {
          queue(m[0].trim())
          pending = pending.slice(m[0].length)
        }
      } else {
        if (pending.trim()) queue(pending.trim())
        break
      }
    }
    if (!full.trim()) throw new Error('I had no answer to that. Please try again.')
    history.push({ role: 'assistant', content: full.trim() })
    await chain
    if (my === gen && recorder?.state !== 'recording') say('Tap the mic to ask another question')
  } catch (e) {
    if (!full.trim()) history.pop()
    add('bot', full.trim() ? 'Sorry, I lost my connection mid-answer.' : e.message)
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
