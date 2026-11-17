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

export type Sfx = 'chip' | 'check' | 'fold' | 'allin' | 'win' | 'turn' | 'deal' | 'street' | 'error'

export function play(s: Sfx) {
  if (!prefs.sound || !ctx) return
  const t = ctx.currentTime + 0.01
  switch (s) {
    case 'chip': clack(t); clack(t + 0.05, 0.7); break
    case 'check': tone(t, 210, 0.07, 0.25, 'triangle'); tone(t + 0.09, 190, 0.07, 0.2, 'triangle'); break
    case 'fold': noise(t, 0.16, 900, 0.7, 0.25); break
    case 'allin': tone(t, 90, 0.35, 0.6, 'sine', -40); for (let i = 0; i < 6; i++) clack(t + 0.05 + i * 0.045, 0.8); break
    case 'win': for (let i = 0; i < 9; i++) clack(t + i * 0.035, 0.7); tone(t + 0.3, 784, 0.25, 0.18); tone(t + 0.42, 1175, 0.4, 0.15); break
    case 'turn': tone(t, 659, 0.18, 0.2); tone(t + 0.13, 988, 0.3, 0.17); break
    case 'deal': for (let i = 0; i < 10; i++) noise(t + i * 0.028, 0.025, 2500 + i * 120, 1, 0.22); break
    case 'street': noise(t, 0.05, 1800, 1, 0.3); noise(t + 0.08, 0.05, 2000, 1, 0.3); break
    case 'error': tone(t, 220, 0.12, 0.2, 'square'); break
  }
}
