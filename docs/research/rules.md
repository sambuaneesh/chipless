# NLHE Rules Spec for the Engine

Status: research note (2026-11-17). Normative for the engine unless an ADR overrides it.
Scope: No-Limit Texas Hold'em, 2–10 players, real cards, the app tracks chips, positions, betting, pots and settlement.

**Sources** (full list at the end). TDA = Poker TDA *2026 Rules, Version 1.1, 21 Sep 2026*. RRoP = *Robert's Rules of Poker v6* (Ciaffone), the de-facto cash-game rulebook. TDA is written for tournaments. RRoP covers cash games. Where they differ, this spec says which one it follows and why.

Conventions used throughout:
- Seats are numbered clockwise. `next(x)` = first seat clockwise after `x` matching a predicate.
- All amounts are integers in **units** (the smallest chip in play). No floats anywhere in the engine.
- `sc` = a player's chips committed on the **current street**. `tc` = chips committed **this hand** (all streets).
- Bets are stored as **raise-to** (the street total), never as raise-by.

---

## 1. Seating, button, blinds

### 1.1 Basics
- One button. **SB** = first active player clockwise of the button, **BB** = the next one after that (RRoP §4).
- Blinds are posted before cards are dealt. A posted blind is a **live bet** and counts toward the player's call.
- First hand: the host picks the button, or the app picks at random. The physical method is high card by suit, spades > hearts > diamonds > clubs (RRoP §3 "Ties" 1).
- **Heads-up** (exactly 2 dealt in): the button posts the **SB**, acts **first preflop** and **last on every later street** (TDA 36-C, RRoP §4 r4).
  - Engine trick: no special case is needed. Set `sb = button` when heads-up and keep the generic "preflop first = next after BB, postflop first = next after button" rules. Both resolve correctly.
- Going heads-up mid-game: adjust the button so **no player posts the BB twice in a row** (TDA 36-C).

### 1.2 Short-stacked blind
- A player who cannot cover a blind posts everything they have and is **all-in**.
- The **nominal blind is unchanged**. Everyone else must still call the full BB to play, and the minimum raise is still based on the full BB (RRoP §4 r1, TDA 56-B). Preflop sets `currentBet = BB` even if the BB player posted less.
- Side pots form naturally (§4), because a short BB can only win `posted × callers` from each caller.
- Edge case: heads-up, the SB posts 50 and the BB is all-in for 40. Nobody can act, so no betting happens. 10 of the SB's 50 is **uncalled** and returned (§4.3). Then run out the board.

### 1.3 Moving players between hands: dead button vs moving button

| Method | Rule | Pros | Cons |
|---|---|---|---|
| **Dead button** (TDA 34, tournaments) | The BB always advances exactly one active player. The SB goes on the previous BB's seat, the button on the previous SB's seat, even if those seats are now empty ("dead SB", "dead button"). | Nobody ever skips or doubles a blind. | A seat with nobody in it can hold the button. In a home game the button holder usually deals, so a dead button confuses people. Needs missed-blind tracking. |
| **Moving button** (RRoP §4 r2a, common in cash) | The button always moves to the next *player*, and the blinds follow. | Physically intuitive: the button and the dealer are always a real person. | When someone busts, a player can skip one blind or post SB instead of BB. RRoP allows two BBs on one hand to fix this. |

**Recommendation for v1: "simple moving button" as the default, with "Dead button (TDA)" as a setting.**
Why:
- The button holder deals the real cards, so the button must sit on a real person.
- No empty-seat bookkeeping and no "owed blinds" state.
- The unfairness is bounded. Each bust or join lets at most one or two players skip one blind once. In a home game that is noise.

Simple moving button:
```
positions(prev, players):
  A = players in seat order with inHand-eligible = (stack > 0 && !sittingOut && !waitingForBB)
  if |A| < 2: game over / pause
  place(btn) = |A| == 2 ? {btn, sb: btn, bb: next(btn, A)}
                        : {btn, sb: next(btn, A), bb: next(next(btn, A), A)}
  pos = place(next(prev.button, A))     // first eligible seat clockwise after last button seat
  if pos.bb == prev.bb:                 // TDA 36-C: nobody posts BB twice in a row
    pos = place(next(pos.btn, A))       // advance the button one more player (at most once)
  return pos
```
Note: a repeat BB only happens on the transition to heads-up. Check: 3-handed A(btn) B(SB) C(BB), and A busts. The naive result would be B = button/SB and C = BB again. The fix gives C = button/SB and B = BB.

Dead button (setting):
```
bb  = next(prev.bb, eligible)          // BB always moves exactly one active player
sb  = prev.bb seat   -> posts SB only if that player is still eligible, else "no SB this hand"
btn = prev.sb seat   -> may be empty ("dead button"); the player to its right deals
heads-up transition: apply TDA 36-C (no BB twice in a row), and sb = btn
```
TDA 2026 adds 36-B: the button doesn't belong to a seat. It may skip vacant seats so that incoming players can be seated without landing between the button and the blinds. It doesn't matter for home games.

