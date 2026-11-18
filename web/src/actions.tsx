import { useEffect, useMemo, useState } from 'preact/hooks'
import { chips, money } from './fmt'
import { act, cmd, store } from './net'
import { haptic } from './native'
import { prefs } from './prefs'
import { seatAngle } from './table'
import type { Legal, PlayerS, Snap } from './types'
import { Btn, HoldBtn, Icon } from './ui'
import { openSheet, uiSet, useUi } from './uistate'

const nameOf = (s: Snap, id: number | null | undefined) => s.players.find((p) => p.id === id)?.name ?? '?'

/** Host / pass-and-play panel: what to do next at the table. */
export function HostPanel({ s }: { s: Snap }) {
  const u = useUi()
  const h = s.hand
  if (!h || h.street === 'done') return <BetweenHands s={s} />
  if (h.street === 'showdown') return <Showdown s={s} />
  const id = h.toAct
  const p = s.players.find((x) => x.id === id)
  if (!p || !h.legal) return null
  // Player is on their own phone: wait for them unless the host chooses to step in.
  if (p.conn === 'on' && u.actFor !== p.id) {
    return (
      <div class="panel waiting">
        <div class="wait-line"><span class="pulse" /> Waiting for <b>{p.name}</b> on their phone…</div>
        <Btn kind="quiet" onClick={() => uiSet({ actFor: p.id })}>Act for {p.name}</Btn>
      </div>
    )
  }
  // Rotate the panel to face the player when they sit across the phone (top half of the ring).
  const i = s.players.findIndex((x) => x.id === p.id)
  const a = ((seatAngle(i, s.players.length) % 360) + 360) % 360
  const flip = prefs.face && u.actFor !== p.id && a > 180 && a < 360
  return <ActionBar s={s} p={p} legal={h.legal} flip={flip} />
}

export function ActionBar({ s, p, legal, flip, mine }: { s: Snap; p: PlayerS; legal: Legal; flip?: boolean; mine?: boolean }) {
  const u = useUi()
  const h = s.hand!
  const go = (move: 'fold' | 'check' | 'call' | 'raise', to = 0) => {
    haptic(move === 'fold' ? 'reject' : 'confirm')
    if (act(p.id, move, to)) uiSet({ raiseOpen: false, actFor: null })
  }
  const raiseWord = legal.isBet ? 'Bet' : 'Raise'
  const allInCall = legal.canCall && legal.call >= p.stack
  return (
    <div class={'panel act' + (flip ? ' flip' : '')}>
      <div class="act-head">
        <span><b>{mine ? 'Your turn' : p.name}</b>{mine ? '' : ' to act'}</span>
        <span class="muted">{chips(p.stack)} left{legal.canCall ? ` · ${chips(legal.call)} to call` : ''}</span>
      </div>
      {u.raiseOpen && legal.canRaise ? (
        <RaiseTray s={s} legal={legal} word={raiseWord} onCancel={() => uiSet({ raiseOpen: false })} onRaise={(to) => go('raise', to)} />
      ) : (
        <div class="acts">
          <div class="row">
            {!legal.canCheck && <Btn kind="danger" big onClick={() => go('fold')}>Fold</Btn>}
            {legal.canCheck
              ? <Btn kind="primary" big onClick={() => go('check')}>Check <small>free</small></Btn>
              : allInCall
                ? <HoldBtn label={`Call ${chips(legal.call)}`} sub="All-in · hold" onDone={() => go('call')} />
                : <Btn kind="primary" big onClick={() => go('call')}>Call {chips(legal.call)}</Btn>}
          </div>
          {legal.canRaise ? (
            legal.minTo === legal.maxTo
              ? <HoldBtn label={`All-in ${chips(legal.maxTo)}`} sub="hold to confirm" onDone={() => go('raise', legal.maxTo)} />
              : <Btn kind="raise" big onClick={() => { uiSet({ raiseOpen: true }) }}>{raiseWord}… <small>min {chips(legal.minTo)}</small></Btn>
          ) : (
            <WhyNot why={legal.why} word={raiseWord} />
          )}
        </div>
      )}
      {h.street === 'preflop' && h.toAct === h.bbId && legal.canCheck && <div class="tiny muted center-t">Big blind option</div>}
    </div>
  )
}

