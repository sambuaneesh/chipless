# 0001. Lean Kotlin host with a vanilla TypeScript web client

- Status: Accepted
- Date: 2026-11-17

## Context
The app must be tiny, fast and dependency-light. The host phone runs the authoritative engine and serves the table over the LAN/hotspot to browsers (Android Chrome, iOS Safari). Pass-and-play runs fully on one phone. See [research/stack.md](../research/stack.md).

## Options
1. Kotlin shell + WebView + hand-rolled HTTP/WS server + Kotlin engine.
2. Rust core (engine + server) via NDK/JNI, optionally WASM for browsers.
3. Tauri v2 Android.
4. Native Rust UI (Slint/egui/Makepad/Dioxus).
5. Flutter / React Native / Compose Multiplatform.

## Decision
Option 1, made lean:
- **Android shell:** Kotlin with no AndroidX or AppCompat. A single Activity hosts a WebView.
- **Server:** hand-rolled HTTP/1.1 and WebSocket (RFC 6455) server on `java.net.ServerSocket`, with no third-party libraries. It binds to `127.0.0.1` in pass-and-play and to `0.0.0.0` when hosting.
- **Engine:** a pure, deterministic Kotlin state machine with an event-sourced action log, so undo means replaying the log. It is the only authority; clients render snapshots and send intents.
- **Web client:** one vanilla TypeScript client, with Preact + signals only if complexity demands it. Animations use CSS/WAAPI (transform and opacity only). System fonts or one subset font.
- **APK size:** target under 1 MB, verified in a spike.

## Consequences
- Smallest APK, simplest toolchain, and a single UI codebase for host and guests.
- The engine does not run in browsers. If browser-only pass-and-play or a non-Android host is ever needed, revisit with a Rust → WASM engine (the measured evaluator was about 9 KB gzipped).
- We own the HTTP/WS code and must test it well (framing, masking, ping/pong, close, fragmentation).
- Required Android work: a foreground service (`specialUse` or `connectedDevice`, never `dataSync`), the Android 17 `ACCESS_LOCAL_NETWORK` permission, persisting the action log after every action, and detecting the host IP.
