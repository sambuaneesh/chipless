# Product Spec (draft v0.1)

## One-liner
A poker table in your pocket for home games with real cards and no chips:
it tracks chips, enforces betting rules, teaches beginners, and syncs live to every player's phone.

## Principles
1. **Fast and tiny.** No bloat, minimal dependencies, small install size, instant response.
2. **Human-centric.** Beginners can play correctly from the first hand; experienced players are never slowed down.
3. **Works offline.** Same-room play over local Wi-Fi or a hotspot. No accounts, no cloud.
4. **One source of truth.** The host device runs the authoritative game engine.

## Decided
| Topic | Decision |
|---|---|
| Cards | Real, physical cards are dealt. The app does not deal cards. |
| Game | No-Limit Texas Hold'em only (v1). |
| Modes | **Two in one:** (a) *Pass-and-play*: whole game on a single phone. (b) *Hosted*: the host's phone serves the table on the local network, and players join from any phone browser (QR code), no install needed. |
| Actions | In hosted mode each player acts from their own device; the host can act for anyone, undo, and correct. |
| Showdown | Host taps the winner(s); the app splits the pot, including side pots. |
| Hand evaluator | **Must have:** optionally enter board + hole cards and the app determines the winner(s) and explains why. |
| Chip value | Two modes: **Free play** (points only) and **Real buy-ins** (track buy-ins/rebuys, end-of-night settlement). |
| Look | Dark and aesthetic. |
| Network | Same room only (LAN / hotspot). Remote play out of scope for v1. |

## Open
- ~~Stack choice~~ → decided: lean Kotlin + vanilla TS web client ([ADR-0001](adr/0001-lean-kotlin-stack.md)).
- Blind structure: fixed vs timed levels.
- Typical player count (assumed 2–10).
- UX research findings to fold in. See `docs/research/`.