function WhyNot({ why, word }: { why: string | null; word: string }) {
  const [open, setOpen] = useState(false)
  if (!why) return null
  return (
    <button class="btn quiet whynot" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{word} not allowed <Icon name="info" size={14} /></span>
      {open && <small>{why}</small>}
    </button>
  )
}

function roundTo(v: number, unit: number) { return Math.round(v / unit) * unit }

function RaiseTray({ s, legal, word, onCancel, onRaise }: { s: Snap; legal: Legal; word: string; onCancel: () => void; onRaise: (to: number) => void }) {
  const h = s.hand!
  const unit = Math.max(1, h.sb)
  const clamp = (v: number) => Math.min(legal.maxTo, Math.max(legal.minTo, v))
  const presets = useMemo(() => {
    const owe = legal.canCall ? legal.call : 0
    const potAfterCall = h.total + owe
    const potTo = h.currentBet + potAfterCall
    const list: [string, number][] = [['Min', legal.minTo]]
    if (h.street === 'preflop') {
      const base = h.currentBet
      list.push(['2.5×', roundTo(base * 2.5, unit)], ['3×', base * 3])
    } else if (legal.isBet) {
      list.push(['½ pot', roundTo(h.total / 2, unit)], ['¾ pot', roundTo((h.total * 3) / 4, unit)])
    } else {
      list.push(['½ pot', roundTo(h.currentBet + potAfterCall / 2, unit)])
    }
    list.push(['Pot', roundTo(potTo, unit)])
    const out = list.map(([l, v]) => [l, clamp(v)] as [string, number]).filter(([, v], i, a) => a.findIndex(([, w]) => w === v) === i && v < legal.maxTo)
    return [...out.slice(0, 3), ['All-in', legal.maxTo] as [string, number]]
  }, [s.seq])
  const [to, setTo] = useState(legal.minTo)
  const [typing, setTyping] = useState(false)
  useEffect(() => setTo(legal.minTo), [s.seq])
  const step = h.bb
  const set = (v: number) => { setTo(clamp(v)); haptic('tick') }
  const valid = to >= legal.minTo && to <= legal.maxTo
  const isAllIn = to === legal.maxTo
  return (
    <div class="tray">
      <div class="presets">
        {presets.map(([l, v]) => <button class={'pre' + (v === to ? ' on' : '')} onClick={() => set(v)}>{l}<small>{chips(v)}</small></button>)}
      </div>
      <div class="amount">
        <button class="iconbtn" aria-label="Less" onClick={() => set(to - step)} disabled={to <= legal.minTo}><Icon name="minus" /></button>
        {typing ? (
          <input autoFocus type="number" inputMode="numeric" class="amt-input" placeholder={String(legal.minTo)}
            onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); if (v) setTo(Math.min(v, legal.maxTo)) }}
            onBlur={() => { setTyping(false); setTo((v) => clamp(v)) }} />
        ) : (
          <button class="amt" onClick={() => setTyping(true)} aria-label="Type an amount">
            <b>{chips(to)}</b><small>{word === 'Bet' ? 'bet' : `raise to · +${chips(to - h.currentBet)}`}</small>
          </button>
        )}
        <button class="iconbtn" aria-label="More" onClick={() => set(to + step)} disabled={to >= legal.maxTo}><Icon name="plus" /></button>
      </div>
      <input type="range" class="slider" min={legal.minTo} max={legal.maxTo} step={1} value={to}
        aria-label="Amount"
        onInput={(e) => {
          const raw = Number((e.target as HTMLInputElement).value)
          const v = raw >= legal.maxTo ? legal.maxTo : clamp(roundTo(raw, unit))
          if (v !== to) { setTo(v); haptic('tick') }
        }} />
      <div class="row">
        <Btn kind="quiet" big onClick={onCancel}>Back</Btn>
        {isAllIn
          ? <HoldBtn label={`All-in ${chips(to)}`} sub="hold" onDone={() => onRaise(to)} />
          : <Btn kind="raise" big disabled={!valid} onClick={() => onRaise(to)}>{word} {word === 'Bet' ? '' : 'to '}{chips(to)}</Btn>}
      </div>
    </div>
  )
}

