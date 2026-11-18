import { prefs } from './prefs'

/** All sounds are synthesized: zero audio files, a few hundred bytes of code. */
let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* no audio */ }
}

function noise(t: number, dur: number, freq: number, q: number, gain: number) {
  if (!ctx) return
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(t)
}

function tone(t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slide = 0) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t); o.stop(t + dur + 0.02)
}

const clack = (t: number, k = 1) => { noise(t, 0.035, 3200, 1.2, 0.5 * k); noise(t + 0.004, 0.02, 6000, 2, 0.25 * k) }

/** Rising whoosh: band-passed noise sweeping up, cut sharply at the end (tension before a hit). */
function riser(t: number, dur: number, gain: number, from = 300, to = 4200) {
  if (!ctx) return
  const len = Math.floor(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'; f.Q.value = 2.2
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.92)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(t)
}

/** Deep hit: a sine drop, felt more than heard. */
const boom = (t: number, gain = 0.7) => { tone(t, 110, 0.5, gain, 'sine', -70); noise(t, 0.08, 180, 0.8, gain * 0.6) }
const chord = (t: number, notes: number[], dur: number, gain: number, type: OscillatorType = 'triangle', gap = 0) =>
  notes.forEach((f, i) => tone(t + i * gap, f, dur, gain, type))
const cascade = (t: number, n: number, k = 0.75, gap = 0.032) => { for (let i = 0; i < n; i++) clack(t + i * gap + Math.random() * 0.01, k * (0.7 + Math.random() * 0.3)) }

export type Sfx = 'chip' | 'check' | 'fold' | 'allin' | 'win' | 'turn' | 'deal' | 'street' | 'error' | 'bet' | 'bigbet' | 'bigwin' | 'heartbeat' | 'card'

/**
 * Play a sound. [level] 0..1 scales bets and wins: a min-bet clicks, a pot-sized bet
 * swells, an overbet hits hard. Drama off keeps everything at the quiet level.
 */
export function play(s: Sfx, level = 0) {
  if (!prefs.sound || !ctx) return
  const t = ctx.currentTime + 0.01
  const k = prefs.drama ? Math.max(0, Math.min(1, level)) : 0
  switch (s) {
    case 'chip': clack(t); clack(t + 0.05, 0.7); break
    case 'bet':
      cascade(t, 2 + Math.round(k * 5))
      if (k >= 0.5) tone(t + 0.02, 150, 0.22, 0.25 + k * 0.2, 'sine', -50)
      break
    case 'bigbet':
      riser(t, 0.45, 0.22 + 0.15 * k)
      boom(t + 0.45, 0.5 + 0.3 * k)
      cascade(t + 0.46, 6 + Math.round(k * 4))
      break
    case 'check': tone(t, 210, 0.07, 0.25, 'triangle'); tone(t + 0.09, 190, 0.07, 0.2, 'triangle'); break
    case 'fold': noise(t, 0.16, 900, 0.7, 0.25); break
    case 'allin':
      if (!prefs.drama) { tone(t, 90, 0.35, 0.6, 'sine', -40); cascade(t + 0.05, 6, 0.8, 0.045); break }
      riser(t, 0.7, 0.35)
      boom(t + 0.7, 0.9)
      chord(t + 0.7, [110, 131, 165], 0.9, 0.09, 'sawtooth')
      cascade(t + 0.72, 12, 0.85, 0.028)
      break
    case 'win': cascade(t, 9, 0.7, 0.035); tone(t + 0.3, 784, 0.25, 0.18); tone(t + 0.42, 1175, 0.4, 0.15); break
    case 'bigwin':
      cascade(t, 18, 0.75, 0.03)
      chord(t + 0.25, [523, 659, 784, 1047], 0.5, 0.14, 'triangle', 0.09)
      chord(t + 0.7, [523, 659, 784, 1047], 0.9, 0.08, 'sine')
      break
    case 'heartbeat': for (let i = 0; i < 3; i++) { tone(t + i * 0.8, 62, 0.16, 0.7, 'sine', -20); tone(t + i * 0.8 + 0.2, 56, 0.2, 0.55, 'sine', -20) } break
    case 'turn': tone(t, 659, 0.18, 0.2); tone(t + 0.13, 988, 0.3, 0.17); break
    case 'deal': for (let i = 0; i < 10; i++) noise(t + i * 0.028, 0.025, 2500 + i * 120, 1, 0.22); break
    case 'card': noise(t, 0.05, 2600, 1, 0.3); noise(t + 0.03, 0.04, 1800, 1, 0.2); break
    case 'street': noise(t, 0.05, 1800, 1, 0.3); noise(t + 0.08, 0.05, 2000, 1, 0.3); break
    case 'error': tone(t, 220, 0.12, 0.2, 'square'); break
  }
}
