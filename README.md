# Poker Chips

A fast, tiny poker table for real-card home games. You deal real cards; the app is the chips, the dealer button, the pot and the floor manager. It runs every No-Limit Hold'em hand correctly and teaches beginners as you play.

- **One phone:** leave it in the middle of the table and pass it around.
- **Everyone's phone:** friends scan a QR code and play from their browser. There's nothing to install, and everyone sees the table live.
- **Release APK is about 106 KB.** The web client is about 34 KB gzipped. There are no runtime dependencies beyond the Android framework, the Kotlin stdlib and Preact.

## Features
- Rules engine: blinds, button, minimum raise, short all-ins (TDA 49), side pots, uncalled bets and the odd chip.
- Narrator line, dealer cue card ("Burn 1 · deal 3 — the Flop") and hints that fade as you learn.
- Betting is tap / size / hold: one tap to check or call, presets for raises, and a hold for all-in. Undo is always available instead of confirm dialogs.
- Showdown: tap the winner, or enter the cards and the Referee explains why they won ("Ann's Queen kicker beats Ben's Jack").
- Free play, or real buy-ins with rebuys and settlement using the fewest payments.
- Fixed blinds or a tournament timer. The host's voice calls out turns. Synthesized sounds, haptics, and pre-actions on players' phones.
- Crash-proof: the action log is saved after every action.

## Layout
| Path | What |
|---|---|
| `engine/` | Pure Kotlin rules engine, hand evaluator, settlement and coach text. Heavily unit-tested. |
| `server/` | Session (event log, protocol, persistence) and a zero-dependency HTTP + WebSocket server. Plain JVM. |
| `android/` | Thin shell: one Activity with a WebView, a foreground service while hosting, and voice/haptics/share. |
| `web/` | The table UI (TypeScript + Preact), served by the phone to itself and to friends' browsers. |
| `docs/` | [Spec](docs/spec.md), [ADRs](docs/adr/), [protocol](docs/protocol.md), [research](docs/research/). |

## Build
Requirements: JDK 21, Android SDK (platform 36, build-tools 36), Node 20+.

```bash
echo "sdk.dir=$HOME/Android/Sdk" > local.properties   # once
./gradlew :android:assembleRelease                      # builds web + APK; fails if the APK > 1 MB
adb install -r android/build/outputs/apk/release/android-release.apk
```
The release build is signed with the debug key so it can be sideloaded. Use your own key before publishing to Play.

## Develop
```bash
./gradlew :engine:test :server:test        # 32 JVM tests (rules, evaluator, settlement, protocol)
cd web && npm ci && node build.mjs --watch # rebuild the client on change
./gradlew :server:dev                      # serve web/dist on :8737; prints HOST and GUEST URLs
node web/test/e2e.mjs <HOST url> <GUEST url> <screenshot dir>   # headless two-phone smoke test
```
Open the HOST URL in a desktop browser to act as the host phone. Open the GUEST URL on any phone on the same network.
