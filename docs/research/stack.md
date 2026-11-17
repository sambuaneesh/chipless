# Stack research: leanest, fastest stack for the Android poker table

Status: research note, 2026-11-17. Not normative. It feeds the stack ADR.

## TL;DR

**Recommendation: Kotlin thin shell with no AndroidX, plus a hand-rolled HTTP/WebSocket server on `java.net.ServerSocket`, a pure-Kotlin game engine, and one vanilla-TypeScript web client.** The same web client runs in the host's WebView (loaded from `http://127.0.0.1:<port>`) and in every player's browser.

- **One transport for everyone.** Pass-and-play uses the same server bound to loopback only.
- **Thin browser clients.** The host engine is authoritative. Browsers render snapshots and send intents, so no engine code has to be shared with the browser.
- **Expected APK size:** well under 1 MB (estimate, verify in the spike). There are no native libraries and no runtime dependencies.
- **Rust core is the runner-up.** Use a hand-rolled `std::net` server, a 3-function JNI surface, no UniFFI, no tokio and no Tauri. In my measurements it adds about 0.33–0.75 MB per ABI and a second toolchain, but nothing measurable in speed for ≤10 clients. Switch to it only if you want the engine in WASM, for example a browser-only pass-and-play for iPhone users, or a desktop host later.
- **Rejected:**
  - **Tauri v2:** heavier template, and its foreground-service story uses a community plugin with a 6 h cap.
  - **Native Rust UIs:** you would build two UIs, because browsers still need the web one.
  - **Zig/C:** no benefit over Kotlin here.
  - **Flutter, React Native, Compose:** multi-MB, and you still need a separate web client.

---

## 1. Measurements I ran (2026-11-17)

### 1a. Rust server binary size (size proxy)

Toolchain: cargo/rustc 1.98.0. These are `x86_64-unknown-linux-gnu` builds used as a proxy for `aarch64-linux-android`. They are comparable in order of magnitude because `std` is statically linked in both. No NDK was installed on this machine.

Profile: `opt-level="z"`, `lto=true`, `codegen-units=1`, `panic="abort"`, `strip=true`.

Each binary is a static page plus a broadcast WebSocket.

| Variant | Deps (crates in tree) | Stripped size | gzip -9 |
|---|---|---|---|
| Hand-rolled HTTP + WS on `std::net` (threads, `sha1_smol`, own base64) | 2 | **331 KB** | 166 KB |
| `tiny_http` 0.12 + `tungstenite` 0.30 (sync) | 35 | 568 KB | 285 KB |
| `axum` 0.8 (`http1`, `ws`) + `tokio` current-thread | 71 | 748 KB | 362 KB |
| 7-card hand evaluator → `wasm32-unknown-unknown` (raw C ABI, no wasm-bindgen, no wasm-opt) | 0 | 21.6 KB | 9.2 KB |

Notes:

- `tiny_http` 0.12.0 was last released in 2022-10, so it is effectively unmaintained.
- Current versions on crates.io: `tungstenite` 0.30.0 (2026-07), `axum` 0.8.9 (2026-04), `hyper` 1.12.0 (2026-10), `uniffi` 0.32.2, `cargo-ndk` 4.1.2, `jni` 0.22.4.
- Since AGP 3.6, native libraries are stored uncompressed and page-aligned in the APK, so the APK carries roughly the stripped size per ABI. The Play download is compressed.

### 1b. UniFFI overhead

UniFFI's Kotlin bindings need JNA ([UniFFI Gradle docs](https://mozilla.github.io/uniffi-rs/latest/kotlin/gradle.html)). I measured `jna-5.17.0.aar`: `libjnidispatch.so` for arm64 is 176 KB, plus a 220 KB `classes.jar`. That is about 0.3–0.4 MB per ABI before R8, for what a hand-written 3-function JNI surface does in about 0 KB.

### 1c. Web client runtime cost

The test app is a counter component, minified and compressed with gzip -9. Versions are the npm latest as of today. Bundled with esbuild 0.28.2 and cross-checked with Rollup + terser where noted.

