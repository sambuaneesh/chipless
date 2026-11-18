import { useEffect, useRef, useState } from 'preact/hooks'
import { cmd, send, store, useStore } from './net'
import { haptic } from './native'
import type { Snap } from './types'
import { Btn, Card, Icon, Sheet } from './ui'
import { prefs } from './prefs'
import { SUIT } from './fmt'
import { closeSheet, openSheet } from './uistate'

const RANKS = 'AKQJT98765432'.split('')
const SUITS = 'shdc'.split('')
const SUIT_NAME: Record<string, string> = { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' }
const BOARD_NAME = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River']

interface Slot { who: number; i: number } // who = -1 for board

/**
 * Card pad: tap a rank and a suit (either order) and the card drops into the highlighted
 * slot, then the next empty slot lights up. Cards already used are greyed out.
 */
function CardPad({ used, onPick, target }: { used: Set<string>; onPick: (c: string) => void; target: string }) {
  const [rank, setRank] = useState<string | null>(null)
  const [suit, setSuit] = useState<string | null>(null)
  const place = (r: string | null, su: string | null) => {
    if (r && su) {
      if (used.has(r + su)) { haptic('reject'); setRank(r); setSuit(null); return }
      haptic('confirm'); onPick(r + su); setRank(null); setSuit(null)
    } else { haptic('tick'); setRank(r); setSuit(su) }
  }
  const rankFull = (r: string) => SUITS.every((x) => used.has(r + x))
  const suitFull = (x: string) => RANKS.every((r) => used.has(r + x))
  const four = prefs.fourColor
  return (
    <div class="pad">
      <div class="pad-target" aria-live="polite">
        <span>Now: <b>{target}</b></span>
        {rank || suit
          ? <span class="pad-sel">{rank ? (rank === 'T' ? '10' : rank) : '?'}{suit ? SUIT[suit] : '?'}</span>
          : <small class="muted pad-help">rank + suit · tap a card to change it</small>}
      </div>
      <div class="pad-ranks" role="group" aria-label="Rank">
        {RANKS.map((r) => (
          <button class={'pr' + (rank === r ? ' on' : '')} disabled={rankFull(r) || (!!suit && used.has(r + suit))}
            aria-pressed={rank === r} onClick={() => place(rank === r ? null : r, suit)}>{r === 'T' ? '10' : r}</button>
        ))}
      </div>
      <div class="pad-suits" role="group" aria-label="Suit">
        {SUITS.map((x) => (
          <button class={'ps s-' + x + (x === 'h' || x === 'd' ? ' r' : '') + (four ? ' four' : '') + (suit === x ? ' on' : '')}
            disabled={suitFull(x) || (!!rank && used.has(rank + x))} aria-pressed={suit === x} aria-label={SUIT_NAME[x]}
            onClick={() => place(rank, suit === x ? null : x)}>
            <i>{SUIT[x]}</i><small>{SUIT_NAME[x]}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function useCards(names: string[], initBoard: string[] = [], boardSlots = 5) {
  const [board, setBoard] = useState<(string | null)[]>([0, 1, 2, 3, 4].map((i) => initBoard[i] ?? null))
  const [hands, setHands] = useState<(string | null)[][]>(names.map(() => [null, null]))
  const order: Slot[] = [...[0, 1, 2, 3, 4].filter((i) => i < boardSlots).map((i) => ({ who: -1, i })), ...names.flatMap((_, w) => [{ who: w, i: 0 }, { who: w, i: 1 }])]
  const firstEmpty = order.find((o) => (o.who < 0 ? !board[o.i] : true)) ?? order[0]
  const [sel, setSel] = useState<Slot>(firstEmpty)
  useEffect(() => { setHands((h) => names.map((_, i) => h[i] ?? [null, null])) }, [names.length])
  const used = new Set([...board, ...hands.flat()].filter(Boolean) as string[])
  const get = (s: Slot) => (s.who < 0 ? board[s.i] : hands[s.who]?.[s.i]) ?? null
  const put = (s: Slot, c: string | null) => {
    if (s.who < 0) setBoard((b) => b.map((x, i) => (i === s.i ? c : x)))
    else setHands((h) => h.map((x, w) => (w === s.who ? x.map((y, i) => (i === s.i ? c : y)) : x)))
  }
  const pick = (c: string) => {
    put(sel, c)
    const start = order.findIndex((o) => o.who === sel.who && o.i === sel.i)
    for (let k = 1; k <= order.length; k++) {
      const o = order[(start + k) % order.length]
      if (!get(o) && !(o.who === sel.who && o.i === sel.i)) { setSel(o); return }
    }
  }
  const clear = (s: Slot) => { put(s, null); setSel(s) }
  const target = sel.who < 0 ? `Board · ${BOARD_NAME[sel.i]}` : `${names[sel.who]} · card ${sel.i + 1}`
  const full = order.every((o) => get(o))
  return { board, setBoard, hands, sel, setSel, used, pick, clear, get, target: full ? 'all cards in' : target }
}

function SlotCard({ c, active, onClick, label, disabled }: { c: string | null; active: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  // Keep the slot being filled visible above the sticky card pad.
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) }, [active])
  return (
    <button ref={ref} class={'slotc' + (active ? ' active' : '')} onClick={onClick} disabled={disabled} aria-label={c ? `${label}: ${c}, tap to change` : `${label}: empty`}>
      {c ? <Card c={c} /> : <span class="card empty" />}
    </button>
  )
}

function BoardRow({ st, isSel, tap, slots = 5 }: { st: ReturnType<typeof useCards>; isSel: (w: number, i: number) => boolean; tap: (w: number, i: number) => void; slots?: number }) {
  return (
    <div class="boardrow">
      <div class="refcards">
        {st.board.map((c, i) => <SlotCard c={c} active={isSel(-1, i)} onClick={() => tap(-1, i)} label={BOARD_NAME[i]} disabled={i >= slots} />)}
      </div>
      <div class="boardlbl"><span style={{ flex: 3 }}>Flop</span><span>Turn</span><span>River</span></div>
    </div>
  )
}

function CardsForm({ names, st, extra }: { names: string[]; st: ReturnType<typeof useCards>; extra?: (i: number) => preact.ComponentChildren }) {
  const isSel = (who: number, i: number) => st.sel.who === who && st.sel.i === i
  const tap = (who: number, i: number) => (st.get({ who, i }) && isSel(who, i) ? st.clear({ who, i }) : st.setSel({ who, i }))
  return (
    <>
      <BoardRow st={st} isSel={isSel} tap={tap} />
      {names.map((n, w) => (
        <div class="refrow">
          <span class="refname">{n}{extra?.(w)}</span>
          <div class="refcards">{[0, 1].map((i) => <SlotCard c={st.hands[w]?.[i] ?? null} active={isSel(w, i)} onClick={() => tap(w, i)} label={`${n} card ${i + 1}`} />)}</div>
        </div>
      ))}
      <CardPad used={st.used} onPick={st.pick} target={st.target} />
    </>
  )
}

/** Host records the board as it's dealt (optional). Everyone sees the cards on the table. */
export function BoardEditor({ s }: { s: Snap }) {
  const h = s.hand
  const reached = h ? ({ preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5, done: 5 } as const)[h.street] : 0
  const st = useCards([], h?.board ?? [], reached)
  const isSel = (who: number, i: number) => st.sel.who === who && st.sel.i === i
  const tap = (who: number, i: number) => (st.get({ who, i }) && isSel(who, i) ? st.clear({ who, i }) : st.setSel({ who, i }))
  if (!h || h.street === 'done' || reached === 0) return <Sheet title="Board cards" onClose={closeSheet}><p>Board cards can be entered once the flop is dealt.</p></Sheet>
  const filled = st.board.slice(0, reached)
  const firstGap = filled.findIndex((c) => !c)
  const cards = (firstGap < 0 ? filled : filled.slice(0, firstGap)) as string[]
  const gap = firstGap >= 0 && filled.slice(firstGap).some(Boolean)
  const save = () => { cmd('board', { cards }); closeSheet() }
  return (
    <Sheet title={`Board · ${({ flop: 'the Flop', turn: 'the Turn', river: 'the River', showdown: 'all 5 cards' } as Record<string, string>)[h.street] ?? ''}`} onClose={closeSheet} wide>
      <p class="tiny muted">Optional. Record the cards as they're dealt so everyone sees them, and they're already filled in at showdown.</p>
      <BoardRow st={{ ...st, target: st.target }} isSel={isSel} tap={(w, i) => i < reached && tap(w, i)} slots={reached} />
      <CardPad used={st.used} onPick={(c) => { if (st.sel.i < reached) st.pick(c) }} target={st.sel.i < reached ? `Board · ${BOARD_NAME[st.sel.i]}` : 'done'} />
      {gap && <p class="tiny" style={{ color: 'var(--amber)' }}>Fill the cards from left to right. The {BOARD_NAME[firstGap]} is missing.</p>}
      <div class="row">
        <Btn kind="quiet" big onClick={() => { cmd('board', { cards: [] }); closeSheet() }} disabled={!h.board.length}>Clear</Btn>
        <Btn kind="primary" big disabled={gap || cards.join() === h.board.join()} onClick={save}><Icon name="check" /> Save board</Btn>
      </div>
    </Sheet>
  )
}

function ResultBox() {
  const st = useStore()
  const r = st.evalResult
  if (!r) return null
  return (
    <div class="verdict" role="status">
      <p>{r.text}</p>
      {r.hands.map((h, i) => (
        <div class={'vh' + (r.winners.includes(i) ? ' win' : '')}>
          <b>{h.name}</b><span>{h.cat}</span>
          <div class="board">{h.best.map((c) => <Card c={c} small />)}</div>
        </div>
      ))}
    </div>
  )
}

/** Showdown referee: enter the cards, see who wins and why, then award. */
export function Referee({ s }: { s: Snap }) {
  const h = s.hand
  const live = h ? h.dealt.filter((id) => !h.folded.includes(id)) : []
  const names = live.map((id) => s.players.find((p) => p.id === id)?.name ?? '?')
  const st = useCards(names, h?.board ?? [])
  useEffect(() => { store.evalResult = null }, [])
  const filled = live.map((_, w) => st.hands[w].every(Boolean))
  const boardDone = st.board.every(Boolean)
  const entered = live.filter((_, w) => filled[w])
  const ready = boardDone && entered.length >= 1
  const evaluate = () => {
    const idx = live.map((_, w) => w).filter((w) => filled[w])
    send({ t: 'eval', board: st.board, hands: idx.map((w) => ({ name: names[w], cards: st.hands[w] })) })
  }
  useEffect(() => { if (ready) evaluate(); else store.evalResult = null }, [st.board.join(), st.hands.map((x) => x.join()).join()])
  const award = () => {
    const holes: Record<string, string[]> = {}
    live.forEach((id, w) => { if (filled[w]) holes[id] = st.hands[w] as string[] })
    haptic('confirm')
    cmd('awardCards', { board: st.board, holes })
    closeSheet()
  }
  if (!h || h.street !== 'showdown') return <Sheet title="Enter cards" onClose={closeSheet}><p>Available at showdown.</p></Sheet>
  return (
    <Sheet title="Who won? Enter the cards" onClose={closeSheet} wide>
      <p class="tiny muted">Leave a player empty if they threw their cards away (mucked).</p>
      <CardsForm names={names} st={st} extra={(w) => (!filled[w] ? <small> · {st.hands[w].some(Boolean) ? 'incomplete' : 'not shown'}</small> : null)} />
      <ResultBox />
      <Btn kind="primary" big disabled={!ready || !store.evalResult} onClick={award}><Icon name="check" /> Award pot{h.pots.length > 1 ? 's' : ''}</Btn>
    </Sheet>
  )
}

/** Stand-alone "who wins?" checker for any situation. */
export function Calculator() {
  const [n, setN] = useState(2)
  const names = Array.from({ length: n }, (_, i) => `Player ${i + 1}`)
  const st = useCards(names)
  useEffect(() => { store.evalResult = null }, [])
  const boardCount = st.board.filter(Boolean).length
  const contiguous = st.board.slice(0, boardCount).every(Boolean)
  const hands = names.map((nm, w) => ({ name: nm, cards: st.hands[w] })).filter((x) => x.cards.every(Boolean))
  const ready = boardCount >= 3 && contiguous && hands.length >= 1
  useEffect(() => {
    if (ready) send({ t: 'eval', board: st.board.filter(Boolean), hands })
    else store.evalResult = null
  }, [st.board.join(), st.hands.map((x) => x.join()).join(), n])
  return (
    <Sheet title="Who wins?" onClose={closeSheet} wide>
      <p class="tiny muted">Enter at least the flop and one hand. The best 5 of 7 cards wins.</p>
      <CardsForm names={names} st={st} />
      <div class="row">
        <Btn kind="quiet" disabled={n <= 1} onClick={() => setN(n - 1)}><Icon name="minus" size={18} /> Hand</Btn>
        <Btn kind="quiet" disabled={n >= 8} onClick={() => setN(n + 1)}><Icon name="plus" size={18} /> Hand</Btn>
      </div>
      <ResultBox />
      <HandRanks />
    </Sheet>
  )
}

const RANKINGS: [string, string[], string][] = [
  ['Royal flush', ['As', 'Ks', 'Qs', 'Js', 'Ts'], 'A-K-Q-J-10, same suit'],
  ['Straight flush', ['9h', '8h', '7h', '6h', '5h'], 'Five in a row, same suit'],
  ['Four of a kind', ['Qs', 'Qh', 'Qd', 'Qc', '4s'], 'Four of one rank'],
  ['Full house', ['Kh', 'Kd', 'Ks', '7c', '7d'], 'Three + a pair'],
  ['Flush', ['Ad', 'Jd', '9d', '6d', '2d'], 'Five of one suit'],
  ['Straight', ['Tc', '9d', '8h', '7s', '6c'], 'Five in a row (A-2-3-4-5 counts)'],
  ['Three of a kind', ['8s', '8h', '8d', 'Kc', '3s'], 'Three of one rank'],
  ['Two pair', ['Jh', 'Jc', '4s', '4d', 'Ah'], 'Two different pairs'],
  ['Pair', ['Th', 'Ts', 'Ac', '7d', '2h'], 'Two of one rank'],
  ['High card', ['Ah', 'Jd', '8c', '5s', '3h'], 'Nothing else, so the highest card plays'],
]

function RankList() {
  return (
    <>
      {RANKINGS.map(([n, cards, d], i) => (
        <div class="rk"><span class="rn">{i + 1}</span><span><b>{n}</b><small>{d}</small></span><span class="board">{cards.map((c) => <Card c={c} small />)}</span></div>
      ))}
    </>
  )
}

export function HandRanks() {
  return (
    <details class="ranks">
      <summary>Hand rankings, best to worst</summary>
      <RankList />
    </details>
  )
}

/** Quick reference any player can open mid-game. */
export function RanksSheet() {
  return (
    <Sheet title="Hand rankings" onClose={closeSheet}>
      <div class="cardorder">
        <span class="muted tiny">Card values, high to low</span>
        <div class="co">{'A K Q J 10 9 8 7 6 5 4 3 2'.split(' ').map((r) => <b>{r}</b>)}</div>
        <span class="muted tiny">Ace is high, and also low in A-2-3-4-5. Suits are all equal.</span>
      </div>
      <div class="ranks open"><RankList /></div>
      <h3>Who wins a tie?</h3>
      <ul class="tips">
        <li>Everyone uses their <b>best 5 cards</b> from their 2 plus the 5 on the board.</li>
        <li>Same kind of hand? The higher one wins: a pair of Kings beats a pair of Queens.</li>
        <li>Still equal? Compare the next highest cards (the <b>kickers</b>), one by one.</li>
        <li>Exactly the same 5 cards? <b>Split the pot</b>. Suits never break a tie.</li>
      </ul>
      <Btn kind="ghost" onClick={() => openSheet({ k: 'calc' })}><Icon name="cards" /> Check a hand: who wins?</Btn>
    </Sheet>
  )
}
