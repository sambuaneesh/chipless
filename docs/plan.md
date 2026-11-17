# Build Plan

Each milestone ends with a working, committed, tested increment. Small commits, conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## Repo layout
```
engine/    Pure Kotlin/JVM module: rules, evaluator, settlement. No Android deps. Heavily unit-tested.
android/   App module: Activity + WebView, foreground service, HTTP/WS server, persistence, QR, TTS.
web/       Vanilla TypeScript client (esbuild → one app.js + app.css, pre-gzipped into android assets).
docs/      Spec, ADRs, research, plan.
```

## Milestones
| # | Milestone | Done when |
|---|---|---|
| M0 | **Toolchain + spike** | JDK 21, Android SDK (platform 36, build-tools), Gradle wrapper, esbuild. A skeleton APK (WebView + hand-rolled server + QR + live counter) is synced to 2 phones. APK size and cold start are measured, and a host/guest test matrix is run (Wi-Fi, hotspot, iOS Safari, screen-lock). |
| M1 | **Engine** | Reducer, legal actions, side pots, odd chip, undo/replay, heads-up, button moves, evaluator, settlement. Tests: every worked example in rules.md, an exhaustive evaluator check, randomised play with chip-conservation invariants. |
| M2 | **Server + protocol** | HTTP + RFC 6455 WebSocket (framing, masking, ping/pong, close), intent → snapshot protocol, seat tokens, idempotent actions, log persistence and resume. Protocol tests on the JVM. |
| M3 | **Design system + table UI** | Tokens (colour, type, motion, spacing), seat ring, pot, narrator, action bar, raise tray, cue card. Works in the browser against a mock server. |
| M4 | **Pass-and-play end to end** | A full night playable on one phone, with rotating panel, keep-screen-on, undo, and fixed and timed blinds. |
| M5 | **Hosted mode** | QR join < 10 s, presence, reconnect, host controls (act for, edit, sit out), audio and TTS cues, foreground service, IP detection, network hints. |
| M6 | **Referee** | Card grid, verdict sentence, best-five highlight, multi-pot resolution. |
| M7 | **Money mode + settlement** | Buy-ins/rebuys timeline, net view, minimum transfers, via-host, balanced check, share card. |
| M8 | **Polish** | Motion and sound set, haptics, hint fading, pre-actions, replay card, full accessibility pass, beginner usability test with real people. |
| M9 | **Release** | R8/shrinking, signing, size budget check, versioning, Play listing (specialUse declaration). |

## Status (2026-11-17)
M0–M9 are done as a v1.0 build:
- 32 JVM tests and a headless two-phone e2e test pass.
- The release APK is 106 KB and installs and runs on a Realme RMX3921 (Android 16).

Still to verify with real people:
- multi-phone play over Wi-Fi/hotspot on the device
- iOS Safari guests
- a 6+ hour hosting session
- a TalkBack pass

## Engineering practices
- **Zero runtime dependencies** in the APK beyond the Android framework and the Kotlin stdlib. Dev/test tooling is fine.
- **Engine is pure and deterministic.** Everything else is a thin adapter. Most bugs should be catchable in JVM tests without a phone.
- **Size budget** is checked in the build: it fails if the APK is over 1 MB or the web bundle over 60 KB gz.
- **Formatting/lint:** ktlint for Kotlin; `tsc --noEmit` (strict) + Prettier for TS.
- **No feature lands without tests** for engine/protocol code; UI is verified on real devices per milestone.
- **ADR** for any decision that changes architecture, rules, or dependencies.