| Approach | Version | min | **gzip** |
|---|---|---|---|
| Vanilla JS + WAAPI | n/a | 0.3 KB | **0.25 KB** |
| Preact + hooks | 11.2.0 | 13.6 KB | **5.8 KB** |
| Lit | 3.3.3 | 15.8 KB | **6.2 KB** |
| Preact + `@preact/signals` | 11.2.0 / 2.11.4 | 21.4 KB | **8.5 KB** |
| Svelte 5 (compiled; Rollup) | 5.57.3 | 25.7 KB | **10.0 KB** (esbuild: 18.5 KB) |
| Solid 2 + `@solidjs/web` (Rollup) | 2.0.0 | 26.4 KB | **10.7 KB** (esbuild: 14.1 KB) |

What this means:

- Svelte 5's runtime (signals, async, boundaries) and Solid 2's baseline are now larger than Preact's.
- For one screen with about 10 seats, a pot, an action bar and a hand-evaluator sheet, vanilla TS is enough. It needs a ~50-line `render(state)` plus keyed DOM updates.
- If component count grows, Preact + signals at 8.5 KB gz is the cheapest framework.
- Fonts will dominate the payload, not JS. Use system UI fonts or one subset woff2 file. Draw suits and chips as inline SVG.

**Animations.** CSS transitions and WAAPI on `transform`/`opacity` run on the compositor and keep going even when the main thread is busy ([web.dev: high-performance animations](https://web.dev/articles/animations-guide)). That covers what chips need:

- Chips sliding to the pot use FLIP (measure → `transform` → animate).
- Chip stacks use a stagger.
- Pot pulse, turn glow and card flips use 3D `transform`.

Canvas or WebGL is unnecessary. At most, add a tiny Canvas2D layer for a win "burst" or confetti. Avoid animating `box-shadow`, `filter` or layout properties, and be careful with `will-change`.

---

## 2. Option comparison

APK sizes are for a single ABI (arm64-v8a), release build with R8. "Est." means an estimate: no reliable published number exists, so verify in the spike.

| # | Option | APK size | Cold start | Runtime perf (≤10 clients) | Dev complexity | Host/browser code sharing | Risk |
|---|---|---|---|---|---|---|---|
| 1 | **Kotlin shell + WebView + hand-rolled Kotlin HTTP/WS + Kotlin engine** | **~0.3–0.8 MB** est. (no `.so`; assets dominate) | WebView init dominates (same for 1–3) | Ample. ART JIT/AOT; a few msgs/s | **Low.** Gradle + esbuild only. One native language | Web UI 100% shared. Engine host-only (thin clients) | **Low** |
| 2a | Rust core `.so` (engine + server) via raw JNI; Kotlin shell; WebView UI | ~0.7–1.3 MB est. (+0.33–0.75 MB `.so` measured proxy); ×ABIs if universal | Same + `dlopen` (ms) | Ample (no measurable gain over 1) | **Medium.** cargo-ndk + Gradle, JNI, 16 KB alignment, native crash debugging | Web UI shared. Engine can also build to WASM | Low–Med |
| 2b | 2a + engine compiled to WASM for browsers | +9–60 KB gz per client | +WASM compile (ms) | Same | Medium+ (wasm toolchain, bindings) | **Same engine everywhere** | Med (not needed for a server-authoritative design) |
| 2c | 2a with UniFFI instead of raw JNI | +0.3–0.4 MB (JNA, measured) | Same | Same | Lower binding effort | Same | JNA prebuilt alignment issues reported ([JNA #1642](https://github.com/java-native-access/jna/issues/1642)) |
| 3 | Tauri v2 (2.12.6, released 2026-11-16) | Est. several MB/ABI. Template pulls AppCompat, Material, activity-ktx, lifecycle ([template](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/templates/mobile/android/app/build.gradle.kts)); Rust side brings wry, tokio, serde | Similar | Ample | Medium. Tooling helps, but you still write the LAN server and the foreground service yourself | Same as 2a | **Med–High.** Tauri IPC is useless to remote browsers; FGS only via a community plugin that uses `dataSync` ([plugin](https://docs.rs/crate/tauri-plugin-background-service/0.5.3)), which hits the Android 15 6 h/24 h cap |
| 4 | Native Rust UI (Slint 1.19, egui 0.37, Makepad 1.0, Dioxus 0.7 native/Blitz) | Est. 2–10+ MB/ABI (GPU renderer + fonts; Slint's Skia renderer has a "heavy disk-footprint" per [Slint docs](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backends_and_renderers/)) | Fast (no WebView) | Great | **High.** Two UIs, native for the host and web for browsers | Engine shared; **UI not shared** | High. egui looks tool-like; Makepad's ecosystem is tiny (1.0 in 2025-05, low downloads); Dioxus native is "experimental" on mobile ([Dioxus README](https://docs.rs/crate/dioxus/0.7.8/source/README.md)) |
| 5 | Zig or C core (`.so`) + shell | Smallest `.so` (~100–200 KB est.) | Same as 2a | Same | High. Memory-unsafe HTTP/WS parsing; Zig is pre-1.0 with Android libc/target churn ([ziggit](https://ziggit.dev/t/no-longer-able-to-build-using-android-abi/11449)). Mongoose is GPLv2/commercial ([licensing](https://mongoose.ws/licensing/)); CivetWeb is MIT | Same as 2a | High for no gain |
| 6a | Flutter (3.50 docs) | Engine "adds a few megabytes compressed" ([FAQ](https://docs.flutter.dev/resources/faq)); real apps report 15–25 MB per-ABI APKs | Engine init | Great | Medium | **None.** Browsers still need a separate web UI (Flutter Web is heavy) | Rejected |
| 6b | React Native / Expo | Expo SDK 50: 62 MB universal release APK, 11.7 MB Play download ([Expo](https://docs.expo.dev/distribution/app-size/)) | JS engine boot | OK | Medium | Partial (React) | Rejected |
| 6c | Kotlin + Compose (or Compose Multiplatform) | Compose costs about +0.7 MB vs Views even in Google's Sunflower sample (2.97 vs 2.25 MB download, [Android docs](https://developer.android.com/develop/ui/compose/migrate/compare-metrics)). CMP Web output is multi-MB wasm ([kotlinlang Slack](https://slack-chats.kotlinlang.org/t/22942462/for-anyone-curious-a-simple-hello-world-compose-web-app-wasm)) | Compose init | Great | Medium | Poor for browsers | Rejected |

### Why not Rust, given that it was explicitly requested

Rust buys nothing measurable for this workload:

- The workload is one game, ≤10 sockets, a few small JSON messages per second, and a hand evaluator that brute-forces 21 five-card combinations in microseconds.
- Rust costs a native library per ABI: 0.33 MB at best, even hand-rolled.
- It adds a second toolchain (cargo-ndk 4.1.2 + NDK r28+ for 16 KB pages), a JNI boundary, and native-crash debugging.

Pick Rust if any of these becomes a goal:

1. **Browser-only pass-and-play** for people who can't install the APK, such as iPhone users. A WASM engine is about 9 KB gz, as measured above.
2. A **desktop host**, using the same Rust server binary.
3. You want to treat the engine as a reusable library.

If you go Rust, the leanest variant is:

- A hand-rolled `std::net` HTTP/WS server: thread per connection, `sha1_smol`, its own base64.
- `#[no_mangle] extern "system" fn Java_…` exports for `start(port, dataDir)`, `stop()` and `status()`. Use no `jni` crate unless needed, no UniFFI and no tokio.
- The host WebView is just another WS client on `127.0.0.1`.

### Option considered and rejected: TS engine inside the host WebView

In this design Kotlin would only relay sockets. It is attractive as a single language, but the authoritative game state would live in a WebView renderer. Android throttles that renderer when the Activity is backgrounded and can kill it independently of the app process. A native engine inside the foreground-service process is more robust and can persist after every action.

---

## 3. Recommended architecture

```
Host phone (APK)
┌──────────────────────────────────────────────────────────────┐
│ MainActivity: WebView → http://127.0.0.1:PORT/?t=<hostToken> │
│ GameService (foreground service while hosting)               │
│   ├─ Engine (pure Kotlin, no Android deps, JVM-unit-tested)  │
│   │    actions → reducer → state; append-only action log →   │
│   │    file (crash/OEM-kill recovery)                        │
│   └─ Tiny HTTP+WS server (ServerSocket, thread/conn)         │
│        GET /, /app.js, /app.css (from assets, gz pre-built)  │
│        GET /ws  → RFC 6455 (SHA-1 via MessageDigest,         │
│                   android.util.Base64)                       │
│        broadcast full JSON snapshot on every change (<2 KB)  │
└──────────────────────────────────────────────────────────────┘
        ▲ ws://<lan-ip>:PORT/ws?t=<gameToken>&seat=<seatToken>
Players' browsers (Android Chrome, iOS Safari): same app.js
```

- **Pass-and-play.** The same service runs bound to `127.0.0.1` only, and it doesn't need to be a foreground service. One code path for both modes.
- **Protocol.** Clients send `{id, type, ...}` intents and the server replies with full snapshots plus a `legalActions` list for the seat to act. Clients stay dumb: no rules code in JS beyond formatting.
- **Server size.** NanoHTTPD's last release was 2.3.1 in 2016, so it is unmaintained. Java-WebSocket 1.6.0 (2024-12) works if you don't want to hand-roll, but a hand-rolled server is about 300–400 LOC with zero dependencies. Ktor is far too heavy.
- **QR code.** Port Nayuki's QR Code generator (MIT; Java/Kotlin/TypeScript/Rust versions, about 1k LOC, [nayuki.io](https://www.nayuki.io/page/qr-code-generator-library)) instead of pulling ZXing.
- **Web client.** TypeScript compiled by esbuild into one `app.js` and one `app.css`, pre-gzipped into assets. Use system fonts and inline SVG chips and suits.

---

## 4. Android and network gotchas, with mitigations

### 4.1 Keeping the server alive on the host

| Gotcha | Mitigation |
|---|---|
| **Foreground service type is mandatory** (target 34+). Without it you get `MissingForegroundServiceTypeException` ([docs](https://developer.android.com/develop/background-work/services/fgs/service-types)). | Use **`specialUse`** with `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Hosts a local game server so nearby players' phones stay in sync during a live poker game"/>`. Declare it in Play Console under App content, with a demo video ([Play policy](https://support.google.com/googleplay/android-developer/answer/13392821)). The alternative is **`connectedDevice`** ("interactions with external devices that require … network connection"; satisfied by declaring `CHANGE_NETWORK_STATE`/`CHANGE_WIFI_STATE`), but its documented intent is hardware peripherals. |
| **Avoid `dataSync`.** On Android 15+ it is capped at 6 h per 24 h. After that `onTimeout()` fires, and the app crashes if it doesn't stop ([timeout docs](https://developer.android.com/develop/background-work/services/fgs/timeout)). A poker night can exceed 6 h. The Tauri community FGS plugin uses `dataSync`. | Use `specialUse` or `connectedDevice`, which have no timeout. |
| Background FGS starts are restricted. | Start the service from the visible Activity when the user taps "Host game". Request `POST_NOTIFICATIONS` (13+) so the ongoing notification shows. Stop the service when the game ends. |
| **Doze** (screen off, stationary, unplugged): it suspends network and ignores wake locks ([Doze](https://developer.android.com/training/monitoring-device-state/doze-standby)). Apps running a foreground service keep "no restrictions" on network ([power details](https://developer.android.com/topic/performance/power/power-details)). | Run the FGS while hosting. The host phone is the table display, so set `FLAG_KEEP_SCREEN_ON` while the table screen is visible. Suggest keeping it on a charger (charging has no restrictions). Hold a `PARTIAL_WAKE_LOCK` and a `WifiLock(WIFI_MODE_FULL_HIGH_PERF)` only while clients are connected. The low-latency lock only works with the screen on and the app in the foreground ([AOSP](https://source.android.com/docs/core/connect/wifi-low-latency)). |
| OEM battery killers (Samsung, Xiaomi and others) kill foreground services anyway ([dontkillmyapp.com](https://dontkillmyapp.com/)). | Persist the action log after every action and restore it on restart. Clients auto-reconnect. Link users to `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`. Don't use the direct `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` intent: Play allows it only for listed use cases ([Doze](https://developer.android.com/training/monitoring-device-state/doze-standby#exemption-cases)). |
| **Android 17 Local Network Protection.** Stable shipped 2026-06-16. For apps that target SDK 37+, *accepting incoming TCP* and making outgoing LAN connections need the runtime **`ACCESS_LOCAL_NETWORK`** permission (NEARBY_DEVICES group). Denied TCP typically times out silently. WebView traffic inherits the app's state ([LNP docs](https://developer.android.com/privacy-and-security/local-network-permission)). | Play currently requires target 36 (deadline 2026-08-31, [Play target SDK](https://developer.android.com/google/play/requirements/target-sdk)); 37 is expected around Aug 2027. Plan for it now: when targeting 37, declare the permission and request it on "Host game" with a rationale screen. Don't request it while targeting ≤36 (the docs say not to). Loopback (pass-and-play) should be unaffected; verify on device. |
| **16 KB page sizes** (Rust/C options only): Play blocks non-compliant updates of target-35+ apps with native code starting 2027-02-01 ([docs](https://developer.android.com/guide/practices/page-sizes)). | NDK r28+ aligns to 16 KB by default; use AGP 8.5.1+. The Kotlin-only option is unaffected. |
| Cleartext: the host WebView loads `http://127.0.0.1`. | Add a `network_security_config` `domain-config` with `cleartextTrafficPermitted="true"` for `127.0.0.1`/`localhost` only. Inbound LAN connections are not subject to the cleartext policy. |
| First WebView creation is heavy and runs on the UI thread ([docs](https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup)). | Show a native dark splash with the same background color. Optionally use `WebViewCompat.startUpWebView` (androidx.webkit, small, R8-shrunk). Inline critical CSS. |

### 4.2 Finding the host address and joining

| Gotcha | Mitigation |
|---|---|
| The hotspot gateway is **no longer fixed at 192.168.43.1**; Android 10/11+ randomizes the subnet ([b4x](https://b4x.com/android/forum/posts/798697), [Volumio](https://community.volumio.com/t/does-ethernet-tethering-work-with-volumio/60079)). Interface names (`wlan0`, `wlan1`, `ap0`, `swlan0`) vary by OEM. `ConnectivityManager` doesn't expose the tethering interface to normal apps. | Bind `0.0.0.0`. Enumerate `NetworkInterface.getNetworkInterfaces()` and keep up, non-loopback, site-local IPv4 addresses. Drop cellular-looking interfaces (`rmnet*`, `ccmni*`, `v4-*`) and VPN `tun*`. Prefer the Wi-Fi client address from `LinkProperties`, else the tether address. If several candidates remain, show a picker. Re-render the QR on a `NetworkCallback` change. |
| Apps can't toggle the normal hotspot. | Option: `WifiManager.startLocalOnlyHotspot()`, which needs `NEARBY_WIFI_DEVICES` on 13+ and gives no internet ([docs](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot)). Show a Wi-Fi-join QR (`WIFI:S:…;T:WPA;P:…;;`) and then the URL QR. Otherwise deep-link to the tethering settings. |
| **mDNS / `.local`:** Android resolves `.local` in the OS resolver only on newer releases (DnsResolver change, late 2021; not on Android 10/11) ([Esper](https://www.esper.io/blog/android-dessert-bites-26-mdns-local-47912385)). iOS resolves it natively. A normal Android app can't easily claim a hostname, and LNP gates NSD on target 37. | Don't rely on it. The QR always contains the IP literal plus port. Also show the short URL in large type for manual entry. |
| **Clients on a "no internet" network.** When joined to a hotspot without upstream data, Android 9+ and iOS clients may route traffic over cellular instead of the Wi-Fi ([Kodular](https://community.kodular.io/t/websocket-data-through-wifi-without-internet-connection-does-not-work-if-mobile-data-is-on/85041), [Apple](https://discussions.apple.com/thread/255880678)). | Best: the host shares mobile data through the hotspot, or everyone uses the home Wi-Fi. Otherwise a join-help screen says to tap "Stay connected" or "Use without internet", or turn off mobile data or Samsung "Intelligent Wi-Fi" switching. Detect it: if the page never loads, the user sees nothing, so put this tip next to the QR. |
| **Client isolation** on public, campus or hotel Wi-Fi blocks client-to-client traffic ([TP-Link](https://www.tp-link.com/au/faq-2089.html)). | Detect "hosting, but 0 connections after ~30 s" and suggest switching to the host's hotspot. On the host's own hotspot, clients talk to the gateway (the host), so isolation between clients doesn't matter. |

### 4.3 Browser-side constraints on `http://192.168.x.x`

| Gotcha | Mitigation |
|---|---|
| A plain-http LAN origin is **not a secure context**. That means no Screen Wake Lock API ([MDN](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API)), no Service Worker or PWA install, no `navigator.clipboard`, no `crypto.randomUUID`. `crypto.getRandomValues`, `localStorage`, WebSocket and WAAPI all work. | Feature-detect. For keeping the screen awake, use a muted, looping, inline tiny video started on the first tap (the NoSleep.js technique) and fall back to a "keep screen on" hint. Generate IDs with `getRandomValues`. |
| Mixed content and Chrome **Local Network Access**. Chrome 142+ prompts only for requests that go *public → local* or *→ loopback*; PNA preflights are deprecated ([Chrome LNA](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [blog](https://developer.chrome.com/blog/local-network-access)). | Serve the client **from the host itself** (same-origin, private → private: no prompt, no mixed content, `ws://` allowed). Never serve the client from a public https site that then calls the LAN. |
| Mobile browsers drop WebSockets when the screen locks or the tab is backgrounded, especially iOS Safari. Some ws-to-LAN regressions were reported on iOS/iPadOS 26 betas and in PWAs ([Apple forums](https://developer.apple.com/forums/thread/811063)). | The seat token lives in `localStorage`. Auto-reconnect with backoff on `visibilitychange`/`online`. The server sends a full snapshot on connect. Ping/pong every ~20 s. Actions are idempotent (client action id). Test on current iOS. |
| Anyone on the LAN can open the URL. | The random game token goes in the QR URL and is required for the WS upgrade. A separate host token is required for host-only actions (undo, correct, act-for). Rate-limit, validate everything server-side, and keep no secrets in state. |

---

## 5. Spike plan (1–2 days) to confirm the estimates

1. Build option 1 as a skeleton: shell, FGS, server, the counter web client and the QR code. Record the **APK size** with APK Analyzer and **cold start** with `adb shell am start -W` on a mid-range phone.
2. Test matrix:
   - Host: Pixel and Samsung, on Wi-Fi, on a hotspot with data, and on a hotspot without data.
   - Clients: Android Chrome and iOS Safari.
   - Scenarios: screen-lock and reconnect, `adb shell dumpsys deviceidle force-idle`, 6+ hours idle, and OEM battery saver.
3. Optional: build `lib<name>.so` from the 1a "hand-rolled std" server with cargo-ndk for arm64 and compare APK and start time. This settles Rust vs Kotlin with real numbers.

## Sources

The links are inline above. The main ones:

- Android:
  - [FGS types](https://developer.android.com/develop/background-work/services/fgs/service-types)
  - [FGS timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)
  - [Local network permission](https://developer.android.com/privacy-and-security/local-network-permission)
  - [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby)
  - [Power details](https://developer.android.com/topic/performance/power/power-details)
  - [16 KB pages](https://developer.android.com/guide/practices/page-sizes)
  - [Target SDK](https://developer.android.com/google/play/requirements/target-sdk)
  - [Local-only hotspot](https://developer.android.com/develop/connectivity/wifi/localonlyhotspot)
  - [WebView startup](https://developer.android.com/develop/ui/views/layout/webapps/optimize-webview-startup)
  - [Compose size metrics](https://developer.android.com/develop/ui/compose/migrate/compare-metrics)
- Chrome:
  - [Local Network Access guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)
  - [LNA blog](https://developer.chrome.com/blog/local-network-access)
- web.dev: [animations guide](https://web.dev/articles/animations-guide)
- Tauri:
  - [Android template](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/templates/mobile/android/app/build.gradle.kts)
  - [background-service plugin](https://docs.rs/crate/tauri-plugin-background-service/0.5.3)
- Others:
  - [UniFFI Gradle](https://mozilla.github.io/uniffi-rs/latest/kotlin/gradle.html)
  - [Flutter FAQ](https://docs.flutter.dev/resources/faq)
  - [Expo app size](https://docs.expo.dev/distribution/app-size/)
  - [Slint renderers](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backends_and_renderers/)
  - [Dioxus 0.7 README](https://docs.rs/crate/dioxus/0.7.8/source/README.md)
  - [dontkillmyapp.com](https://dontkillmyapp.com/)
- Package versions: crates.io, npm and Maven Central APIs, queried 2026-11-17.
