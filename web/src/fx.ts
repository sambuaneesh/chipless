import type { Snap } from './types'

/** Chip flight animations. Decoration only: numbers update immediately regardless. */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

type Pt = { x: number; y: number }
function mid(el: Element | null): Pt | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
const q = (sel: string) => document.querySelector(sel)

function fly(from: Pt, to: Pt, n: number, dur: number, delay = 0, color = 'var(--brass)') {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i')
    el.className = 'fxchip'
    el.style.setProperty('--chip', color)
    el.style.left = from.x + 'px'
    el.style.top = from.y + 'px'
    document.body.appendChild(el)
    const dx = to.x - from.x, dy = to.y - from.y
    const jitter = (i - (n - 1) / 2) * 5
    const a = el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.9)', opacity: 0.0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(calc(-50% + ${dx + jitter}px), calc(-50% + ${dy - i * 2}px)) scale(1)`, opacity: 1, offset: 0.9 },
        { transform: `translate(calc(-50% + ${dx + jitter}px), calc(-50% + ${dy - i * 2}px)) scale(1)`, opacity: 0 },
      ],
      { duration: dur, delay: delay + i * 35, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
    )
    a.onfinish = () => el.remove()
  }
}

/** Called before the DOM updates (prev state still rendered). Returns a function to run after render. */
export function plan(prev: Snap | null, next: Snap): (() => void) | null {
  if (!prev || reduced()) return null
  const ph = prev.hand, nh = next.hand
  if (!nh) return null
  const sameHand = ph && ph.no === nh.no
  const jobs: (() => void)[] = []

  // Bets placed: seat → bet spot.
  if (sameHand) {
    for (const [id, amt] of Object.entries(nh.bets)) {
      if (amt > (ph!.bets[id] ?? 0)) jobs.push(() => {
        const a = mid(q(`[data-seat="${id}"] .avatar`)), b = mid(q(`[data-bet="${id}"]`))
        if (a && b) fly(a, b, amt >= nh.bb * 5 ? 3 : 2, 280)
      })
    }
  }
  // Street ends: bet spots → pot (capture positions now, before they disappear).
  const swept = sameHand && ph!.street !== nh.street ? Object.keys(ph!.bets).map((id) => mid(q(`[data-bet="${id}"]`))).filter(Boolean) as Pt[] : []
  if (swept.length) jobs.push(() => { const p = mid(q('#pot')); if (p) swept.forEach((s, i) => fly(s, p, 2, 320, 60 + i * 30)) })

  // Pot awarded: pot → winners.
  if (sameHand && ph!.street !== 'done' && nh.street === 'done') {
    const from = mid(q('#pot')) ?? (swept[0] || null)
    jobs.push(() => {
      const p = from ?? mid(q('#pot'))
      if (!p) return
      nh.results.forEach((r, k) => r.winners.forEach((w, j) => {
        const t = mid(q(`[data-seat="${w}"] .avatar`))
        if (t) fly(p, t, 6, 620, 250 + k * 150 + j * 80)
      }))
    })
  }
  return jobs.length ? () => jobs.forEach((j) => j()) : null
}
