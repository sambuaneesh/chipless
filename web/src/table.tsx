import { useEffect, useState } from 'preact/hooks'
import { chips, clock, initials, seatColor } from './fmt'
import { store, undo } from './net'
import { hintSeen, markHint } from './prefs'
import type { HandS, PlayerS, Snap } from './types'
import { openSheet } from './uistate'
import { Card, ChipStack, Icon, IconBtn } from './ui'

/** Seat angle (degrees, screen coords): index 0 at the bottom, clockwise. */
export const seatAngle = (i: number, n: number) => 90 + (i * 360) / n

function pos(i: number, n: number, rx: number, ry: number) {
  const a = (seatAngle(i, n) * Math.PI) / 180
  return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` }
}

export function Ring({ s, compact, me }: { s: Snap; compact?: boolean; me?: number | null }) {
  const h = s.hand
  const n = s.players.length
  return (
    <div class={'ring' + (compact ? ' compact' : '')}>
      <div class="felt" />
      <Center s={s} />
      {s.players.map((p, i) => {
        const bet = h?.bets[p.id]
        return (
          <>
            <Seat p={p} s={s} i={i} me={me} style={pos(i, n, 41, compact ? 38 : 41)} />
            {bet ? (
              <div class="bet" data-bet={p.id} style={pos(i, n, 25, compact ? 21 : 23)}>
                <ChipStack amount={bet} sb={h!.sb} max={4} />
                <span>{chips(bet)}</span>
              </div>
            ) : null}
          </>
        )
      })}
    </div>
  )
}

function Seat({ p, s, i, me, style }: { p: PlayerS; s: Snap; i: number; me?: number | null; style: Record<string, string> }) {
  const h = s.hand
  const inHand = !!h && h.dealt.includes(p.id)
  const folded = !!h && h.folded.includes(p.id)
  const open = !!h && h.street !== 'done'
  const turn = h?.toAct === p.id
  const allIn = open && inHand && !folded && p.stack === 0
  const winner = h?.street === 'done' && h.results.some((r) => r.winners.includes(p.id))
  const label = open ? h?.labels[String(p.id)] : undefined
  const isBtn = (h && open ? h.button : s.button) === p.id
  const out = p.out || (p.stack === 0 && !inHand) || p.waiting
  const host = store.role === 'host'
  const conn = p.conn === 'on' ? 'on' : p.conn === 'off' ? (p.seen && store.s && store.s.now - p.seen < 30_000 ? 'wait' : 'off') : null
  const cls = ['seat', turn && 'turn', folded && 'folded', allIn && 'allin', winner && 'winner', out && 'out', me === p.id && 'mine'].filter(Boolean).join(' ')
  const status = p.out ? 'Sitting out' : p.waiting ? 'Waits for BB' : p.post ? 'Posts BB next' : p.stack === 0 && !inHand ? 'Out of chips' : null
  return (
    <button class={cls} style={{ ...style, '--c': seatColor(i) }} data-seat={p.id}
      aria-label={`${p.name}, ${chips(p.stack)} chips${turn ? ', to act' : ''}${folded ? ', folded' : ''}`}
      onClick={() => host && openSheet({ k: 'seat', id: p.id })} tabIndex={host ? 0 : -1}>
      <span class="avatar"><span>{initials(p.name)}</span>
        {isBtn && <i class="dealer" title="Dealer button">D</i>}
        {conn && <i class={'conn ' + conn} title={conn === 'on' ? 'Connected' : 'Phone disconnected'} />}
      </span>
      <span class="nm">{p.name}</span>
      <span class="st">{allIn ? 'ALL-IN' : chips(p.stack)}</span>
      {open && h && (p.id === h.sbId || p.id === h.bbId) && !label && (
        <span class="blind">{p.id === h.bbId ? 'BB' : 'SB'}</span>
      )}
      {label && <span class="lbl">{label}</span>}
      {!open && status && <span class="lbl muted">{status}</span>}
    </button>
  )
}

function Center({ s }: { s: Snap }) {
  const h = s.hand
  if (!h) {
    return (
      <div class="center" id="pot">
        <div class="potl">Ready</div>
        <div class="potsub">Blinds {chips(s.timer?.sb ?? s.cfg.sb)}/{chips(s.timer?.bb ?? s.cfg.bb)}</div>
      </div>
    )
  }
  if (h.street === 'done') {
    const name = (id: number) => s.players.find((p) => p.id === id)?.name ?? '?'
    const r = h.results
    const first = r[0]
    const sc = first && h.scores[String(first.winners[0])]
    return (
      <div class="center done" id="pot">
        <div class="potl">{r.length > 1 ? `${r.length} pots` : first && first.winners.length > 1 ? 'Split pot' : 'Winner'}</div>
        <div class="winline">{[...new Set(r.flatMap((x) => x.winners))].map(name).join(' & ')}</div>
        <div class="potsub">{chips(h.total)}{sc ? ` · ${sc.cat}` : ''}</div>
        {sc && <div class="board">{sc.best.map((c) => <Card c={c} small />)}</div>}
      </div>
    )
  }
  const reached = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, done: 5 }[h.street]
  const shown = h.runout ? 5 : reached
  return (
    <div class="center" id="pot">
      <div class="board slots" aria-label={`${streetName(h)} — ${reached} board cards`}>
        {[0, 1, 2, 3, 4].map((i) => <span class={'slot' + (i < reached ? ' on' : i < shown ? ' next' : '')} />)}
      </div>
      <div class="potv">{chips(h.total)}</div>
      <div class="potl">{streetName(h)}</div>
      {h.pots.length > 1 && <div class="potsub">{h.pots.map((p, i) => `${i === 0 ? 'Main' : 'Side'} ${chips(p.amount)}`).join(' · ')}</div>}
    </div>
  )
}

export function streetName(h: HandS) {
  if (h.runout && h.street === 'showdown') return 'All-in'
  return ({ preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', done: 'Done' } as const)[h.street]
}

export function Cue({ s }: { s: Snap }) {
  if (!s.cue) return null
  return (
    <div class="cue" role="status">
      <span class="cue-ico"><Icon name="cards" size={18} /></span>
      <span><b>Dealer</b> {s.cue}</span>
    </div>
  )
}

/** The narrator: last thing that happened, what to do now, and an optional hint. */
export function Narrator({ s }: { s: Snap }) {
  const last = s.log.length ? s.log[s.log.length - 1] : null
  const hint = s.hint
  const limit = s.cfg.teach === 'beginner' ? 6 : s.cfg.teach === 'mixed' ? 2 : 0
  const [shownKey, setShownKey] = useState<string | null>(null)
  const showHint = !!hint && limit > 0 && (shownKey === hint.key || !hintSeen(hint.key, limit))
  useEffect(() => {
    if (showHint && hint && shownKey !== hint.key) { markHint(hint.key); setShownKey(hint.key) }
  }, [hint?.key, showHint])
  return (
    <button class="narr" onClick={() => openSheet({ k: 'history' })} aria-live="polite" aria-label="Table narrator — open history">
      {s.notice ? <div class="notice"><Icon name="undo" size={14} /> {s.notice}</div> : last && <div class="last">{last.text}</div>}
      <div class="prompt">{s.prompt}</div>
      {showHint && hint && <div class="hint"><Icon name="info" size={14} /> {hint.text}</div>}
    </button>
  )
}

export function TopBar({ s, host }: { s: Snap; host: boolean }) {
  const t = s.timer
  const [, tick] = useState(0)
  useEffect(() => {
    if (!t?.running) return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [t?.running])
  const left = t ? (t.running && t.endsAt ? t.endsAt - (Date.now() + store.skew) : t.left) : 0
  const sb = s.hand && s.hand.street !== 'done' ? s.hand.sb : t ? t.sb : s.cfg.sb
  const bb = s.hand && s.hand.street !== 'done' ? s.hand.bb : t ? t.bb : s.cfg.bb
  const canUndo = host ? s.undo.host : s.undo.by != null && s.undo.by === store.me
  return (
    <header class="topbar">
      <div class="tb-info">
        <b>{s.handNo ? `Hand ${s.handNo}` : 'New table'}</b>
        <span>Blinds {chips(sb)}/{chips(bb)}</span>
        {t && (
          <button class={'timer' + (left <= 0 ? ' up' : '')} onClick={() => host && openSheet({ k: 'blinds' })}>
            <Icon name="timer" size={14} />
            {left <= 0 ? `Up next: ${chips(t.nextSb)}/${chips(t.nextBb)}` : `L${t.level} · ${clock(left)}${t.running ? '' : ' ⏸'}`}
          </button>
        )}
      </div>
      <div class="tb-act">
        {!store.online && <span class="offline">Reconnecting…</span>}
        {canUndo && <IconBtn name="undo" label="Undo last action" onClick={() => undo()} />}
        {host && <IconBtn name="qr" label="Invite phones" onClick={() => openSheet({ k: 'invite' })} badge={s.lan.open} />}
        <IconBtn name="menu" label="Menu" onClick={() => openSheet({ k: 'menu' })} />
      </div>
    </header>
  )
}
