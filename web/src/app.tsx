import { useEffect, useState } from 'preact/hooks'
import { HostPanel } from './actions'
import { plan } from './fx'
import { MyPanel, Join } from './guest'
import { act, onError, onState, store, useStore } from './net'
import { haptic, keepAwake, talk } from './native'
import { chips } from './fmt'
import { prefs } from './prefs'
import { BoardEditor, Calculator, Referee } from './referee'
import { Home, Setup, Waiting } from './setup'
import { SettleView, Sheets } from './sheets'
import { play, unlockAudio } from './sound'
import { Cue, Narrator, Ring, Timeline, TopBar } from './table'
import type { LogLine, Snap } from './types'
import { ui, uiSet, useUi } from './uistate'

// ------------------------------------------------------------------ side effects of state changes

/** Log lines that arrived with this snapshot (the log is a sliding window, so match the old tail). */
function fresh(prev: Snap, next: Snap): LogLine[] {
  const pl = prev.log, nl = next.log
  if (!pl.length) return nl.slice(-2)
  const last = pl[pl.length - 1]
  for (let i = nl.length - 1; i >= 0; i--) {
    const l = nl[i]
    if (l.h === last.h && l.text === last.text && l.kind === last.kind) return nl.slice(i + 1)
  }
  return nl.slice(-1)
}

const ACTION = new Set(['bet', 'raise', 'call', 'check', 'fold', 'allin'])
let flashT: number | undefined

/** Sound, voice and the on-table banner for what just happened. */
function announceLines(prev: Snap, next: Snap, lines: LogLine[]) {
  const name = (id: number | null) => next.players.find((p) => p.id === id)?.name ?? ''
  const ph = prev.hand
  const pot = ph && ph.street !== 'done' ? ph.total : 0
  const bb = next.hand?.bb ?? next.cfg.bb
  const said: string[] = []
  const best = { sfx: null as Parameters<typeof play>[0] | null, level: 0, weight: -1 }
  let flash: typeof ui.flash = null
  const pick = ([sfx, level]: [Parameters<typeof play>[0], number], weight: number) => {
    if (weight >= best.weight) Object.assign(best, { sfx, level, weight })
  }
  for (const l of lines) {
    const who = name(l.who)
    if (ACTION.has(l.kind) && l.who != null) {
      // How big is this bet, compared with the pot it went into? 1 = pot-sized or more.
      const size = l.by > 0 ? Math.min(1, l.by / Math.max(pot, bb * 2)) : 0
      const big = size >= 0.9
      if (l.kind === 'allin') { pick(['allin', 1], 5); said.push(`${who} is all in${l.amt ? ` for ${chips(l.amt)}` : ''}!`) }
      else if (l.kind === 'bet' || l.kind === 'raise') {
        pick([big ? 'bigbet' : 'bet', size], 4)
        const verb = l.kind === 'bet' ? `bets ${chips(l.amt)}` : `raises by ${chips(l.by)}, to ${chips(l.amt)}`
        said.push(`${who} ${verb}${big ? (l.by > pot && pot > 0 ? '. More than the pot!' : '. Pot-sized!') : '.'}`)
      } else if (l.kind === 'call') { pick(['bet', 0], 2); said.push(`${who} calls ${chips(l.amt)}.`) }
      else if (l.kind === 'check') { pick(['check', 0], 1); said.push(`${who} checks.`) }
      else if (l.kind === 'fold') { pick(['fold', 0], 1); said.push(`${who} folds.`) }
      const sub = l.kind === 'raise' ? `raises to ${chips(l.amt)}` : l.kind === 'bet' ? `bets ${chips(l.amt)}`
        : l.kind === 'call' ? `calls ${chips(l.amt)}` : l.kind === 'allin' ? `all-in · ${chips(l.amt)}` : l.kind === 'check' ? 'checks' : 'folds'
      flash = { key: Date.now(), who: l.who, kind: big && l.kind !== 'allin' ? 'big' : l.kind, title: who, sub: sub + (l.by > 0 && l.kind === 'raise' ? ` · +${chips(l.by)}` : '') }
    } else if (l.kind === 'win') {
      const huge = l.amt >= next.cfg.stack
      pick([huge ? 'bigwin' : 'win', 1], 6)
      if (!said.some((x) => x.includes(' wins '))) said.push(l.text.replace(/ — everyone else folded/, '').replace(/\.$/, '!'))
      flash = { key: Date.now(), who: l.who, kind: 'win', title: who, sub: `wins ${chips(l.amt)}` }
    } else if (l.kind === 'runout') { pick(['heartbeat', 1], 3); said.push('All in! Let\'s see the cards.') }
    else if (l.kind === 'hand') pick(['deal', 0], 0)
    else if (l.kind === 'street') pick(['street', 0], 0)
    else if (l.kind === 'board') pick(['card', 0], 0)
  }
  if (best.sfx) play(best.sfx, best.level)
  if (lines.some((l) => l.kind === 'allin')) haptic('heavy')
  if (flash) {
    uiSet({ flash })
    clearTimeout(flashT)
    flashT = window.setTimeout(() => uiSet({ flash: null }), flash.kind === 'allin' || flash.kind === 'win' || flash.kind === 'big' ? 2600 : 1600)
  }
  return prefs.callBets ? said : []
}

onState((prev, next) => {
  const after = plan(prev, next)
  if (after) setTimeout(() => requestAnimationFrame(after), 0)
  if (!prev) return
  const undone = !!next.notice && next.notice !== prev.notice
  const said = undone ? [] : announceLines(prev, next, fresh(prev, next))
  const h = next.hand
  const turnChanged = h && h.toAct != null && (prev.hand?.toAct !== h.toAct || prev.hand?.no !== h.no)
  if (turnChanged) {
    const p = next.players.find((x) => x.id === h!.toAct)
    if (store.role === 'host') {
      if (p && prefs.voice) said.push(`${p.name}, it's on you.`)
      if (ui.actFor != null && ui.actFor !== h!.toAct) uiSet({ actFor: null })
    }
    if (store.me === h!.toAct) {
      haptic('turn'); play('turn')
      flashTitle()
    }
    uiSet({ raiseOpen: false })
  }
  if (said.length) talk(said.join(' '))
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

let titleT: number | undefined
function flashTitle() {
  const base = 'Chipless'
  let n = 0
  clearInterval(titleT)
  titleT = window.setInterval(() => {
    document.title = n++ % 2 ? base : '● Your turn'
    if (n > 8 || document.visibilityState === 'visible') { clearInterval(titleT); document.title = base }
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
      {u.sheet?.k === 'board' && s && <BoardEditor s={s} />}
      {st.toast && <div class="toast" role="alert">{st.toast.text}</div>}
    </div>
  )
}

function HostTable({ s }: { s: Snap }) {
  return (
    <div class="table host">
      <TopBar s={s} host />
      <Ring s={s} />
      <Timeline s={s} />
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
      <Timeline s={s} />
      <Cue s={s} />
      <Narrator s={s} />
      <MyPanel s={s} />
    </div>
  )
}
