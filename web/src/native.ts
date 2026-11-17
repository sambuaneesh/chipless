import { prefs } from './prefs'

/** Bridge to the Android host app (absent in browsers). */
interface NativeApi {
  speak(text: string): void
  haptic(kind: string): void
  share(text: string): void
  keepAwake(on: boolean): void
}

const N: NativeApi | undefined = (window as unknown as { Native?: NativeApi }).Native
export const isNative = !!N

export function speak(text: string) {
  if (!prefs.voice) return
  if (N) return N.speak(text)
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch { /* unsupported */ }
}

const PATTERNS: Record<string, number | number[]> = { tick: 8, confirm: 18, reject: [30, 40, 30], heavy: [0, 45], turn: [0, 60, 80, 60] }

export function haptic(kind: 'tick' | 'confirm' | 'reject' | 'heavy' | 'turn') {
  if (!prefs.haptics) return
  if (N) return N.haptic(kind)
  try { navigator.vibrate?.(PATTERNS[kind]) } catch { /* iOS */ }
}

export async function share(text: string): Promise<'shared' | 'copied' | 'shown'> {
  if (N) { N.share(text); return 'shared' }
  try {
    if (navigator.share) { await navigator.share({ text }); return 'shared' }
  } catch { /* cancelled */ }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'shown'
  }
}

export function keepAwake(on: boolean) {
  if (N) return N.keepAwake(on)
}
