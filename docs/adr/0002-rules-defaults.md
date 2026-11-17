# 0002. NLHE rules defaults for home games

- Status: Accepted
- Date: 2026-11-17

## Context
Casino/TDA rules and common home-game practice differ. The engine must be correct, and beginners must be able to understand it. The full analysis is in [research/rules.md](../research/rules.md) (TDA 2026 v1.1 and Robert's Rules v6).

## Decision
| Topic | Default | Setting |
|---|---|---|
| Button movement | Simple moving button, plus the TDA 36-C heads-up fix (nobody posts the BB twice in a row) | Dead button (TDA 34) |
| New or returning player | Post the BB or wait for the BB; no dead-SB make-up | Casino missed blinds / free entry |
| Short all-in reopening | TDA 49: only a full raise (or cumulative short all-ins totalling one) reopens the action | none |
| Under-minimum opening all-in | The next raiser must make a full raise: `min = currentBet + lastFullRaise` | none |
| Bet semantics | Raise-to internally (TDA 45-B); the UI shows both ("to 300 (+200)") | none |
| Odd chip | First winner clockwise from the button, per pot | none |
| Showdown order | Prompted (last river aggressor, otherwise first to act); not enforced | none |
| String bets / overchip | N/A (atomic input) | none |
| Heads-up | The button posts the SB, acts first preflop and last postflop | none |
| Blind level changes | Take effect at the start of the next hand | none |
| Straddle, antes, run-it-twice | Out of scope for v1 | none |

**Engine shape:** a pure deterministic reducer over an append-only action log (event sourcing). Undo is a replay of `log[0..n-1]`. The invariants checked after every action include chip conservation (sum of stacks + pots = chips in play + buy-ins).

**Evaluator:** a small, table-free 7-card evaluator from scratch (best 5 of 7 with ranking values). Verified in research against brute force on all 2,598,960 5-card hands (7462 distinct classes).

**Settlement:** exact minimum number of transfers (subset DP, ≤ 10 players), with a greedy fallback.

## Consequences
- The rules are casino-correct where it matters for fairness (reopening, min-raise, side pots, odd chip) and forgiving where home games are informal (button, missed blinds, showdown order).
- The "Why?" explanations must cover TDA 49 and the min-raise rule specifically; these are the rules beginners trip on most.
