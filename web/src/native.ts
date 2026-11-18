import { prefs } from './prefs'

/** Bridge to the Android host app (absent in browsers). */
interface NativeApi {
  speak(text: string): void
  haptic(kind: string): void
  share(text: string): void
  keepAwake(on: boolean): void
  saveFile?(name: string, mime: string, text: string): void
  exit?(): void
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

/** Save a text file: the system "Save as" screen in the app, a download in browsers. */
export function saveFile(name: string, mime: string, text: string) {
  if (N?.saveFile) return N.saveFile(name, mime, text)
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const canExit = !!N?.exit
export function exitApp() { N?.exit?.() }

/** Speak regardless of the turn-callout setting (callers check their own setting). */
export function talk(text: string) {
  if (N) return N.speak(text)
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.08
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch { /* unsupported */ }
}

export function keepAwake(on: boolean) {
  if (N) return N.keepAwake(on)
}