function BetweenHands({ s }: { s: Snap }) {
  const broke = s.players.filter((p) => p.stack === 0 && !p.out)
  const ready = s.players.filter((p) => p.stack > 0 && !p.out).length
  const nextDealer = useMemo(() => {
    if (s.handNo === 0) return nameOf(s, s.button)
    const n = s.players.length
    const i = s.players.findIndex((p) => p.id === s.button)
    for (let k = 1; k <= n; k++) {
      const p = s.players[(i + k) % n]
      if (p.stack > 0 && !p.out && !p.waiting) return p.name
    }
    return null
  }, [s.seq])
  const t = s.timer
  const up = t && t.running && t.endsAt && t.endsAt - (Date.now() + store.skew) <= 0
  return (
    <div class="panel between">
      {broke.map((p) => (
        <div class="broke">
          <span><b>{p.name}</b> is out of chips</span>
          <div class="row">
            <Btn kind="ghost" onClick={() => cmd('rebuy', { id: p.id })}>
              Rebuy {chips(s.cfg.stack)}{s.cfg.mode === 'money' ? ` · ${money(s.cfg.money, s.cfg)}` : ''}
            </Btn>
            <Btn kind="quiet" onClick={() => cmd('sitout', { id: p.id })}>Sit out</Btn>
          </div>
        </div>
      ))}
      {ready >= 2 ? (
        <Btn kind="primary" big class="deal" onClick={() => { haptic('confirm'); cmd('deal') }}>
          <Icon name="cards" /> Deal hand {s.handNo + 1}
          <small>{nextDealer ? `${nextDealer} deals` : ''}{up ? ` · blinds go up to ${chips(t!.nextSb)}/${chips(t!.nextBb)}` : ''}</small>
        </Btn>
      ) : (
        <div class="muted center-t">Need at least 2 players with chips. Rebuy someone or add a player.</div>
      )}
      <div class="row">
        <Btn kind="quiet" onClick={() => openSheet({ k: 'players' })}><Icon name="users" size={18} /> Players</Btn>
        <Btn kind="quiet" onClick={() => openSheet({ k: 'confirm', text: 'End the game and see who owes whom?', yes: 'End & settle', run: () => cmd('end') })}><Icon name="flag" size={18} /> End game</Btn>
      </div>
    </div>
  )
}

/** Host picks winners. With side pots it asks for a ranking until every pot has a winner. */
function Showdown({ s }: { s: Snap }) {
  const h = s.hand!
  const live = h.dealt.filter((id) => !h.folded.includes(id))
  const [ranking, setRanking] = useState<number[][]>([])
  const [pick, setPick] = useState<number[]>([])
  useEffect(() => { setRanking([]); setPick([]) }, [h.no])
  const ranked = ranking.flat()
  const contested = h.pots.filter((p) => p.eligible.length > 1)
  const covered = (r: number[][]) => contested.every((p) => r.some((g) => g.some((id) => p.eligible.includes(id))))
  const remaining = live.filter((id) => !ranked.includes(id))
  const toggle = (id: number) => { haptic('tick'); setPick(pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id]) }
  const confirm = () => {
    const next = [...ranking, pick]
    if (covered(next)) { haptic('confirm'); cmd('award', { ranking: next }) } else { setRanking(next); setPick([]) }
  }
  const multi = contested.length > 1
  const title = ranking.length === 0 ? 'Who has the best hand?' : 'Next best hand among the rest?'
  return (
    <div class="panel showdown">
      <div class="act-head">
        <span><b>{title}</b></span>
        <span class="muted">{multi ? `${contested.length} pots` : 'Two for a split'}</span>
      </div>
      {ranking.length > 0 && <div class="tiny muted">Ranked: {ranking.map((g) => g.map((id) => nameOf(s, id)).join(' = ')).join(' › ')}</div>}
      <div class="picks">
        {remaining.map((id) => (
          <button class={'pickp' + (pick.includes(id) ? ' on' : '')} onClick={() => toggle(id)} aria-pressed={pick.includes(id)}>
            {nameOf(s, id)}
            {s.players.find((p) => p.id === id)!.stack === 0 && <small>all-in</small>}
          </button>
        ))}
      </div>
      <div class="row">
        <Btn kind="quiet" big onClick={() => openSheet({ k: 'referee' })}><Icon name="cards" size={18} /> Enter cards</Btn>
        <Btn kind="primary" big disabled={!pick.length} onClick={confirm}>
          {!pick.length ? 'Tap the winner' : pick.length > 1 ? 'Split pot' : covered([...ranking, pick]) ? 'Award pot' : 'Next'}
        </Btn>
      </div>
    </div>
  )
}
