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
let recorder, stream, chunks = [], timer, audio, busy = false

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

async function speak(text) {
  try {
    const r = await post('tts', { text })
    audio = new Audio(URL.createObjectURL(await r.blob()))
    say('Speaking… tap the mic to interrupt')
    await audio.play()
    await new Promise((res) => ((audio.onended = res), (audio.onerror = res), (audio.onpause = res)))
  } catch {
    // Groq TTS unavailable: use the browser's own voice so the bot still talks.
    if (!('speechSynthesis' in window)) return
    say('Speaking… tap the mic to interrupt')
    await new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text)
      u.onend = u.onerror = res
      speechSynthesis.speak(u)
    })
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
    add('bot', reply)
    mic.disabled = false
    busy = false // so the mic can interrupt the spoken answer
    await speak(reply)
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
