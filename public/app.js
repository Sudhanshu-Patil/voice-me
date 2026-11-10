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
let recorder, stream, chunks = [], timer, busy = false, gen = 0, spoke = true

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
  speechSynthesis?.cancel()
}

async function post(path, body) {
  const r = await fetch('/api/' + path, body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (r.status === 429) throw new Error("I've had a lot of questions in a short time. Please try again in a few minutes.")
  if (!r.ok) throw new Error('Something went wrong. Please try again.')
  return r
}

// The browser's own speech engine: free, no quota, starts instantly. Prefers a natural English voice
// (Edge "Natural"/"Online" voices are very good; Indian English first), then Google, then any English one.
// shortcut: quality depends on the visitor's device; swap in a hosted TTS (ElevenLabs, Edge TTS) if a nicer voice is needed.
let voice
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang))
  const rank = (v) => (/Natural|Online/i.test(v.name) ? 0 : /Google/i.test(v.name) ? 2 : 4) + (/en[-_]IN/i.test(v.lang) ? 0 : /en[-_]US/i.test(v.lang) ? 1 : 2)
  voice = vs.sort((x, y) => rank(x) - rank(y))[0]
}
if ('speechSynthesis' in window) (pickVoice(), (speechSynthesis.onvoiceschanged = pickVoice))
// iOS Safari only lets speech start from a tap, so each tap primes it with a silent utterance.
const unlock = () => 'speechSynthesis' in window && speechSynthesis.speak(new SpeechSynthesisUtterance(''))

function playPart(text, my, onStart) {
  if (my !== gen || !('speechSynthesis' in window)) return onStart()
  return new Promise((res) => {
    const u = new SpeechSynthesisUtterance(text)
    if (voice) (u.voice = voice), (u.lang = voice.lang)
    u.onstart = onStart
    u.onend = u.onerror = res
    speechSynthesis.speak(u)
  })
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
    let bubble, pending = '', chain = Promise.resolve(), queued = 0, visible = false
    const paint = () => {
      if (!visible || !full.trim()) return
      if (!bubble) (add('bot', ''), (bubble = log.lastChild.lastChild))
      bubble.textContent = full
    }
    // Text appears when the voice starts, so what you read and what you hear stay in step.
    const onStart = () => ((visible = true), say('Speaking… tap the mic to interrupt'), paint())
    const queue = (text) => {
      queued++
      chain = chain.then(() => playPart(text, my, onStart))
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (my !== gen) return reader.cancel()
      const t = done ? '' : dec.decode(value, { stream: true })
      full += t
      pending += t
      paint()
      if (!done) {
        // emit each finished sentence (period + whitespace, so "0.5" is not split) once it is long enough
        for (let m; (m = pending.match(/^[\s\S]*?[.!?]\s+/)) && m[0].trim().length >= 20; ) {
          queue(m[0].trim())
          pending = pending.slice(m[0].length)
        }
        // Start the voice sooner: the first chunk may end at a comma/semicolon, or at a word break once long enough.
        const early = !queued && (pending.match(/^[\s\S]{25,}?[,;:]\s+/) || pending.match(/^[\s\S]{60,}?\s/))
        if (early) {
          queue(early[0].trim())
          pending = pending.slice(early[0].length)
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

// Ends the recording on its own: after you have spoken, ~1.3s of quiet means the question is over.
// shortcut: simple volume threshold (no real VAD model), so loud background noise can keep it open; tapping the mic always sends.
function autoStop(ctx, src) {
  const an = ctx.createAnalyser()
  an.fftSize = 1024
  src.connect(an)
  const buf = new Uint8Array(an.fftSize)
  const t0 = Date.now()
  let floor = 0, n = 0, heard = false, lastVoice = 0
  spoke = false
  const iv = setInterval(() => {
    if (recorder?.state !== 'recording') return clearInterval(iv)
    an.getByteTimeDomainData(buf)
    let sum = 0
    for (const v of buf) sum += ((v - 128) / 128) ** 2
    const rms = Math.sqrt(sum / buf.length)
    const now = Date.now()
    if (now - t0 < 400) return (floor += rms), n++ // first 0.4s measures the room's background level
    const level = Math.max(0.02, (floor / n) * 2.5)
    if (rms > level) (heard = spoke = true), (lastVoice = now)
    if (heard && now - lastVoice > 1300) (clearInterval(iv), recorder.stop())
    else if (!heard && now - t0 > 9000) (clearInterval(iv), recorder.stop()) // nobody spoke
  }, 60)
}

async function start() {
  stopSpeaking()
  unlock()
  const ctx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null
  ctx?.resume() // Safari only allows this inside the tap
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    ctx?.close()
    say('Microphone blocked. Allow it in the browser, or type your question below.')
    return
  }
  chunks = []
  recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.onstop = async () => {
    clearTimeout(timer)
    ctx?.close()
    stream.getTracks().forEach((t) => t.stop())
    mic.classList.remove('rec')
    mic.setAttribute('aria-label', 'Start recording')
    const blob = new Blob(chunks, { type: recorder.mimeType })
    if (blob.size < 2000 || !spoke) return say("I didn't catch that. Tap the mic and try again.")
    busy = true
    mic.disabled = true
    say('Got it, transcribing…')
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
  if (ctx) autoStop(ctx, ctx.createMediaStreamSource(stream))
  mic.classList.add('rec')
  mic.setAttribute('aria-label', 'Stop recording and send')
  say('Listening… just stop talking when you are done')
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
  unlock()
  ask(q)
}

for (const q of QUESTIONS) {
  const b = document.createElement('button')
  b.textContent = q
  b.onclick = () => !busy && (stopSpeaking(), unlock(), ask(q))
  $('chips').append(b)
}
