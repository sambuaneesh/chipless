# Product Spec v1.0

> Working name: **Poker Chips**. Status: ready for review, 2026-11-17.
> Background: [research/ux.md](research/ux.md), [research/rules.md](research/rules.md), [research/stack.md](research/stack.md).
> Decisions: [ADR-0001 stack](adr/0001-lean-kotlin-stack.md), [ADR-0002 rules defaults](adr/0002-rules-defaults.md).

## 1. One-liner
A poker table in your pocket for real-card home games with no chips. The app is the chips, the dealer button, the pot and the **floor manager**: it runs every hand correctly, teaches beginners in context, and syncs live to every player's phone.

## 2. Principles
1. **Floor manager, not a calculator.** The app tells the dealer what to deal, tells each player in one sentence what they can do, and calls turns out loud. A table of total beginners plays a correct hand without reading rules.
2. **Teach by pulling, never pushing.** No tutorial. Buttons state the consequence ("Call 40"), "Why?" sits behind a long-press, and hints fade per player as they learn.
3. **Undo over confirm.** No "are you sure?" dialogs. Mistakes are cheap to reverse, and every correction is visible.
4. **Numbers are the truth; chips are the feel.** Exact numbers are always shown. Animated chips carry motion and delight, never information.
5. **Tiny, instant, offline.** APK < 1 MB, no accounts, no cloud, no ads.
6. **Accessible by default.** Big targets, high contrast, no colour-only meaning, screen readers, reduced motion.

## 3. Scope (v1)
| Area | Decision |
|---|---|
| Game | No-Limit Texas Hold'em. Real cards dealt physically; the app never deals cards. |
| Players | 2–10 seats. |
| Modes | **Pass-and-play**: one phone flat on the table. **Hosted**: the host phone serves the table on the LAN or hotspot, and others join by QR code from any browser (no install). Both modes come from the same app and engine. |
| Blinds | **Fixed** by default (SB 5 / BB 10, stack 1,000), editable between hands. Optional **timed levels** (tournament schedule). |
| Showdown | The host taps the winner(s). The **Referee** (enter board and hole cards → winner + explanation) is a must-have. |
| Value | **Free play** (points, leaderboard) or **Real buy-ins** (buy-ins, rebuys, settlement). |
| Network | Same room only. No internet required. |
| Look | Dark, near-black with a green cast, one brass accent. |

**Out of scope for v1:** remote play over the internet, virtual card dealing, other variants (PLO, limit), straddles, antes, run-it-twice, camera card scan, iOS native app.

## 4. Core flows

### 4.1 First launch → game
1. **Home:** two big buttons, **Play on this phone** and **Host a table**, plus **Resume** if a game is in progress.
2. **Setup** (one screen, sensible defaults, can be skipped):
   - **Players:** type names and drag them around a ring to match where people physically sit.
   - **Stakes:** a preset chip (Casual 5/10 · 1,000, Deep, Tournament) or custom.
   - **Value:** Free play / Real buy-ins (currency and the buy-in → chips ratio).
   - **Teaching level:** Beginner / Mixed / Pro.
3. **Start**: the button is randomised (or set by tapping a seat) and the first hand begins.

### 4.2 Joining a hosted table (target < 10 s)
1. The host screen shows a QR code, the Wi-Fi/hotspot name, a short fallback URL, and optionally a Wi-Fi QR as step 0.
2. The guest scans the code and the page loads (< 60 KB gz).
3. **"Who are you?"** shows the names the host already seated plus a **New player** option. One tap claims the seat. A device token in `localStorage` allows silent rejoin.
4. The host's seat ring shows a presence dot: green = connected, amber = reconnecting, grey = away.

### 4.3 A hand
1. **Dealer cue card:** "Deal 2 cards to each player, starting with Ben (left of the button)." Blinds are posted automatically and shown as chips sliding in.
2. **Betting:** the active seat glows toward the real person, the host phone chimes and speaks "Anna, it's on you", and the **narrator line** states the situation ("Ben raised to 120. Anna: call 120, raise to 200+, or fold").
3. **Between streets:** the cue card reads "Burn 1 · Deal 3 — the Flop" (then the Turn and the River). Bets sweep into the pot.
4. **All-in run-out:** when no more betting is possible, the app tells the dealer to deal out the remaining cards and goes straight to showdown.
5. **Showdown:** the app prompts who shows first (as guidance only), then **Pick winner(s)** per pot, or opens the **Referee**.
6. **Award:** the pot flies to the winner(s) (the one indulgent animation, skippable). The odd chip is handled automatically. A replay card is available.
7. **Next hand:** the button moves, and busted players are offered a rebuy (money mode) or sit-out.

### 4.4 Referee (hand evaluator)
- Card entry: a 4 × 13 rank-and-suit grid with large targets. Used cards are greyed out. Board first (shared), then each contender's 2 cards.
- The result shows the best five cards lit up, plus a sentence: "Anna wins with Two Pair, Kings and Sevens. Ben had the same two pair, but Anna's Queen kicker plays."
- Handles splits and side pots: each pot is resolved among the players eligible for it.
- Also available outside a hand as a "Who wins?" calculator.

