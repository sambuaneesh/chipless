# 0003. Web client: Preact, full snapshots, LAN over plain HTTP

- Status: Accepted
- Date: 2026-11-17

## Context
ADR-0001 chose a web client served by the host. The UI has many interactive screens (table, raise tray, showdown, referee, settlement and setup). Guests run Android Chrome or iOS Safari over `http://<lan-ip>`, which is not a secure context.

## Decision
- **Preact 11 + hooks** with a tiny subscribe store. It costs about 5 KB gzipped and avoids writing and maintaining a homemade diffing layer. Everything else is from scratch: CSS design tokens, WAAPI chip animations, synthesized WebAudio sounds, and the QR encoder (verified against zbar).
- **Full snapshot on every change** (a few KB), never deltas. Reconnects are stateless and clients never need rules code. Actions carry `seq` to reject stale or double taps.
- **Plain HTTP on the LAN.** There are no certificates; self-signed certs would show scary warnings. The design doesn't depend on secure-context APIs:
  - turns are announced by the host phone's speaker (chime + TTS)
  - screens stay awake via a 2.4 KB muted looping video
  - sharing falls back to clipboard or a text box
- **Budgets:** web ≤ 60 KB gzipped (enforced in `build.mjs`), APK ≤ 1 MB (enforced in Gradle).

## Consequences
- The web bundle is about 34 KB gzipped and the APK about 106 KB.
- Web Push and real Wake Lock aren't available to guests. Acceptable, because everyone is in the same room.
