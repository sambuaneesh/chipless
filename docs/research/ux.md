# UX Research: Human-Centric Poker Table Companion

*Research date: 2026-11-17. Background research, not normative. Sources are linked inline. All store listings are vendor marketing unless marked as a user review.*

**Method note.** Reddit (r/poker, r/homegames) could not be reached by the research tools: the domain blocks automated agents. Store pages gave few written reviews. The strongest real user feedback came from public issue trackers (PokerNow, Phenom Poker), the few App Store reviews that could be fetched, and rules and etiquette literature. Treat the competitor section as directional, not statistically solid.

---

## 0. TL;DR

1. **No app in this category is truly beginner-first.** Every competitor is a ledger or chip tracker for people who already know poker. The gap is an app that *runs the game*: it tells the dealer what to deal, tells each player what they can do and why, and explains who won.
2. **The app removes whole classes of live-poker errors for free.** String bets, miscounted pots, wrong change, chip-count mismatches at cash-out, and forgotten blinds cannot happen, because chips are numbers. Say this in the UX ("the pot is always right").
3. **Teach by pull, not push.** No tutorial. Show one contextual sentence at the moment it matters (e.g. "Call 40 to stay in, or raise to at least 80"). Hints fade per player as that player shows they know the rule.
4. **Betting UI: one tap for the common action, two for sizing, a hold for all-in.** Undo grace period instead of "are you sure?" dialogs. Fold is never the easiest button when checking is free.
5. **Hosted mode has a hard platform constraint.** A plain-HTTP LAN page is *not a secure context*, so the Wake Lock, Notifications, Service Worker and Web Share APIs are unavailable to joined phones. Vibration is unavailable on iOS entirely. The **host phone's speaker** (chime or voice: "Anna, your turn") is the only universal turn cue. Design for that.

---

## 1. Existing apps: landscape and pain points

### 1.1 What exists