### 4.5 End of night
- **Free play:** leaderboard and a shareable summary card.
- **Real buy-ins:**
  - Each player's net result comes first ("+₹230").
  - Then the **fewest transfers** (exact minimum for ≤ 10 players), or **Via host**.
  - A "Balanced ✓ — 4,000 in, 4,000 out" check, a per-player buy-in timeline, and a shareable text/image summary.

## 5. Screens
| Screen | Notes |
|---|---|
| Home | Play here · Host · Resume · Settings |
| Setup | Seat ring editor, stakes, value mode, teaching level |
| Table: pass-and-play | Full seat ring, pot, street, cue card, narrator, action panel rotated toward the active player (toggle). Keeps the screen on. Pot and bets ≥ 32 sp. |
| Table: host | Same as pass-and-play, plus a QR/presence panel and a per-seat ⋯ menu: act for, sit out, rebuy, edit stack, remove |
| Table: guest (browser) | "My seat" view: huge stack, to-call, action bar in the bottom 40 %, compact table strip (tap → full ring), private pre-actions. Calm when idle; full-bleed accent wash on your turn. |
| Raise tray | In place, not a modal: context presets (×BB preflop, pot fractions postflop), a slider with ±1 BB haptic ticks, a tap-to-type keypad (opens empty), hold 600 ms for all-in |
| Referee | Card grid → verdict |
| History | Narrator log (swipe down) + hand replays |
| Settlement | Net → transfers → summary |
| Settings | Stakes, timer, sounds/TTS, teaching level, button rule, missed-blind rule, motion, four-colour suits |

## 6. Action model ("tap, size, hold")
- **Check/Call:** one tap. Fold is **hidden when check is free**.
- **Raise:** tap **Raise…**, choose a preset or drag/type, then tap **Raise to X (+Y)**. Two taps for a preset raise.
- **All-in:** hold for 600 ms (a ring fills). It can never happen from a single accidental tap.
- **Undo:** the actor can undo until the next player acts; the host can undo anything. Corrections are logged in the narrator ("Host corrected Ben's stack to 1,200").
- **Pre-actions** (guest phones, private): Check/Fold · Call any · Check.
- **"Why?":** long-press any disabled control for a one-line rule.

## 7. Feature priorities
**Must (v1):**
- A rules engine per ADR-0002, with a plain-language "why".
- Narrator line, dealer cue card, and consequence-labelled buttons.
- The tap/size/hold action model, plus undo and host corrections.
- Pass-and-play seat ring that mirrors the real table, with the panel rotating toward the actor.
- Hosted mode: QR join < 10 s, silent rejoin, presence dots, no auto-fold for disconnected players.
- Host audio cue (chime + TTS name).
- Referee evaluator with explanation.
- Free play and real buy-ins with exact settlement.
- Crash-proof persistence: the action log is saved after every action.
- Fixed blinds + optional level timer.
- Accessibility baseline.

**Should:**
- Context-aware raise presets.
- Pre-actions.
- Hand replay card.
- Hints that fade per player (teaching level).
- Calm/active guest states.
- Haptic vocabulary.
- Sound set.
- Shareable summary card.

**Could:**
- Expert gestures.
- A "big screen" spectator view (TV or tablet browser).
- A shot clock.
- Four-colour suits and a custom accent colour.
- Camera card scan on the host.

## 8. Non-functional targets
| Metric | Target |
|---|---|
| APK size | < 1 MB (budget enforced in the build) |
| Cold start to interactive | < 400 ms on a mid-range phone |
| Web client | < 60 KB gzipped total (JS + CSS + SVG), system fonts |
| Action → all phones updated | < 100 ms on LAN |
| Animation | 60 fps; transform/opacity only; input never blocked |
| Hosting session | Survives 6+ h, screen-lock on guests, the app being killed (resume from the log) |
| Accessibility | ≥ 48 dp targets (≥ 64 dp primary), 4.5:1 contrast, TalkBack/VoiceOver, reduced motion, font scaling |
| Privacy | No analytics, no network calls beyond the LAN, no accounts |

## 9. Platform constraints we design around
- Guests use **plain http on the LAN**, which is not a secure context: no Wake Lock, Notifications or Service Workers, and no vibration on iOS. Hence the host-audio turn cue, a muted-video keep-awake fallback, and robust reconnect (visibilitychange + ping health check + full snapshot).
- Host background survival: a foreground service (`specialUse`/`connectedDevice`, never `dataSync`), the screen kept on, a battery-optimisation hint.
- Android 17 `ACCESS_LOCAL_NETWORK` permission (when targeting API 37).
- Host IP detection on Wi-Fi and hotspot; the raw IP goes in the QR code.
- Client isolation on public or campus Wi-Fi → suggest a hotspot after 30 s with no joins. Hotspot without data → advise guests to "stay connected".

## 10. Open questions
- App name and icon.
- Should TTS announcements be on by default on the host? (Proposed: chime on, voice on in Beginner mode.)
