/**
 * Keep a guest's screen awake during the game. Wake Lock needs a secure context, which a
 * LAN http page isn't, so fall back to a tiny muted looping video (the NoSleep technique).
 * The host app keeps its screen on natively.
 */
const native = !!(window as unknown as { Native?: unknown }).Native
let video: HTMLVideoElement | null = null
let lock: { release(): Promise<void> } | null = null

async function enable() {
  if (native) return
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock
    if (wl && window.isSecureContext) { lock = await wl.request('screen'); return }
  } catch { /* fall through */ }
  if (!video) {
    video = document.createElement('video')
    video.src = 'awake.mp4'
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('aria-hidden', 'true')
    video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:.01;pointer-events:none;bottom:0;left:0'
    document.body.appendChild(video)
  }
  video.play().catch(() => { /* needs a gesture; retried on next tap */ })
}

if (!native) {
  document.addEventListener('pointerdown', () => { if (!lock && (!video || video.paused)) void enable() }, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lock = null; void enable() }
  })
}