| App | Model | Notable | Source |
|---|---|---|---|
| **AirChips** (web) | One phone in middle, or QR join from Safari/Chrome | Raise sheet with 33/50/100 % pot, ±1/±BB steps, slider to all-in; tap-winners side-pot split; drag-and-drop "Manage Mode"; min-transfer "Settle Up" | [airchips.onrender.com](https://airchips.onrender.com/) |
| **PartyPot** (iOS/Android) | Host room, QR join as guest | Auto blinds, auto side pots, audit log, "Smart Settlement with minimum transfers"; wallet → table buy-in metaphor | [poker mode](https://partypotapp.com.advisoryapps.com/features/poker-mode/), [QR joining](https://partypotapp.com.advisoryapps.com/features/qr-code-joining/) |
| **Chip Runner** (iOS) | Room codes, or Single Phone Mode | Auto blinds and dealer rotation, undo, side pots, settlement | [Product Hunt](https://www.producthunt.com/products/chip-runner/reviews) |
| **Chipkly** (web) | QR, browser, no account | "Playing in 30 seconds"; maker built it after tracking bets "on paper, in WhatsApp notes, and once on a pizza box", which led to disputes | [hunted.space](https://hunted.space/product/chipkly) |
| **Chips of Fury / Poker 4 Friends** | Full online poker app with a "Chips Only" mode | 4.6★ App Store; 20 variants; Pro subscription | [App Store](https://apps.apple.com/gb/app/id1292493748) |
| **Poker Chips Anywhere** | "First-person perspective" app | 3.0★; "you will need an app for each number of players" | [App Store](https://apps.apple.com/gb/app/id6476509645) |
| **Virtual Chips** | Single device | Reviews complain about ads | [App Store](https://apps.apple.com/us/app/virtual-chips/id1296350745) |
| **Chip Stack, PokerTally, PokerPot, Poker Homie, Chip & Split, PokerSquad** | Buy-in and cash-out ledgers only | Settlement math; PokerPot "splits mismatch when chip counts don't add up" | [Chip Stack](https://apps.apple.com/ms/app/chip-stack/id6749646618), [PokerTally](https://apps.apple.com/app/id6757504448), [PokerPot](https://apps.apple.com/us/app/-/id6758568455), [Chip & Split](https://apps.apple.com/us/app/chip-split/id6760094587) |

**Takeaway:** the feature set (QR join, auto blinds, side pots, min-transfer settlement) is now **table stakes**. Several apps already have it. Differentiation must come from *how it feels* and from *teaching*, not from the feature list.

### 1.2 What users love and hate (evidence)

| Signal | Evidence | Implication |
|---|---|---|
| ❤️ Automation of blinds and dealer | "the app automatically handles the big blind, small blind, and dealer" ([Chips of Fury review](https://apps.apple.com/gb/app/id1292493748)) | Never ask the user to post blinds or move the button |
| ❤️ No paywall or trial | "No free trial needed unlike other poker chip sites" ([Poker Chips Anywhere review](https://apps.apple.com/gb/app/id6476509645)) | Free core; no gates mid-game |
| 💔 Ads | "adds come after nearly every action" ([Virtual Chips review](https://apps.apple.com/us/app/virtual-chips/id1296350745)) | Zero interstitials, ever |
| 💔 Rigid settings mid-game | "blinds couldn't be increased mid-game" ([Chips of Fury review](https://apps.apple.com/gb/app/id1292493748)) | Every setting editable live by the host |
| 💔 Custom bet entry on mobile | Clearing the pre-filled amount "takes several attempts… by the time the intended amount is typed in, [my] cards have already been folded" ([PokerNow #549](https://gitlab.com/poker-now/poker-now-hub/-/issues/549)) | Keypad starts empty, or typing replaces the value; no timer pressure |
| 💔 Accidental all-in | "people hit alot by mistake when playing on mobile phones" ([PokerNow #830](https://gitlab.com/poker-now/poker-now-hub/-/issues/830)) | All-in needs a deliberate gesture |
| 💔 Folding when check is free | Request to remove Fold when Check is available, because recreational players "fold by mistake" ([Phenom Poker](https://phenompoker.featurebase.app/p/the-fold-button-when-the-check-option-is-available)); Phenom later shipped "players can no longer fold when no action is required" ([changelog](https://phenompoker.featurebase.app/en/changelog/platform-updates-november-20th)) | Hide or demote Fold when Check is free |
| 💔 Presets that don't match how people play | "1/2, 3/4, pot… too high", users want 1/3 ([PokerNow #130](https://gitlab.com/poker-now/poker-now-hub/-/issues/130)); others want 2.25/2.5/2.75× rows ([pokertraining forum](https://www.pokertraining.com/poker/forum/discussion/comment/1128/)) | Context-aware presets (preflop = ×BB, postflop = pot fractions) |
| 💔 Install friction | All the newer apps market "no install, no account" as the headline ([Chipkly](https://hunted.space/product/chipkly), [AirChips](https://airchips.onrender.com/)) | Already decided (browser join); keep it under 10 s |

---

## 2. Beginner pain points → in-context answers

**Teaching philosophy.** NN/g found that users who read an app tutorial did *no better* than those who skipped it (91 % vs 94 % task success) and advises spending effort on usability instead ([NN/g mobile onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/)). Help should be **pull revelations**, triggered by the user's situation, not **push revelations** that appear regardless of context ([NN/g tutorials](https://www.nngroup.com/articles/onboarding-tutorials/)). Jackbox's rule for non-gamers: "give them one task at a time" and "make sure they always know what to do next" ([Built In](https://builtin.com/articles/jackbox-games-design-party-pack)).

| Confusion | Source | In-app answer (shown only when relevant) |
|---|---|---|
| **Whose turn is it?** Acting out of turn leaks info and is binding in casinos | [PokerBank](https://www.thepokerbank.com/strategy/general/live-player-mistakes/), [DeucesCracked](https://www.deucescracked.com/blog/live-poker-rules-string-bets-acting-out-of-turn-explained) | A single glowing seat, the name in huge type, a spoken name. In hosted mode, only the actor's phone has live buttons; others get *private* pre-actions ("Check/Fold", "Call any"), which leak nothing in a live game |
| **Check vs call vs bet vs raise** | general | Buttons always state the consequence: "Check (free)", "Call 40", "Raise to…". Never a bare "Call" |
| **Minimum raise**; short all-ins that don't reopen betting (even rules columnists disagree) | [PokerSkill](https://www.pokerskill.com/poker-glossary/reopen-the-betting/), [Card Player](https://cardplayer.com/cardplayer-poker-magazines/65751-vitaly-lunkin-22-13/articles/18539-raising-the-minimum-amount) | The engine enforces TDA rules silently. The sizer starts *at* the min raise. When a rule bites, one line explains it: "Ben can only call or fold, Cara's all-in was less than a full raise." |
| **Blinds and button movement**; heads-up reversal (button = SB, acts first preflop, last after) | [homepokertourney](https://homepokertourney.org/mobile/poker-button-rules.htm) | Automatic. A "D / SB / BB" token animates to the new seat at each hand start. A narrator line explains heads-up the first time it happens. Use the **dead-button** rule (recommended for home games by the same source) |
| **Burn and deal sequence**: forgetting to burn is "the single most commonly forgotten step by new dealers"; some deal the board early | [How to Deal](https://cache.esports.gg/guides/betting/how-to-deal-texas-holdem) | **Dealer prompt** after each betting round: "Dealer: burn 1, deal 3 (the Flop)". The burn line is optional (home-game setting) |
| **String bets** | [PokerBank](https://www.thepokerbank.com/strategy/general/live-player-mistakes/) | **Impossible**: the amount is committed atomically. Don't mention it, just remove the problem |
| **Pot size tracking** | [PokerBank](https://www.thepokerbank.com/strategy/general/live-player-mistakes/) | The pot is always visible, plus "to call" and pot odds (experienced setting) |
| **Side pots**: beginners think an all-in player can win chips they didn't match | [BetterPoker](https://betterpoker.vercel.app/learn/absolute-beginner/rules-and-hand-rankings/all-ins-and-side-pots) | Pots render as separate stacks labelled with *eligible faces*: "Main 120 · Anna Ben Cara Dan" / "Side 60 · Ben Dan". Winner taps are per pot; ineligible players are greyed out |
| **Showdown order**: the last aggressor on the river shows first; if checked through, the first player left of the button | [TDA via pokertda.com](https://www.pokertda.com/view-poker-tda-rules/), [Wikipedia](https://en.wikipedia.org/wiki/Showdown_(poker)) | "Showdown: Cara shows first (she bet the river)", then a clockwise highlight. On an all-in with action complete: "Everyone turn your cards face up" |
| **Hand rankings, kickers, playing the board, split pots, suits never break ties** | [PokerNews kicker](https://www.pokernews.com/poker-hands/kicker-in-poker.htm), [playing the board](https://www.pokernews.com/poker-hands/playing-board.htm), [PokerStrategy](https://www.pokerstrategy.com/glossary/Kicker/) | Optional evaluator: highlight the **best five** of each hand; the tie-break line reads "Both have a pair of Kings → Anna's Q kicker beats Ben's J". When the board plays: "The board plays, split the pot." A rankings sheet is one tap away (pull), never pushed |
| **Odd chip in a split** | [PokerNews split pot](https://www.pokernews.com/poker-hands/split-pot.htm) | Automatic (first seat left of the button), with a one-line note |

**Hint lifecycle (progressive disclosure).**
- **Novice:** one sentence under the action bar ("You can check, it's free to see the next card.").
- **Learned:** the hint disappears after the player has taken that decision type correctly about 3 times. Track this per player, not per device.
- **Regular:** no hints; numbers only.
- A table-wide "Teaching" toggle sets the default (Beginner table / Mixed / Pros). Each player can override it on their own phone.

---

## 3. Betting interaction design

### 3.1 Evidence

- Slider plus presets (½, ⅔, Pot, Min, All-in) is the industry pattern ([BetterPoker interface](https://betterpoker.vercel.app/learn/absolute-beginner/positions-and-table-mechanics/online-interface-basics)). Slider fine-tuning is poor on phones, and users ask for more presets ([pokertraining forum](https://www.pokertraining.com/poker/forum/discussion/comment/1128/)).
- partypoker moved tables to portrait "making it much easier for players to play one-handed" ([pokerfuse](https://pokerfuse.com/news/poker-room-news/211022-exclusive-partypokers-new-mobile-app-switches-portrait-mode/)).
- Hoober observed 49 % one-handed grip and 75 % single-thumb interaction. He recommends targets of 7 mm centre / 9 mm edges / 12 mm corners, and "10 mm if you possibly can" ([mobiforge](https://mobiforge.com/design-development/designing-touch-thumb-and-finger-sized-design), [Smashing](https://smashingmagazine.com/2022/02/fitts-law-touch-era/)). WCAG 2.2: 24 px minimum (AA), 44 px enhanced (AAA) ([Smashing](https://smashingmagazine.com/2024/07/getting-bottom-minimum-wcag-conformant-interactive-element-size/)). Android: 48 dp.
- "Never use a warning when you mean undo": people click through warnings, and undo is what prevents loss ([A List Apart, Raskin](https://alistapart.com/article/neveruseawarning)). For touch, confirmation can be a swipe or press-and-hold instead of a second tap ([Baymard](https://baymard.com/research-articles/handling-accidental-taps-on-touch-devices)). Hold-to-confirm needs a visible fill and a text explanation for accessibility ([Motion](https://motion.dev/tutorials/js-hold-to-confirm)).
- Android "clear haptics": CONFIRM is short and light, REJECT is stronger; no VIBRATE permission is needed via `HapticFeedbackConstants` ([Android haptics](https://developer.android.com/develop/ui/views/haptics/haptic-feedback), [AOSP UX foundation](https://source.android.com/docs/core/interaction/haptics/haptics-ux-foundation)).

### 3.2 Recommended action model ("tap, size, hold")

| Action | Gesture | Safety |
|---|---|---|
| **Check / Call N** | One tap on the big primary button (bottom, thumb zone) | 3 s undo pill ("Undo call") until the next player acts |
| **Fold** | One tap when facing a bet. **When checking is free, Fold is hidden** behind a small "⋯" or long-press (Phenom evidence) | Undo pill |
| **Bet / Raise** | Tap opens a **sizing tray** in place (not a modal). Tap a preset → amount fills → tap **"Raise to 120"** to commit | 2 taps by design; the label always shows "to" total, plus delta small ("+80") |
| **All-in** | Separate chip in the tray, committed by **hold for 600 ms** (ring fills), or by sliding the sizer to the end and holding | Never a one-tap target; never adjacent to Call |
| **Custom amount** | Tap the amount → keypad opens **empty**, with live validation ("min 80") and a ⌫ key; or drag up and down on the amount (scrub; 1 BB per detent, with haptic tick) | Invalid amounts can't be committed; the button reads why |

- **Presets are context-aware.** Preflop: *2.5×, 3×, 4× BB* (or 3× + 1 per limper). Postflop: *⅓, ½, ⅔, Pot*. Facing a bet: *Min, 2.5×, 3×, Pot-raise*. Presets below the legal minimum are never shown. The host can edit them.
- **Never auto-fold on a timer.** Live games are social. Show an optional, gentle "shot clock" only if the host enables it.
- **Undo, not confirm.** Every committed action can be undone by the actor until the next player acts. The host can undo anything (a multi-step history with a readable log: "Undo: Ben raised to 120").
- **Haptics:** a tick on scrub detents, CONFIRM on commit, REJECT on an invalid amount, a heavier pattern on all-in. On the web, use `navigator.vibrate` (Android Chrome only, after the first tap: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)). iOS has no Vibration API ([W3C report](https://lists.w3.org/Archives/Public/public-device-apis-log/2024Jun/0061.html)); a `<input type=checkbox switch>` toggle hack gives an iOS 17.4+ haptic ([bugnet](https://bugnet.io/blog/fix-web-game-vibrate-api-not-available-ios-safari)), and is optional.

### 3.3 Accessibility checklist

- Primary action ≥ 64 dp tall and full width; secondary ≥ 48 dp; ≥ 8 dp gaps; destructive targets (Fold, All-in) never adjacent to Call.
- Text contrast ≥ 4.5:1 on every surface. Use Material dark (#121212-ish base, desaturated accents, lighter = higher elevation) ([Material dark theme](https://m2.material.io/design/color/dark-theme)).
- **Never encode meaning in colour alone.** About 90 % of colour-vision deficiency is red-green ([PokerChipForum](https://www.pokerchipforum.com/goto/post?id=2267037)). Pair colour with icon or label (Fold = ✕ + word, All-in = ⚡ + word). Seat colours come from Okabe-Ito (#E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7) ([Okabe-Ito](https://siegal.bio.nyu.edu/color-palette/)), plus initials in each seat. Chip colours are decorative only, because amounts are always printed.
- Optional four-colour suits in the card picker and evaluator, with suit glyphs always shown (forum evidence is mixed: [PokerChipForum](https://www.pokerchipforum.com/goto/post?id=2263717)).
- Screen readers: TalkBack content descriptions; web `aria-live="assertive"` for "Your turn. Call 40 or raise." Respect `prefers-reduced-motion` and system font scaling (tabular numerals; layout survives 200 %).

---

## 4. Pass-and-play (one phone flat on the table)

**Key insight:** hole cards are physical, so **the phone holds no secret information.** No "hide the screen, pass to Anna" interstitials are needed (unlike digital hot-seat games: [Tabletopia](https://tabletopia.com/news/hotseat-mode)). The handoff is just "*point at who's next*".

- **Seat map = real table.** In setup, place names around a ring to match where people physically sit (drag to reorder). The ring on screen is a scale model of the table, so the active seat glows in the direction of the real person.
- **Orientation.** Lock to portrait (auto-rotate is unreliable flat on a table). Rotate only the **action panel** toward the active player's side (0/90/180/270°, derived from their seat angle). Everyone else reads the ring, which is radially symmetric, and the narrator line. Chess.com's "flip board each move" setting is a precedent ([Chess.com](https://support.chess.com/en/articles/8583716)). Make it a toggle, because some groups pick the phone up instead.
- **Turn handoff cue:** the seat glows, a chime plays plus optional TTS ("Anna"), and the action panel slides and rotates toward that edge (~250 ms). The previous actor's result floats briefly over their seat ("Call 40").
- **Keep the screen on** (Android `FLAG_KEEP_SCREEN_ON`), with dim-but-awake between hands.
- **Big type.** It must be readable from about 1 m: pot and current bet ≥ 32 sp, names ≥ 18 sp.
- **Dealer prompts** live at the top of the ring, visible to the dealer seat.

---

## 5. Hosted mode (each player on their own phone)

### 5.1 Join in under 10 s

Patterns: QR plus a short fallback code ([PartyPot](https://partypotapp.com.advisoryapps.com/features/qr-code-joining/)), no account, name entry that doesn't gate entry ([Gaming Couch](https://techpp.com/2026/01/07/gaming-couch-party-game-night/)), and rejoin with the same code and name ([Jackbox how-to](https://www.jackboxgames.com/how-to)).

1. **Scan QR** (host screen) → page loads (target < 150 KB, no framework bloat).
2. **One screen:** "Who are you?" Large name chips for players the host already seated, plus a "New player" field. One tap claims a seat. The device token is stored in `localStorage` for silent rejoin.
3. **Done.** The host's ring shows a green connection dot on that seat. If the host pre-filled names (recommended), joining is two taps.

Show the Wi-Fi/hotspot name *next to* the QR ("Join Wi-Fi 'PokerNight' first"), and optionally a Wi-Fi QR (`WIFI:` URI) as a first step. Wrong network is the most likely join failure on a LAN-only design.

### 5.2 Platform constraints (critical)

| Need | Reality on a plain-HTTP LAN page | Design answer |
|---|---|---|
| Keep screen awake | **Wake Lock requires a secure context** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API), [restricted list](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts)); `http://192.168.x.x` is not one | Test the NoSleep-style muted looping `<video>` fallback ([Chromium note](https://groups.google.com/a/chromium.org/g/blink-dev/c/uDn6a9fquCM/m/QmBxasoLAgAJ)); otherwise accept sleep and make **rejoin instant** |
| "Your turn" push when pocketed | Notifications and Service Workers need a secure context; iOS web push additionally needs a Home-Screen install ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)) | **Host phone audio is the universal cue** (chime + name). The player is at the table anyway |
| Vibrate | Android Chrome: yes, foreground tab after a tap. iOS: no | Vibrate where possible; full-screen colour flood plus a `document.title` blink |
| Stay connected | iOS Safari suspends WebSockets on lock; `new WebSocket()` right after resume can hang; stale sockets can look OPEN ([WebKit 308073](https://bugs.webkit.org/show_bug.cgi?id=308073), [247943](https://bugs.webkit.org/show_bug.cgi?id=247943)) | Reconnect on `visibilitychange` with a ping/pong health check, back-off, and a forced reload as last resort; the server snapshot makes resume stateless |
| Camera (card scan) on joined phone | `getUserMedia` needs a secure context | Card scan only on the native host app |

→ **Flag for the architecture ADR:** whether the host can offer HTTPS on the LAN without certificate warnings. If not, the joined-phone UX must not depend on any secure-context API.

### 5.3 Personal view vs shared view

- **Joined phone = "my seat"**: my stack (huge), to-call amount, the action bar in the bottom 40 %, my private pre-actions, and a compact strip of the table (pot, board stage, whose turn). Tapping the strip expands the full ring.
- **Not my turn:** the screen calms down (dimmed, low motion), so phones in hands don't distract the table ([Calm Technology](https://www.caseorganic.com/post/principles-of-calm-technology): move "from the periphery… to the center, and back").
- **My turn:** a full-bleed colour wash, the action bar animates up, vibration (Android), and the host chime.
- **Host view:** the full table, plus a ⋯ on each seat for "act for", "sit out", "rebuy", "edit stack". The host's overrides show in the narrator log, so the table can see corrections ("Host corrected Ben's stack to 1,200").
- **Presence:** seat dot green = connected, amber = reconnecting, grey = away (the host can act for them). **Never auto-fold a disconnected player**; prompt the host instead.

---

## 6. Settlement (real-money mode)

- Compute **net per player** = final stack value − total buy-ins. Show that first, because people understand "+€23" before "pay Ben €12".
- **Transfers:** greedy matching of the largest debtor with the largest creditor gives ≤ n−1 transfers. The true minimum is NP-hard, but exact subset DP is feasible for ≤ 10 players ([Splitwise algorithm write-up](https://medium.com/@mithunmk93/algorithm-behind-splitwises-debt-simplification-feature-8ac485e97688), [Splitwise help](https://splitwise.uservoice.com/knowledgebase/articles/107220-what-does-the-simplify-debts-setting-do)). For ≤ 10 players, use the exact minimum.
- Like Splitwise, offer two views: **"Simplest" (fewest transfers)** and **"Via host"** (everyone settles with the banker, which many home games prefer).
- **Advantage over every ledger app:** final stacks are exact, so there is no "chips don't add up" mismatch to reconcile (cf. [PokerPot](https://apps.apple.com/us/app/-/id6758568455)). Say so on the screen: "Balanced ✓, 4,000 in, 4,000 out".
- Rounding: settle to the smallest currency unit, with the remainder assigned deterministically and shown.
- Show a timeline of buy-ins and rebuys per player (transparency prevents disputes), plus a shareable summary card (image/text) for the group chat. Free-play mode shows a leaderboard instead.

---

## 7. Visual and motion design

- **Base:** near-black ink with a slight green or teal cast (felt *memory*, not felt *texture*). Material says avoid pure black, desaturate accents, and show elevation as lighter surfaces ([Material dark](https://m2.material.io/design/color/dark-theme)). Optional ultra-subtle noise and vignette on the table ring only. Literal felt and wood textures read as dated casino skin; case studies of premium poker UIs emphasise UI that "gets out of the way" ([Skins Factory](https://www.theskinsfactory.com/uiux-design-blog/poker-bang-proof-of-concept-prototype)) and moving away from the "intimidating, casino-esque mold" ([PokerDAO](https://contra.com/p/2BcbA3RN-uxui-for-poker-daos-web3-decentralized-poker-platform)).
- **One accent** (warm brass or gold) reserved for *money moving* and *your turn*. Everything else is greyscale. Seat colours are Okabe-Ito at reduced saturation.
- **Type:** a geometric sans with **tabular numerals**. Numbers are the hero; abbreviate 12,500 → 12.5k only above 5 digits.
- **Chips:** abstract flat discs with an edge-spot ring, used only as *motion carriers* (bet slides from seat to centre; pot flies to winner). The number is always the source of truth.
- **Motion budget:** 100–150 ms for feedback, 200–300 ms for transitions; nothing blocks input ([MUI tokens](https://app.unpkg.com/@material-ui/core@4.12.4/files/es/styles/transitions.js), [Atlassian](https://atlassian.design/foundations/motion/applying-motion)). **Scale juice to importance** ([Juice it or lose it](https://www.wayline.io/blog/game-feel-is-king)): a check gets a tick, a call a slide, an all-in a weighty slam plus haptic, and the pot win the one indulgent moment (~600 ms, skippable by tapping).
- **Sound:** a soft chip click on bets, a felt "thump" on all-in, a chime for your turn, and a riffle at the new hand. All off by default on joined phones (social setting), on for the host.

---

## 8. Fresh ideas

1. **Narrator line.** One sentence at the top, in plain English: "Ben raised to 120. Cara to act, call 120 or fold." It doubles as a log (swipe down for history) and as the beginner's teacher. It is also how host corrections stay transparent.
2. **Dealer cue card.** After each round the app tells the dealer what to do: "Burn 1 · Deal 3, the Flop". Before a hand: "Deal 2 cards to each player, starting with Ben (left of the button)". The app becomes the **floor manager**, not just the bank.
3. **The table speaks.** The host phone announces turns ("Anna, it's on you") and big moments ("All in!"), with system TTS and locale-aware wording. This solves the browser-notification gap and helps beginners who aren't watching the screen.
4. **"Why?" on everything.** Long-press any disabled button or number for a one-line rule: "Why can't I raise? Cara's all-in didn't reopen the betting." It's pull help, so experienced players never see it unless they ask.
5. **Showdown explainer.** Tap the cards (a rank × suit grid; the best-five highlight shows *which* five play). The result reads like a referee: "Anna wins with Two Pair, Kings and Sevens. Ben also had Kings and Sevens, but Anna's Queen kicker plays."
6. **Pre-actions for speed.** On joined phones: "Check/Fold", "Call any", "Check". These are private, so they leak nothing, unlike acting out of turn at a real table. Experienced players stop waiting on their own turn.
7. **Gesture shortcuts (expert mode).** On the action bar: swipe up = call/check, swipe down (hold) = fold. Off by default; enabled per player.
8. **Hand replay card.** After each hand, a compact replay ("Preflop: Ben 3× … River: Anna bets 200, Ben calls") for "wait, what happened?" moments. It's also teachable.
9. **Card scan (Could).** Use the host camera to read the board and hands at showdown with on-device ML (precedent: [Royal Draw](https://apps.apple.com/us/app/id6758281507)). It would only work on the native host app (secure context), and is high effort.
10. **Learning-curve fade.** Hints retire per player as they demonstrate each concept. The group's "Teaching level" visibly drops over the night ("You've got this, hints off"), which is satisfying and respectful.

---

## 9. Prioritised principles and features

### MUST
1. **Zero-tutorial, pull-based teaching:** the narrator line, consequence-labelled buttons ("Call 40"), one-line rule explanations at the moment a rule applies, and per-player hint fade.
2. **Engine-enforced rules** (turn order, min-raise, short all-in reopen, heads-up blinds, dead button, side pots, odd chip, showdown order), with plain-language "why" on demand.
3. **Tap / size / hold action model:** one tap for check/call; two taps to size and commit a raise; hold for all-in; Fold hidden when Check is free; empty keypad for custom amounts.
4. **Undo over confirm:** the actor can undo until the next player acts; the host has full undo and correction, logged visibly.
5. **Dealer cue card** (burn and deal instructions, who to deal first).
6. **Pass-and-play seat ring matching the physical table**, an action panel that rotates toward the actor, keep-screen-on, and large readable type.
7. **Join in under 10 s:** QR + Wi-Fi hint + host pre-seated names → one tap to claim a seat; silent rejoin token; connection dots; never auto-fold the disconnected.
8. **Host-phone audio turn cue** (chime + name) as the universal "your turn". Don't rely on Wake Lock or Notifications for joined phones.
9. **Robust reconnect** (visibilitychange + ping health check + snapshot resync).
10. **Accessibility baseline:** ≥ 48 dp targets (≥ 64 dp primary), 4.5:1 contrast, no colour-only meaning, Okabe-Ito seat colours + initials, TalkBack/aria-live, reduced motion, font scaling.
11. **Exact settlement:** net-first view, minimum transfers (exact for ≤ 10), "via host" option, "Balanced ✓", buy-in timeline.
12. **No ads, no paywall mid-game, every setting editable live** (blinds, stacks, seats, presets).

### SHOULD
1. Showdown explainer with best-five highlight and kicker sentence.
2. Context-aware presets (×BB preflop, pot fractions postflop), host-editable.
3. Private pre-actions on joined phones.
4. Hand replay card and a swipe-down history log.
5. Spoken announcements (TTS) for turns and all-ins; a sound design set.
6. Calm/active states on joined phones (dim when idle, colour flood on turn).
7. Haptic vocabulary (tick / confirm / reject / all-in) on Android host and Android web.
8. Teaching level per table and per player (Beginner / Mixed / Pro).
9. Shareable end-of-night summary card.

### COULD
1. Expert gesture shortcuts.
2. Camera card scan on the host (native only).
3. "Big screen" view: a TV or tablet browser as a spectator display of the ring.
4. Optional shot clock.
5. Four-colour suit option; customisable table accent colour.
6. Wi-Fi QR as step 0 of the join flow.

---

## 10. Signature ideas (what nobody else does)

1. **"The app is the floor manager."** It doesn't just track chips: it *runs* the hand. It tells the dealer what to deal, tells each player in one sentence what they can do, and calls the turn out loud. A table of total beginners plays a correct hand with nobody reading rules.
2. **The Narrator.** A single living sentence at the top of every screen ("Ben raised to 120, Cara: call 120 or fold"). It is the tutorial, the log, the audit trail and the dispute settler at once. It fades to terse numbers as the table levels up.
3. **"Why?" on long-press.** Every greyed-out button and every number explains itself in one line. Beginners learn the hard rules (short all-in, min-raise, side-pot eligibility) exactly when they bite; pros never see it.
4. **The Referee showdown.** Instead of "Ben wins", it gives a verdict: the best five cards lit up, and the kicker or tie explained in a sentence. It turns the most confusing moment in poker into the most satisfying one.
5. **Physical-table mirroring.** The on-screen ring is a scale model of where people actually sit. The active seat glows *toward* the real person and the action panel turns to face them. The phone on the felt behaves like a dealer button that knows the rules.

---

## 11. ASCII sketches

### 11.1 Pass-and-play: phone lying in the middle of the table (portrait)

```
┌──────────────────────────────────────┐
│ ♠ Dealer: burn 1 · deal 1, the Turn │  ← dealer cue card (appears between rounds)
├──────────────────────────────────────┤
│              DAN  1.8k               │
│        CARA ○           ○ EVE        │
│       2.4k  [BB]           950       │
│                                      │
│            ┌──────────────┐          │
│   BEN ○    │  POT  360    │   ○ FAY  │
│   1.2k     │  side 80 ·BD │   3.1k   │
│   [SB]     │  ▢▢▢ ▢ ▢ flop│          │
│            └──────────────┘          │
│         (D)                          │
│     ANNA ◉ ━━━━━━━━━━━━━━━ glowing   │  ← active seat glows toward real Anna
│     2.0k   "Ben raised to 120"       │
├──────────────────────────────────────┤
│ ▸ Anna, call 120 or fold. Min raise │  ← narrator line (tap ▾ for history)
│   to 200.                            │
├──────────────────────────────────────┤
│  ┌────────┐  ┌────────────────────┐  │  ← action panel rotates to face Anna's
│  │ ✕ Fold │  │    CALL  120       │  │    side of the table
│  └────────┘  └────────────────────┘  │
│  ┌──────────────────────────────┐ ↶  │
│  │      RAISE…  (min 200)       │ Undo│
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘

Raise tray (opens in place, no modal):
┌──────────────────────────────────────┐
│  Min 200 │ 2.5× 300 │ 3× 360 │ Pot 600│  ← facing a bet: multiples of it; pot-raise
│  ─────────●──────────────── ⚡All-in  │  ← all-in = hold 600 ms (ring fills)
│        [  300  ]  ⌨ tap to type      │  ← scrub up/down = ±1 BB with haptic tick
│  ┌──────────────────────────────────┐│
│  │       RAISE TO 300   (+180)      ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

### 11.2 Joined player's phone (hosted mode, browser), your turn

```
┌──────────────────────────────────────┐
│ ● connected   Table "Friday"   ⋮     │
├──────────────────────────────────────┤
│ POT 360 · TURN · Ben ▸ Cara ▸ [YOU]  │  ← compact table strip (tap = full ring)
│ "Ben raised to 120"                  │
├──────────────────────────────────────┤
│                                      │
│            YOUR TURN                 │  ← full-bleed accent wash + vibrate
│                                      │     (Android) + host phone says "Anna"
│           ANNA  2,000                │
│        to call: 120                  │
│                                      │
│  You can call 120, raise to at least │  ← hint (fades once Anna has done this
│  200, or fold.            [Why?]     │     ~3×; "Why?" = pull help)
├──────────────────────────────────────┤
│  ┌────────┐  ┌────────────────────┐  │
│  │ ✕ Fold │  │    CALL  120       │  │  ← thumb zone, ≥64 dp
│  └────────┘  └────────────────────┘  │
│  ┌──────────────────────────────────┐│
│  │          RAISE…                  ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘

Not your turn (calm state, dimmed):
┌──────────────────────────────────────┐
│ ● connected   Table "Friday"   ⋮     │
│ POT 360 · TURN · waiting for Cara    │
│                                      │
│           ANNA  2,000                │
│                                      │
│  Pre-action (private):               │
│  [ Check/Fold ]  [ Call any ]  [   ] │  ← nobody else can see these
└──────────────────────────────────────┘
```