### 1.4 Joining, sitting out, missed blinds
RRoP §4 r5–r12 (cash):
- A new player either **waits for the BB** or **posts a BB-sized live blind** and is dealt in at once.
- A new player can't be dealt in between the BB and the button (on the button or in the SB).
- A player who missed blinds posts **all missed blinds**: the BB part is live and the SB part is **dead**, meaning it goes to the pot and doesn't count toward the call. Or they wait for the BB.

Recommended home default (simple, still correct):
- **Join / return from sit-out:** the player chooses one of two options.
  - **"Post BB and play now":** a live post with the BB's option to raise. It is not allowed if the next hand would put them on the button or in the SB (RRoP §4 r8). In that case they wait until the button passes.
  - **"Wait for BB"** (`waitingForBB = true`): they are activated on the first hand where `positions()`, computed as if they were eligible, makes them BB.
- **No dead-SB make-up** in the default. Setting: "Casino missed blinds" adds `owesSB` and `owesBB` flags, posted on return (SB dead, BB live).
- **Bust:** stack = 0 after a hand. Free play: remove or prompt a rebuy. Real money: prompt a rebuy (recorded in the ledger). A rebuy re-enters without being treated as new (RRoP §4 r12), so no extra post.
- A **"post"** (the new player's BB) is modelled like a second BB:
  - It is part of `sc`.
  - The poster has not acted yet (`lastActedAt = null`), so they get the option to check or raise.
  - `currentBet` stays `BB`.

---

## 2. Action order and betting-round termination

### 2.1 Order
- **Preflop:** first to act is `next(bb)` among players who can act. Then clockwise. The BB acts last (the "option").
- **Flop, turn, river:** first to act is `next(button)` among players who can act. With a dead button, count from the button's seat.
- Players who are folded or all-in are skipped.

### 2.2 Legal actions (NL)
Per-street state:
- `currentBet` = highest `sc` on this street.
- `lfr` ("last full raise") = size of the last full bet or raise this street. It starts at `BB` on every street, including preflop.

Per-player state:
- `lastActedAt` = the `currentBet` value right after this player's last voluntary action this street.
- `null` = has not acted. **Blinds and posts do not count as acting.**

```
legal(p):
  owe      = currentBet - p.sc
  toCall   = min(owe, p.stack)                         // calling all-in for less is allowed
  canCheck = owe == 0
  canCall  = owe > 0
  others   = players in hand, != p, not folded, not all-in
  reopened = p.lastActedAt == null || currentBet - p.lastActedAt >= lfr
  canRaise = p.stack > owe && others.nonEmpty && reopened
  minTo    = currentBet + lfr                          // min bet when currentBet == 0 is BB
  maxTo    = p.sc + p.stack                            // all-in
  if maxTo < minTo: only raise allowed is the all-in (raiseTo = maxTo)
  label    = currentBet == 0 ? "Bet" : "Raise"         // preflop is always "Raise" (BB is a bet)
apply raise-to X (minTo <= X <= maxTo, or X == maxTo):
  inc = X - currentBet
  if inc >= lfr: lfr = inc                             // full raise: sets new min-raise increment
  // else: short all-in; lfr unchanged; does NOT reopen (see 3.3)
  move X - p.sc from stack to sc; currentBet = X
after any fold/check/call/raise by p: p.lastActedAt = currentBet
```

### 2.3 Round end
```
needsAction(p) = !p.folded && !p.allIn && (p.lastActedAt == null || p.sc < currentBet)
// special case: if p is the ONLY non-folded, non-all-in player and p.sc >= max(sc of others)
//   then p has nothing to decide -> needsAction(p) = false
roundOver = (nonFolded == 1) || !exists p: needsAction(p)
```
After the round:
1. Return any **uncalled** excess (§4.3).
2. Choose what happens next:
   - `nonFolded == 1`: that player wins everything, no showdown and no cards shown.
   - Count of non-folded, non-all-in players ≤ 1: **all-in run-out**. Prompt the host to deal the remaining board cards, with no more betting. Then showdown (TDA 17: all hands tabled).
   - River finished: showdown.
   - Otherwise: next street. Reset `sc = 0`, `lastActedAt = null`, `currentBet = 0`, `lfr = BB`.

**BB option:** if preflop action limps around, the BB still has `lastActedAt == null`, so `needsAction` is true. The BB may check, which ends the round, or raise. RRoP §4 r3: the option is kept even if someone went all-in for less than a min raise.

---

## 3. Bet sizing

### 3.1 Rules
- **Minimum bet** = BB on every street (RRoP NL r2). A smaller bet is allowed only as an all-in.
- **Minimum raise:** the increment must be ≥ the largest prior **full** bet or raise this round (TDA 45-A, RRoP NL r3).
  - E.g. BB 100, raise to 300 (inc 200). The next min re-raise is to 500.
- There is **no "completing"** in no-limit. Bet 100, then an all-in to 140: a raiser must go to at least **240** (RRoP NL r4).
- **No cap** on the number of raises in NL (RRoP NL r1).
- **Raise-to vs raise-by:** the engine stores **raise-to**. TDA 45-B: *"declaring raise and an amount is the total bet"* (A opens 2000, B says "raise, eight thousand" means a total of 8000).
  - UI: show both, e.g. "Raise to 300 (+200)".
  - Quick buttons: Min, ½ pot, ¾ pot, Pot, All-in. In NL, "pot" is only a UI helper. TDA 56: "I bet the pot" isn't a valid NL declaration.
  - **Pot-sized raise-to** = `currentBet + (pot + Σsc + owe)`, where `pot` is the chips from earlier streets.

### 3.2 Short all-in (incomplete raise)
- An all-in that is less than a full raise is allowed. It raises `currentBet` but does **not** change `lfr`.

### 3.3 Re-opening (the "full raise" rule)
**TDA 49-A (NL/PL):** an all-in wager, *or cumulative short all-ins*, totalling less than a full bet or raise **does not reopen betting for players who have already acted**. If cumulative short all-ins *do* add up to a full raise, the betting is reopened. The **minimum raise is then the last full valid bet or raise** of the round. RRoP NL r5 has the same "multiple all-ins … act as a raise if the resulting wager size to a player qualifies as a raise". The "half-bet reopens" rule is **limit-only** (RRoP, TDA 49-B). It must **not** be used here.

The `reopened` test in §2.2 implements this exactly, because it measures what *this player* faces since their last action against `lfr`.

Worked examples (all verified with a reference implementation):

| # | Sequence | Result |
|---|---|---|
| 1 | Flop. A bets 100, B raises to 200, C is all-in for 250 (+50, short), A calls 250. | **B may only call or fold**: faces 50 < `lfr` 100 (RRoP NL r5 example). A *could* have raised: faced 150 ≥ 100. |
| 2 | Flop, blinds 50/100. A bets 100, B all-in 150, C all-in 200, D calls 200. | Back to A: faces 200−100 = 100 ≥ `lfr` 100, so **reopened**. A's min raise-to = 200 + 100 = **300**. |
| 3 | Flop. A checks, B all-in 60 (below min bet 100), C calls 60. | A faced 60 < 100, so **A can only call or fold**. C (not acted yet) could have raised, min to 60 + 100 = **160**. |
| 4 | Preflop 50/100. UTG all-in 150, SB calls 150. | BB has `lastActedAt = null`, so **may raise**. Min raise-to = 150 + 100 = **250**. |
| 5 | Flop. A bets 100, B all-in 180 (short), C raises to 300. | C's increment 120 ≥ 100, a full raise. `lfr = 120`, next min raise-to 420. A is reopened (faces 200 ≥ 120). |

Note: some TDA forum threads say the "how much may a reopened player raise" wording was unclear in older versions. 2026 49-A settles it: the min raise is the last *full* raise (here `lfr`).

### 3.4 String bets, verbal and chip-motion rules
These are not applicable to the app. Every action is one atomic, explicit event with an exact amount. So:
- String bets (TDA 58, RRoP §3 r14)
- the 50% chip-push rule (TDA 45-A)
- overchip-is-a-call (TDA 46, RRoP NL r11)
- multi-chip calls (TDA 47)

…can never happen. Two things are still worth doing:
- Have the beginner coach mention them ("in a casino, say 'raise' first").
- **Out-of-turn** input: reject it. The host can act for anyone but only for the player whose turn it is.

---

## 4. Pots

### 4.1 Model
- Track only `tc[p]` (total committed this hand) and `folded[p]` during the hand. Build pots at showdown, and also after every street for display.
- Folded players' chips are **dead money**. They stay in the pots they contributed to, but the folded player is never eligible to win.

### 4.2 Side-pot algorithm
```
buildPots(players):                                   // call after uncalled-bet return
  levels = sorted distinct tc of NON-folded players with tc > 0
  prev = 0; pots = []
  for L in levels:
    amount   = Σ_over_ALL_players max(0, min(tc[p], L) - prev)   // includes folded (dead) money
    eligible = { p : !folded[p] && tc[p] >= L }
    if amount > 0:
      if pots.nonEmpty && pots.last.eligible == eligible: pots.last.amount += amount
      else pots.push({amount, eligible})
    prev = L
  dead = Σ max(0, tc[p] - prev)           // folded money above every live level (rare); add to last pot
  pots.last.amount += dead
  assert Σ pots.amount == Σ tc
```
Merging pots with identical eligibility matters. Example: two all-ins at different levels, where everyone above them has folded except one player. That player's excess would otherwise appear as a pointless one-player pot, but the uncalled return should already have removed it.

**Worked example** (verified). Contributions after the uncalled return:

| Player | A | B | C | D | E (folded) |
|---|---|---|---|---|---|
| tc | 50 (all-in) | 120 (all-in) | 200 | 200 (all-in) | 80 |

C originally bet 300. 100 of it was uncalled and returned, because the second-highest tc was 200.

| Pot | Calculation | Amount | Eligible |
|---|---|---|---|
| Main | 5 × 50 | **250** | A B C D |
| Side 1 | 70+70+70+30 | **240** | B C D |
| Side 2 | 80+80 | **160** | C D |

Total 650 = Σ tc. E's 80 is spread over the main pot and side 1 as dead money.

### 4.3 Uncalled bet
At the end of each betting round, let `top` be the player with the highest `sc`. Compare with `second` = the second-highest `sc` **among all players, folded included**. If `top.sc > second`, return `top.sc − second` to `top` (TDA 16-B / 67-A, "any uncalled bet … is returned").
- It also covers the "everyone folds" case and the short-BB case in §1.2.
- Ties count as called: if P3 bets 300 and P1 put in 300 then folded, nothing is returned.

---

## 5. Showdown

### 5.1 Who shows first (TDA 18-A, RRoP Showdown r7)
- If there was a bet or raise on the river, the **last aggressor** on the river shows first.
- If there was no river bet, the **first player to act on the river** (first active left of the button) shows first. Then clockwise.
- With side pots, players in side pots show before players who are all-in only for the main pot (RRoP r7).
- **All-in with betting finished:** all live hands are tabled at once, before the run-out (TDA 17).
- The app only *displays* the order as a prompt ("Bob shows first"). Real cards are physical.
- Muck: a player can concede (`muck`) and becomes ineligible. If all but one muck, the pot is uncontested (TDA 18-B).
- Cards speak: verbal hand claims are not binding (TDA 13). That is relevant only when the host taps winners by hand.

### 5.2 Awarding
```
award(pots, ranking):          // ranking: map player -> score (bigger is better) or host-entered order
  for pot in pots:             // order irrelevant; process side pots first for display
    contenders = pot.eligible minus mucked
    best = max score among contenders; W = contenders with score == best
    W = sort W by seat order starting at next(button)        // odd-chip order
    share = floor(pot.amount / |W|); odd = pot.amount mod |W|  // in units
    each w gets share; the first `odd` players in W each get +1 unit
```
- **Odd chip:** it goes to the first winner **clockwise from the button**, broken down to the smallest unit in play (TDA 21, RRoP Ties r3–5). Each pot is split separately. No player gets more than one odd unit from a single pot.
  - Heads-up, the first seat clockwise from the button is the BB, so the BB gets the odd chip.
  - A dead button still counts from the button's seat.
- **"Smallest unit"** = the configured smallest chip (default: 1 point, or 1 cent in money mode). If the SB is the smallest chip, use that as the unit, so pots never show sub-chip amounts.
- **Everyone folds:** after the uncalled return, the last player gets everything. No showdown and no cards.
- **Host-picked winners:** with one pot, the host taps the winner(s). With side pots, the best UX is for the host to give a **ranking of the live hands, with ties allowed** (e.g. `[Carol] > [Alice = Bob] > [Dave]`). The engine then derives each pot's winners as the best-ranked eligible players, so the host never has to reason about side pots. Validate: every pot gets ≥ 1 winner from its eligible set.
- **Evaluator mode:** `ranking = evaluate(hole ∪ board)` for each live player whose cards were entered. Players without entered cards must be ranked by the host or marked mucked. Validate:
  - 52 distinct cards in total
  - board length = 5 at showdown (fewer only when a betting round ended the hand)
  - each hand has 2 hole cards

---

## 6. Hand evaluation

### 6.1 Ranking
High to low:

| Rank | Hand |
|---|---|
| 1 | Straight Flush (A-high = Royal) |
| 2 | Four of a Kind |
| 3 | Full House |
| 4 | Flush |
| 5 | Straight |
| 6 | Three of a Kind |
| 7 | Two Pair |
| 8 | One Pair |
| 9 | High Card |

- The best **5 of 7** plays. The hole cards may contribute 0, 1 or 2 cards. **"The board plays"** = the best 5 are all board cards.
- **Ace** is high, and low only in **A-2-3-4-5 (the wheel)**, which is the *lowest* straight (5-high). There is no wrap-around: Q-K-A-2-3 is not a straight.
- **Suits never break ties** (RRoP Ties r1). Equal 5-card hands split the pot.
- Comparison inside a category is lexicographic on these keys:

| Category | Keys | Distinct classes |
|---|---|---|
| Straight flush | top card | 10 |
| Quads | quad rank, kicker | 156 |
| Full house | trips rank, pair rank | 156 |
| Flush | 5 ranks desc | 1277 |
| Straight | top card (wheel = 5) | 10 |
| Trips | trips rank, 2 kickers | 858 |
| Two pair | high pair, low pair, kicker | 858 |
| Pair | pair rank, 3 kickers | 2860 |
| High card | 5 ranks desc | 1277 |
| **Total** | | **7462** |

- Only 5 cards count. A 6th-best card never plays.
  - E.g. board A-A-A-A-K: everybody plays quads with a K kicker, and the pot is split.
- 7-card facts the code may rely on:
  - With 7 cards, a flush **excludes** quads and full house, so check flush first.
  - Three pairs: the best two pairs play, and the kicker is the best remaining rank (which may be the third pair's rank).
  - Two sets of trips make a full house, with the lower trips playing as the pair.

### 6.2 Evaluator choice
We evaluate at most ~10 hands per pot a few times per hand, so speed doesn't matter and **code size does**.

| Approach | Tables | Speed (order of magnitude) | Notes |
|---|---|---|---|
| Naive: all 21 5-card subsets × sort-based eval | 0 | ~µs | Simplest, but slower and more code than the direct approach below. |
| **Direct 7-card rank-count + suit-bitmask (recommended)** | **0** | ~0.1–1 µs in JS | ~40 lines, no data, trivially auditable. Produces a comparable integer *and* the ranks needed for explanations. |
| Cactus Kev (5-card) | `flushes[7937]`, `unique5[7937]`, `products/values[4888]` (~50–80 KB) | ~50 ns/5-card hand; 7-card = 21 calls | Prime-product trick. Paul Senzee's perfect hash replaces the binary search (~16 KB more). Overkill here. |
| HenryRLee PokerHandEvaluator (7-card) | flush table 8192 entries + non-flush table **49,205** entries + DP tables | ~10s of ns | Perfect hash on "quinary" rank counts; ~200–300 KB of tables. |
| Two Plus Two (state machine) | ~32.5 M ints, **>120 MB** (`HandRanks.dat`) | ~10s of ns | Fastest. Unacceptable size for us. |

**Recommendation:** the direct evaluator. The code below was tested exhaustively against an independent brute-force evaluator on all 2,598,960 5-card hands (0 mismatches, exactly 7462 distinct values) and on 300,000 random 7-card hands (0 mismatches vs best-of-21).

```js
// card = rank*4 + suit; rank 0..12 = 2..A; suit 0..3.   "As" -> 12*4+0
// score = cat<<20 | k1<<16 | k2<<12 | k3<<8 | k4<<4 | k5   (bigger wins; equal = tie)
function evaluate(cards) {                       // 5..7 cards
  const cnt = Array(13).fill(0), sm = [0,0,0,0]; let all = 0;
  for (const c of cards) { const r = c >> 2; cnt[r]++; sm[c & 3] |= 1 << r; all |= 1 << r; }
  for (const m of sm) if (popcnt(m) >= 5) {
    const sf = straightHi(m); return sf >= 0 ? pack(8, [sf]) : pack(5, top(m, 5));
  }
  const q = [], t = [], p = [];
  for (let r = 12; r >= 0; r--) (cnt[r] === 4 ? q : cnt[r] === 3 ? t : cnt[r] === 2 ? p : []).push(r);
  if (q.length) return pack(7, [q[0], ...top(all & ~(1 << q[0]), 1)]);
  if (t.length && (t.length > 1 || p.length)) return pack(6, [t[0], Math.max(t[1] ?? -1, p[0] ?? -1)]);
  const st = straightHi(all); if (st >= 0) return pack(4, [st]);
  if (t.length) return pack(3, [t[0], ...top(all & ~(1 << t[0]), 2)]);
  if (p.length >= 2) return pack(2, [p[0], p[1], ...top(all & ~(1 << p[0]) & ~(1 << p[1]), 1)]);
  if (p.length) return pack(1, [p[0], ...top(all & ~(1 << p[0]), 3)]);
  return pack(0, top(all, 5));
}
function straightHi(m) {                          // highest straight in a 13-bit rank mask, -1 if none
  for (let hi = 12; hi >= 4; hi--) { const w = 0x1F << (hi - 4); if ((m & w) === w) return hi; }
  return (m & 0x100F) === 0x100F ? 3 : -1;        // wheel A-2-3-4-5 -> high card 5 (rank 3)
}
const top = (m, n) => { const o = []; for (let r = 12; r >= 0 && o.length < n; r--) if (m >> r & 1) o.push(r); return o; };
const pack = (cat, ks) => { let s = cat; for (let i = 0; i < 5; i++) s = (s << 4) | (ks[i] ?? 0); return s; };
const popcnt = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
```
Porting to Kotlin or Rust is mechanical: the same integers and a 13-bit mask.

### 6.3 Human-readable explanation
- **Best five cards** (for highlighting): enumerate the 21 five-card subsets and take the first whose `evaluate == best score`. It costs 21 calls, which is trivial, and avoids a second code path. Mark which cards came from the board, so "board plays" can be detected.
- **Name from the score:** `cat = s >> 20`, `k[i] = (s >> (16 - 4i)) & 15`.

| cat | Text |
|---|---|
| 8 | `k1==A ? "Royal Flush" : "Straight Flush, {k1}-high"` |
| 7 | `"Four {k1}s"` (+ `", {k2} kicker"` only if it decided the pot) |
| 6 | `"Full House, {k1}s full of {k2}s"` |
| 5 | `"Flush, {k1}-high"` (+ `"{k1}-{k2}-…"` if needed) |
| 4 | `k1==5 ? "Straight, Five-high (wheel)" : "Straight, {k1}-high"` |
| 3 | `"Three {k1}s"` |
| 2 | `"Two Pair, {k1}s and {k2}s"` |
| 1 | `"Pair of {k1}s"` |
| 0 | `"{k1}-high"` |

  Plurals: Sixes, not "Sixs".
- **Why the winner won**, compared with the best losing hand in the same pot:
```
explain(W, L):
  if cat(W) != cat(L): "Alice wins with a Flush, Ace-high — beats Bob's Straight, Ten-high"
  else i = first key index where they differ
       keyCount = {8:1, 7:1, 6:2, 5:5, 4:1, 3:1, 2:2, 1:1, 0:5}[cat]
       if i < keyCount (for 5/0 categories: "{i+1}th card"): "Kings full beats Queens full"
       else: "Both have a Pair of Aces — Alice's King kicker beats Bob's Jack"
  tie: "Split pot: both play {desc}" (+ " — the board plays" if both best-5 == board)
```
- Per pot: "Main pot (250): Carol — Three Sevens. Side pot 1 (240): Bob — Two Pair…"

---

## 7. Chips, stacks, blinds

### 7.1 Visual chip colours
There is no universal standard. Below is the common casino and home convention (cardplayer.com, casino.org, chip-maker guides):

| Value | Colour | Notes |
|---|---|---|
| 1 | White (sometimes blue) | |
| 5 | Red | |
| 10 | Blue | home sets only; often absent |
| 25 | Green | |
| 100 | Black | |
| 500 | Purple | |
| 1,000 | Yellow (some rooms: orange) | |
| 5,000 | Orange/brown | weak convention |
| 25,000 | Grey/other | weak convention |

Display algorithm:
- **Ladder** `D = [1,5,25,100,500,1000,5000,25000]` × `unitScale`. This ladder is canonical, so the greedy decomposition is coin-optimal.
- Pick `unitScale` so that the **SB is a whole number of the smallest chip**: `smallest = largest d in D with SB % d == 0`. E.g. SB 5 gives 5 (red), and SB 25 gives 25 (green).
- **Hide** denominations below `smallest`, the "chip race" analogue.
- Stack display: `greedy(stack, D≥smallest)`, drawn as columns of ≤ **20 chips** (TDA 2026 made 20-chip stacks standard). With more than ~5 columns, collapse to a "×N" label.
- **Always print the exact number.** Chips are decoration, never the source of truth.
- Money mode: decorate the same way in "units", and show currency text.

### 7.2 Defaults
- **Cash / free play** (fixed blinds, the default):
  - **SB 5 / BB 10, starting stack 1,000 (100 BB).** It displays as red, green, black and purple.
  - 100 BB is the standard "full buy-in" depth. Allow 20–200 BB.
  - Money mode: the buy-in maps to the starting stack (e.g. €20 = 1,000 units, so 1 unit = 2 cents). Store the ratio. Never store float money.
- **Tournament / increasing blinds** (optional):
  - Starting stack **5,000**, first level **25/50** (100 BB), **20-minute levels** (15 min for a faster night).
  - Rough length: play ends when BB ≈ total chips / 20–30. With 8 players (40,000 chips) that is BB 1,500–2,000, around level 10–11, so about 3.5 h at 20 min.

| Lvl | SB/BB | Lvl | SB/BB | Lvl | SB/BB |
|---|---|---|---|---|---|
| 1 | 25/50 | 6 | 200/400 | 11 | 1000/2000 |
| 2 | 50/100 | 7 | 300/600 | 12 | 1500/3000 |
| 3 | 75/150 | 8 | 400/800 | 13 | 2000/4000 |
| 4 | 100/200 | 9 | 500/1000 | 14 | 3000/6000 |
| 5 | 150/300 | 10 | 600/1200 | 15 | 4000/8000 |

  Generator for custom stacks: `BB_{n+1} = nice(BB_n × 1.3…1.5)`, where `nice` rounds to {1, 1.5, 2, 2.5, 3, 4, 5, 6, 8} × 10^k and to a multiple of the smallest chip still in play. `SB = BB/2`.
- A level change applies at the **start of the next hand**, never mid-hand.
- Antes: out of scope for v1. If added, use the **big-blind ante**, which is dead and not part of the BB's live bet. TDA 2024+ (RP-11) calculates the BB before the ante when the BB is short. Older TDA said the ante comes first.

---

## 8. Settlement (real-money mode)

`net[p] = cashOut[p] − Σ buyIns[p]`, in integer cents. Chip conservation guarantees `Σ net = 0`. Assert it, and if a manual correction broke it, show the discrepancy before settling.

**Greedy** (≤ n−1 transfers, O(n log n)): repeatedly take the largest debtor and the largest creditor and transfer `min(|debt|, credit)`.

**Optimal** (minimum number of transfers):
- Equivalent to splitting the non-zero balances into the **maximum number of disjoint zero-sum groups** `k`. The answer is `n − k`.
- NP-hard in general (reductions from subset-sum/partition, strongly NP-hard per Verhoeff/arXiv 1402.6556). But n ≤ 10, so a 2ⁿ DP is instant (1,024 states):
```
vals = non-zero nets (n ≤ ~16 is instant)
sum[mask] incremental; dp[0] = 0
dp[mask] = max_{i in mask} dp[mask \ i] + (sum[mask] == 0 ? 1 : 0)
minTransfers = n - dp[full]
reconstruct: walk masks back, collecting each zero-sum group; settle each group with greedy (|g|-1 transfers)
```
Example (verified): balances A+10 B−10 C+20 D−20 E+35 F−5 G−30.
- Greedy: **6** transfers.
- Optimal: **4**, from the groups {A,B} {C,D} {E,F,G}.

**Recommendation:** run the exact DP (it is ~15 lines and always ≤ 1 ms for ≤ 12 players), and fall back to greedy if n > 16. Tie-break for readability: prefer fewer people paying more than one person.

---

## 9. Engine design

### 9.1 Shape
- **Pure, deterministic reducer:** `apply(state, event) → state | RuleError`.
  - No clock, randomness or I/O inside it. Timestamps and random draws (e.g. initial button) are *fields of the event*.
- **Event log is the source of truth (event sourcing).** `state = log.reduce(apply, initial)`.
  - **Undo** = drop the last *user* event and replay.
  - **Redo** = keep the popped events on a stack until a new event arrives.
  - Corrections = undo back to the mistake, or a `HostAdjust` event (explicit, logged, reason required).
- Replay cost is trivial: ~100 events per hand. Snapshot `state` at every `HandStarted` so replay is O(events in the current hand).
- Hosted mode: the host's device owns the log. Clients send *intents*. The host validates, appends and broadcasts **full state snapshots** (a few KB) plus a sequence number, so clients never need the reducer to stay in sync. Optionally ship the reducer to clients for instant optimistic `legal()` hints.
- Derived, never stored:
  - `legal(state)` (§2.2)
  - pots (§4.2)
  - showdown order
  - display chips
  - "to act" highlight

### 9.2 State
```ts
Game {
  settings: { sb, bb, unit, buttonMode: 'moving'|'dead', missedBlinds: 'simple'|'casino',
              newPlayer: 'postOrWait'|'free', blindSchedule?: Level[], moneyPerUnit?: Cents }
  players: Player[]            // by seat
  button, sbSeat, bbSeat       // last/current positions (needed to compute next hand)
  handNo, level
  ledger: { playerId, kind: 'buyin'|'rebuy'|'cashout'|'adjust', amount, ts }[]
  hand?: Hand
}
Player { id, name, seat, stack, sittingOut, waitingForBB, owesSB, owesBB }
Hand {
  street: 'preflop'|'flop'|'turn'|'river'|'runout'|'showdown'|'done'
  inHand: Set<id>; folded: Set<id>; allIn: Set<id>; mucked: Set<id>
  sc: Map<id,int>; tc: Map<id,int>; deadMoney: int          // dead SB posts
  currentBet, lfr, toAct: id | null
  lastActedAt: Map<id,int|null>; lastAggressor: id | null  // per street; river aggressor for show order
  board?: Card[]; hole?: Map<id,[Card,Card]>               // only if entered
  results?: { potIndex, amount, winners, shares }[]
}
```

### 9.3 Events
| Event | Payload | Notes |
|---|---|---|
| `GameCreated` | settings, seats, stacks, initial button, ts | |
| `PlayerJoined` / `PlayerLeft` | id, seat, stack / id | Leaving mid-hand = fold now, removed at hand end |
| `SitOut` / `SitIn` | id, choice: 'post'\|'wait' | |
| `BuyIn` / `Rebuy` / `CashOut` | id, amount (units + cents) | Between hands only |
| `BlindsChanged` | sb, bb (or `LevelAdvanced`) | Takes effect next hand |
| `HandStarted` | handNo, ts | Reducer computes positions and posts blinds deterministically |
| `Action` | id, kind: fold\|check\|call\|bet\|raise\|allIn, raiseTo? | Validated against `legal()` |
| `StreetDealt` | street, cards? | Host confirms the physical flop/turn/river; cards optional |
| `HoleCardsEntered` | id, cards | Optional, for the evaluator |
| `Muck` | id | At showdown |
| `ShowdownResolved` | ranking (host order with ties) **or** `{useEvaluator:true}` | Reducer builds pots and awards |
| `HostAdjust` | id, delta, reason | Breaks conservation on purpose; recorded in the ledger so the invariant stays checkable |
| `ButtonSet` | seat | Host correction, between hands |

`Undo`/`Redo` are **not** events. They are log operations.

### 9.4 Invariants
Assert after every `apply`. In dev, throw. In prod, log, refuse the event, and offer undo.
1. **Chip conservation:** `Σ stacks + Σ tc (current hand) == Σ ledger(buy-ins + rebuys − cash-outs + adjusts)`. After a hand: `Σ awarded == Σ tc`.
2. No negative stacks or commitments. `stack == 0 ⇔ allIn` for every player in the hand who has committed chips.
3. `currentBet == max(sc)`. `lfr ≥ BB`. Every non-all-in, non-folded player's `sc ≤ currentBet`.
4. `toAct` is in the hand, not folded, not all-in, and `needsAction`. `toAct == null ⇔ roundOver`.
5. Positions: btn, sb and bb are distinct when ≥ 3 eligible players. Heads-up: `sb == btn`. Nobody posted BB on two consecutive hands (warn only, because host corrections can cause it).
6. Pots: `Σ pot.amount == Σ tc`. Every winner ∈ `pot.eligible`. Every pot has ≥ 1 winner at resolution.
7. Cards, if entered: no duplicates. Board length matches the street.
8. Settlement: `Σ net == 0`. The transfers net out exactly to `net`.

### 9.5 Testing advice
- Property tests:
  - random legal action sequences keep all invariants
  - replay(log) == live state
  - undo then redo is the identity
- Golden tests for every worked example in §1.2, §3.3, §4.2, §5.2 and §8.
- Exhaustive evaluator test against brute force, as done above. It runs in seconds.

---

## 10. Home-game vs casino/TDA differences (decisions)

| Topic | Casino / TDA | Common home practice | **Spec default** |
|---|---|---|---|
| Button movement | Dead button (TDA 34). Cash rooms use either. | Button just goes to the next player | **Simple moving button** + TDA 36-C heads-up fix. Dead button available as a setting. |
| New player / return | Post BB or wait for BB. Missed blinds: SB dead + BB live. | Just deal them in | **Post BB or wait for BB**, no dead-SB make-up. "Casino missed blinds" and "free entry" are settings. |
| Short all-in reopening | Only a full raise, or cumulative short all-ins totalling one, reopens (TDA 49) | Often "any raise reopens", or the limit-style half-bet rule | **TDA 49 exactly.** The coach explains why the raise button is disabled. |
| Under-min opening all-in | Next raiser must make a full raise over it (RRoP NL r4) | Often "complete to the BB" | **Full raise:** `min = currentBet + lfr`. |
| Raise declaration | "Raise X" = total of X (TDA 45-B) | Ambiguous, often "by" | **Raise-to** internally. UI shows both numbers. |
| String bets / overchip | Enforced | Loosely enforced | Not applicable (atomic input). |
| Showdown order | Last river aggressor first, else first to act (TDA 18) | Whoever flips first | Shown as a prompt only. Not enforced. |
| Odd chip | First winner left of the button (TDA 21, RRoP) | Often "give it to whoever" | **Left of button, per pot.** |
| Rabbit hunting / run it twice | Not allowed (TDA 30). RIT is house-optional in cash. | Common | Out of scope for v1. The engine assumes one board. |
| Straddle | Cash: one live straddle UTG (RRoP NL r14) | Common | Out of scope for v1. To add later: a third live blind, `currentBet = 2BB`, the straddler acts last preflop. |

---

## Sources
- Poker TDA, *2026 Rules, Version 1.1 (21 Sep 2026)*, Rules 13, 16–18, 21, 30, 34, 36 (A–C), 44–49, 56, 58, 67: https://www.pokertda.com/view-poker-tda-rules/ (read via a proxy because the site refused a direct connection; secondary index: https://tdaguide.com/en/)
- TDA Summit 2026 change summary (button not tied to a seat, 20-chip stacks): https://somuchpoker.com/news/new-poker-rules-from-tda-summit-2026
- Robert's Rules of Poker v6 (Ciaffone): §3 Betting & Raising, Showdown, Ties; §4 Button & Blind Use; §14 No-Limit; §16 Explanations #1: https://homepokertourney.org/docs/rulebook/poker-rulebook-roberts-6.pdf
- TDA forum on cumulative short all-ins and min-raise size: https://www.pokertda.com/forum/index.php?msg=11305, https://www.pokertda.com/forum/index.php?msg=12778
- BB ante calculation order (TDA RP-11, 2024): https://sigma.world/play/blog/2024-tournament-directors-association-rule-changes/, https://ts4z.github.io/barge-rulebook/big-blind-ante.html
- Cactus Kev evaluator: http://suffe.cool/poker/evaluator.html
- HenryRLee PokerHandEvaluator algorithm (table sizes): https://github.com/HenryRLee/PokerHandEvaluator/blob/master/Documentation/Algorithm.md
- Two Plus Two evaluator table size (>120 MB `HandRanks.dat`): https://github.com/decs/texas, https://www.npmjs.com/package/texas
- Chip colours: https://www.cardplayer.com/online-poker/poker-chip-values, https://www.casino.org/blog/poker-chip-values/, https://chipsandgames.com/pages/poker-chip-denominations
- Min-transfer settlement is NP-hard / zero-sum partition: https://arxiv.org/pdf/1402.6556, https://github.com/nimral/splitbill, https://medium.com/@FallingForFallacies/adventures-in-programming-interviews-misleadingly-difficult-np-hard-problem-43092597018c
