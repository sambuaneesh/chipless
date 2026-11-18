import { useEffect, useState } from 'preact/hooks'
import type { EvalResult, ExportS, Snap } from './types'
import { local } from './prefs'

/** Everything the UI renders from. One store, plain subscribe/notify. */
export const store = {
  s: null as Snap | null,
  role: 'guest' as 'host' | 'player' | 'guest',
  me: null as number | null,
  online: false,
  everConnected: false,
  toast: null as { text: string; at: number } | null,
  evalResult: null as EvalResult | null,
  exported: null as ExportS | null,
  /** Server clock minus local clock, for timers. */
  skew: 0,
}

const listeners = new Set<() => void>()
const stateHooks = new Set<(prev: Snap | null, next: Snap) => void>()

function notify() { listeners.forEach((f) => f()) }

export function useStore() {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((x) => x + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return store
}

/** Called with (previous, next) on every new snapshot — for sounds, animation, announcements. */
export function onState(f: (prev: Snap | null, next: Snap) => void) { stateHooks.add(f) }

export function toast(text: string) {
  store.toast = { text, at: Date.now() }
  notify()
  setTimeout(() => {
    if (store.toast && Date.now() - store.toast.at >= 3400) { store.toast = null; notify() }
  }, 3500)
}

// --------------------------------------------------------------------- tokens

const params = new URLSearchParams(location.search)
const urlHost = params.get('host')
if (urlHost) {
  local('chipless.host', urlHost)
  history.replaceState(null, '', location.pathname)
}
export const hostToken = urlHost || local('chipless.host')
const SEAT_KEY = 'chipless.seat'

// --------------------------------------------------------------------- socket

let ws: WebSocket | null = null
let lastMsg = 0
let retry = 0
let timer: number | undefined

function url() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
}

export function connect() {
  clearTimeout(timer)
  try { ws?.close() } catch { /* ignore */ }
  const sock = new WebSocket(url())
  ws = sock
  sock.onopen = () => {
    retry = 0
    lastMsg = Date.now()
    sock.send(JSON.stringify({ t: 'hello', host: hostToken, seat: local(SEAT_KEY) }))
  }
  sock.onmessage = (ev) => {
    if (sock !== ws) return
    lastMsg = Date.now()
    let m: any
    try { m = JSON.parse(ev.data) } catch { return }
    switch (m.t) {
      case 'welcome':
        store.role = m.role
        store.me = m.id ?? null
        if (!store.online) { store.online = true; store.everConnected = true }
        notify()
        break
      case 'seat':
        local(SEAT_KEY, m.token)
        store.me = m.id
        notify()
        break
      case 'state': {
        const prev = store.s
        store.s = m.s as Snap
        store.skew = m.s.now - Date.now()
        store.online = true
        store.everConnected = true
        stateHooks.forEach((f) => f(prev, m.s))
        notify()
        break
      }
      case 'eval':
        store.evalResult = m.r
        notify()
        break
      case 'export':
        store.exported = m as ExportS
        notify()
        break
      case 'error':
        toast(m.msg)
        errorHooks.forEach((f) => f(m.msg))
        break
    }
  }
  sock.onclose = () => {
    if (sock !== ws) return
    store.online = false
    notify()
    retry = Math.min(retry + 1, 8)
    timer = window.setTimeout(connect, Math.min(400 * retry, 4000))
  }
  sock.onerror = () => { try { sock.close() } catch { /* ignore */ } }
}

const errorHooks = new Set<(msg: string) => void>()
export function onError(f: (msg: string) => void) { errorHooks.add(f) }

// Health check: iOS/Android can leave a dead socket looking OPEN after sleep.
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  if (Date.now() - lastMsg > 12_000) { connect(); return }
  ws.send('{"t":"ping"}')
}, 4000)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (!ws || ws.readyState !== WebSocket.OPEN || Date.now() - lastMsg > 6000) connect()
})
window.addEventListener('online', () => connect())

export function send(m: Record<string, unknown>) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast('Reconnecting… try again in a moment')
    connect()
    return false
  }
  ws.send(JSON.stringify(m))
  return true
}

/** Host-only command. */
export const cmd = (c: string, extra: Record<string, unknown> = {}) => send({ t: 'cmd', c, ...extra })

export function act(id: number, move: 'fold' | 'check' | 'call' | 'raise', to = 0) {
  return send({ t: 'act', id, move, to, seq: store.s?.seq })
}

export const undo = () => send({ t: 'undo', seq: store.s?.seq })

export function forgetSeat() {
  local(SEAT_KEY, null)
  send({ t: 'leave' })
}
