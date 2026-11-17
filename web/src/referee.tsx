import { useEffect, useState } from 'preact/hooks'
import { cmd, send, store, useStore } from './net'
import { haptic } from './native'
import type { Snap } from './types'
import { Btn, Card, Icon, Sheet } from './ui'
import { closeSheet } from './uistate'

const RANKS = 'AKQJT98765432'.split('')
const SUITS = 'shdc'.split('')

interface Slot { who: number; i: number } // who = -1 for board

/** Card grid: tap a slot, then a card; jumps to the next empty slot. */
function Picker({ used, onPick }: { used: Set<string>; onPick: (c: string) => void }) {
  return (
    <div class="picker" role="grid" aria-label="Pick a card">
      {SUITS.map((s) => (
        <div class="prow" role="row">
          {RANKS.map((r) => {
            const c = r + s
            return (
              <button role="gridcell" class={'pc ' + (s === 'h' || s === 'd' ? 'r' : 'k') + ' s-' + s} disabled={used.has(c)} onClick={() => { haptic('tick'); onPick(c) }}
                aria-label={c}>
                <b>{r === 'T' ? '10' : r}</b><i>{({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[s]}</i>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function useCards(names: string[]) {
  const [board, setBoard] = useState<(string | null)[]>([null, null, null, null, null])
  const [hands, setHands] = useState<(string | null)[][]>(names.map(() => [null, null]))
  const [sel, setSel] = useState<Slot>({ who: -1, i: 0 })
  useEffect(() => { setHands((h) => names.map((_, i) => h[i] ?? [null, null])) }, [names.length])
  const used = new Set([...board, ...hands.flat()].filter(Boolean) as string[])
  const order: Slot[] = [...[0, 1, 2, 3, 4].map((i) => ({ who: -1, i })), ...names.flatMap((_, w) => [{ who: w, i: 0 }, { who: w, i: 1 }])]
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
  return { board, hands, sel, setSel, used, pick, clear, get }
}

function SlotCard({ c, active, onClick }: { c: string | null; active: boolean; onClick: () => void }) {
  return (
    <button class={'slotc' + (active ? ' active' : '')} onClick={onClick} aria-label={c ? `Card ${c}, tap to change` : 'Empty slot'}>
      {c ? <Card c={c} /> : <span class="card empty" />}
    </button>
  )
}

function CardsForm({ names, st, extra }: { names: string[]; st: ReturnType<typeof useCards>; extra?: (i: number) => preact.ComponentChildren }) {
  const isSel = (who: number, i: number) => st.sel.who === who && st.sel.i === i
  const tap = (who: number, i: number) => (st.get({ who, i }) && isSel(who, i) ? st.clear({ who, i }) : st.setSel({ who, i }))
  return (
    <>
      <div class="refrow">
        <span class="refname">Board</span>
        <div class="refcards">{st.board.map((c, i) => <SlotCard c={c} active={isSel(-1, i)} onClick={() => tap(-1, i)} />)}</div>
      </div>
      {names.map((n, w) => (
        <div class="refrow">
          <span class="refname">{n}{extra?.(w)}</span>
          <div class="refcards">{[0, 1].map((i) => <SlotCard c={st.hands[w]?.[i] ?? null} active={isSel(w, i)} onClick={() => tap(w, i)} />)}</div>
        </div>
      ))}
      <Picker used={st.used} onPick={st.pick} />
    </>
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
  const st = useCards(names)
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
      <p class="tiny muted">Tap a slot, then a card. Leave a player empty if they threw their cards away (mucked).</p>
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
  ['High card', ['Ah', 'Jd', '8c', '5s', '3h'], 'Nothing else — highest card plays'],
]

export function HandRanks() {
  return (
    <details class="ranks">
      <summary>Hand rankings, best to worst</summary>
      {RANKINGS.map(([n, cards, d], i) => (
        <div class="rk"><span class="rn">{i + 1}</span><span><b>{n}</b><small>{d}</small></span><span class="board">{cards.map((c) => <Card c={c} small />)}</span></div>
      ))}
    </details>
  )
}
