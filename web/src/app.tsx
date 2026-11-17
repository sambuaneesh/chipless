import { useEffect, useState } from 'preact/hooks'
import { HostPanel } from './actions'
import { plan } from './fx'
import { MyPanel, Join } from './guest'
import { act, onError, onState, store, useStore } from './net'
import { haptic, keepAwake, speak } from './native'
import { prefs } from './prefs'
import { Calculator, Referee } from './referee'
import { Home, Setup, Waiting } from './setup'
import { SettleView, Sheets } from './sheets'
import { play, unlockAudio } from './sound'
import { Cue, Narrator, Ring, TopBar } from './table'
import type { Snap } from './types'
import { ui, uiSet, useUi } from './uistate'

// ------------------------------------------------------------------ side effects of state changes

const SOUND: Record<string, Parameters<typeof play>[0]> = {
  bet: 'chip', raise: 'chip', call: 'chip', check: 'check', fold: 'fold', allin: 'allin', win: 'win', hand: 'deal', street: 'street', runout: 'allin',
}

onState((prev, next) => {
  const after = plan(prev, next)
  if (after) setTimeout(() => requestAnimationFrame(after), 0)
  if (!prev) return
  // Sound for the newest log line.
  if (next.log.length && (prev.log.length !== next.log.length || prev.seq !== next.seq)) {
    const last = next.log[next.log.length - 1]
    const was = prev.log[prev.log.length - 1]
    if (!was || last.text !== was.text || last.h !== was.h) {
      const kinds = next.log.slice(-3).map((l) => l.kind)
      const k = kinds.includes('win') ? 'win' : last.kind
      if (SOUND[k]) play(SOUND[k])
    }
  }
  const h = next.hand
  const turnChanged = h && h.toAct != null && (prev.hand?.toAct !== h.toAct || prev.hand?.no !== h.no)
  if (turnChanged) {
    const p = next.players.find((x) => x.id === h!.toAct)
    if (store.role === 'host') {
      if (p) speak(`${p.name}, it's on you`)
      if (ui.actFor != null && ui.actFor !== h!.toAct) uiSet({ actFor: null })
    }
    if (store.me === h!.toAct) {
      haptic('turn'); play('turn')
      flashTitle()
    }
    uiSet({ raiseOpen: false })
  }
  runPreAction(next)
})

onError(() => { haptic('reject'); play('error') })

function runPreAction(s: Snap) {
  const h = s.hand
  if (!ui.pre || !h) return
  if (h.street === 'done' || h.street === 'showdown') { uiSet({ pre: null }); return }
  // A "check" pre-action is void once someone bets.
  if (ui.pre === 'check' && h.currentBet > ui.preBet) { uiSet({ pre: null }); return }
  if (h.toAct !== store.me || !h.legal) return
  const l = h.legal
  const pre = ui.pre
  uiSet({ pre: null })
  if (pre === 'checkfold') act(l.id, l.canCheck ? 'check' : 'fold')
  else if (pre === 'check' && l.canCheck) act(l.id, 'check')
  else if (pre === 'callany') act(l.id, l.canCall ? 'call' : 'check')
}

let flashT: number | undefined
function flashTitle() {
  const base = 'Chipless'
  let n = 0
  clearInterval(flashT)
  flashT = window.setInterval(() => {
    document.title = n++ % 2 ? base : '● Your turn'
    if (n > 8 || document.visibilityState === 'visible') { clearInterval(flashT); document.title = base }
  }, 700)
}

// ------------------------------------------------------------------ root

export function App() {
  const st = useStore()
  const u = useUi()
  const [newTable, setNewTable] = useState(false)
  const s = st.s
  const host = st.role === 'host'

  useEffect(() => { keepAwake(!!s && s.phase === 'play') }, [s?.phase])
  useEffect(() => { if (s?.phase === 'play') setNewTable(false) }, [s?.phase])

  let body
  if (!s) body = <Waiting text={st.everConnected ? 'Reconnecting to the table…' : 'Connecting to the table…'} />
  else if (s.phase === 'setup') body = host ? (newTable ? <Setup onBack={() => setNewTable(false)} /> : <Home onNew={() => setNewTable(true)} />) : <Waiting text="The host is setting up the table…" />
  else if (s.phase === 'ended') body = <SettleView s={s} />
  else if (host) body = <HostTable s={s} />
  else if (st.me == null) body = <Join s={s} />
  else body = <GuestTable s={s} />

  return (
    <div class={'app' + (prefs.fourColor ? ' four' : '')} onPointerDown={unlockAudio}>
      {body}
      <Sheets s={s} />
      {u.sheet?.k === 'referee' && s && <Referee s={s} />}
      {u.sheet?.k === 'calc' && <Calculator />}
      {st.toast && <div class="toast" role="alert">{st.toast.text}</div>}
    </div>
  )
}

function HostTable({ s }: { s: Snap }) {
  return (
    <div class="table host">
      <TopBar s={s} host />
      <Ring s={s} />
      <Cue s={s} />
      <Narrator s={s} />
      <HostPanel s={s} />
    </div>
  )
}

function GuestTable({ s }: { s: Snap }) {
  const h = s.hand
  const myTurn = !!h && h.street !== 'done' && h.toAct === store.me
  return (
    <div class={'table guest' + (myTurn ? ' myturn' : '')}>
      <TopBar s={s} host={false} />
      <Ring s={s} compact me={store.me} />
      <Cue s={s} />
      <Narrator s={s} />
      <MyPanel s={s} />
    </div>
  )
}
