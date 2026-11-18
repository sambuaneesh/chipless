import { useState } from 'preact/hooks'
import { ActionBar } from './actions'
import { chips, signed, SITE } from './fmt'
import { send, store, undo } from './net'
import { haptic } from './native'
import type { Snap } from './types'
import { Avatar, Btn, Icon } from './ui'
import { openSheet, uiSet, useUi, type PreAction } from './uistate'

/** First screen on a friend's phone: tap your name (or add yourself). */
export function Join({ s }: { s: Snap }) {
  const [name, setName] = useState('')
  const free = s.players.filter((p) => p.conn !== 'on')
  const taken = s.players.filter((p) => p.conn === 'on')
  return (
    <div class="join">
      <div class="brand small">
        <div class="logo" aria-hidden="true"><i /><i /><i /></div>
        <h1>Who are you?</h1>
        <p>Tap your name to take your seat.</p>
      </div>
      <div class="list">
        {free.map((p) => (
          <button class="item big" onClick={() => { haptic('confirm'); send({ t: 'claim', id: p.id }) }}>
            <Avatar name={p.name} seat={p.seat} size={40} /><span><b>{p.name}</b><small>{chips(p.stack)} chips</small></span><Icon name="right" />
          </button>
        ))}
        {taken.map((p) => (
          <div class="item static dim"><Avatar name={p.name} seat={p.seat} size={40} /><span><b>{p.name}</b><small>already on a phone</small></span></div>
        ))}
      </div>
      {s.players.length < 10 && (
        <div class="addp">
          <input placeholder="Not listed? Your name" value={name} maxLength={16} onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && send({ t: 'join', name: name.trim() })} />
          <Btn kind="ghost" disabled={!name.trim()} onClick={() => send({ t: 'join', name: name.trim() })}>Join</Btn>
        </div>
      )}
      <p class="tiny muted center-t">New players get {chips(s.cfg.stack)} chips and are dealt in from the next hand.</p>
      <Btn kind="quiet" onClick={() => openSheet({ k: 'ranks' })}><Icon name="ranks" size={18} /> Hand rankings</Btn>
      <p class="tiny muted center-t">Running on <a href={SITE} target="_blank" rel="noopener">Chipless</a>, a free, open-source poker chips app.</p>
    </div>
  )
}

/** The joined player's own controls under the table. */
export function MyPanel({ s }: { s: Snap }) {
  const u = useUi()
  const me = s.players.find((p) => p.id === store.me)
  if (!me) return null
  const h = s.hand
  const open = !!h && h.street !== 'done'
  const inHand = open && h!.dealt.includes(me.id)
  const folded = inHand && h!.folded.includes(me.id)
  const myTurn = open && h!.toAct === me.id && h!.legal
  const canUndo = s.undo.by === me.id

  if (myTurn) {
    return (
      <div class="mypanel turn">
        <ActionBar s={s} p={me} legal={h!.legal!} mine />
        {canUndo && <Btn kind="quiet" onClick={() => undo()}><Icon name="undo" size={16} /> Undo</Btn>}
      </div>
    )
  }

  const toActName = h?.toAct != null ? s.players.find((p) => p.id === h.toAct)?.name : null
  let status: string
  if (!open) status = s.handNo === 0 ? 'Waiting for the first hand' : 'Waiting for the next hand'
  else if (!inHand) status = me.out ? 'Sitting out' : me.waiting ? 'You join when the big blind reaches you' : 'Not in this hand'
  else if (folded) status = 'You folded — watch the rest'
  else if (me.stack === 0) status = 'You are all-in'
  else if (h!.street === 'showdown') status = 'Showdown — show your cards'
  else status = toActName ? `Waiting for ${toActName}` : 'Waiting'

  const showPre = inHand && !folded && me.stack > 0 && h!.street !== 'showdown'
  const myBet = h?.bets[String(me.id)] ?? 0
  const owe = h ? Math.max(0, h.currentBet - myBet) : 0
  const pres: [Exclude<PreAction, null>, string][] = owe > 0
    ? [['checkfold', 'Fold'], ['callany', `Call ${chips(Math.min(owe, me.stack))}`]]
    : [['checkfold', 'Check / Fold'], ['check', 'Check'], ['callany', 'Call any']]
  return (
    <div class="mypanel">
      <div class="mystack">
        <span class="muted">{me.name}</span>
        <b>{chips(me.stack)}</b>
        <small class={me.net >= 0 ? 'up' : 'down'}>{signed(me.net)} tonight</small>
      </div>
      <div class="status"><span class={open && !folded && inHand ? 'pulse' : ''} /> {status}</div>
      {showPre && (
        <div class="preacts" role="group" aria-label="Pre-select your action (private)">
          {pres.map(([k, l]) => (
            <button class={'pre' + (u.pre === k ? ' on' : '')} aria-pressed={u.pre === k}
              onClick={() => { haptic('tick'); uiSet({ pre: u.pre === k ? null : k, preBet: h!.currentBet }) }}>{l}</button>
          ))}
        </div>
      )}
      {showPre && <p class="tiny muted center-t prenote">Pre-select is private — it acts for you when your turn comes.</p>}
      {canUndo && <Btn kind="quiet" onClick={() => undo()}><Icon name="undo" size={16} /> Undo my last action</Btn>}
    </div>
  )
}
