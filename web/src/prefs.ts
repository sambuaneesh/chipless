/** Per-device preferences (localStorage, failure-tolerant). */
export interface Prefs {
  sound: boolean
  voice: boolean
  face: boolean
  fourColor: boolean
  haptics: boolean
}

const KEY = 'chipless.prefs'

function load(host: boolean): Prefs {
  const d: Prefs = { sound: host, voice: host, face: false, fourColor: false, haptics: true }
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return d
  }
}

export let prefs: Prefs = load(false)

export function initPrefs(host: boolean) { prefs = load(host) }

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v }
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
}

/** Hints retire after being shown a few times on this device. */
export function hintSeen(key: string, limit: number): boolean {
  try {
    const n = Number(localStorage.getItem('chipless.hint.' + key) || 0)
    return n >= limit
  } catch {
    return false
  }
}

export function markHint(key: string) {
  try {
    const k = 'chipless.hint.' + key
    localStorage.setItem(k, String(Number(localStorage.getItem(k) || 0) + 1))
  } catch { /* ignore */ }
}

export function local(key: string, v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(key)
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
  } catch { /* ignore */ }
  return v ?? null
}
