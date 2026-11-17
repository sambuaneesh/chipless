import type { Cfg } from './types'

const nf = new Intl.NumberFormat('en-US')

/** Chips: exact with grouping; abbreviated only from six digits up. */
export function chips(n: number): string {
  if (Math.abs(n) >= 100_000) {
    const v = n / 1000
    return (Math.abs(v) >= 1000 ? nf.format(Math.round(v)) : v.toFixed(v % 1 === 0 ? 0 : 1)) + 'k'
  }
  return nf.format(n)
}

export function signed(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + chips(Math.abs(n))
}

/** Money from minor units, e.g. 12550 → ₹125.50 (trailing .00 dropped). */
export function money(minor: number, cfg: Cfg, sign = false): string {
  const d = cfg.decimals
  const abs = Math.abs(minor) / Math.pow(10, d)
  let s = abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (d > 0 && s.endsWith('.' + '0'.repeat(d))) s = s.slice(0, -(d + 1))
  const pre = sign ? (minor > 0 ? '+' : minor < 0 ? '−' : '') : minor < 0 ? '−' : ''
  return pre + cfg.currency + s
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}

/** Okabe–Ito palette, softened for the dark table. Never the only signal: initials go with it. */
const SEAT = ['#e69f00', '#56b4e9', '#2fbf8f', '#f0e442', '#4d8fd6', '#e07b39', '#cc79a7', '#a3a3a3', '#9b8cf2', '#7fd1c7']
export const seatColor = (i: number) => SEAT[i % SEAT.length]

export const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const rankText = (r: string) => (r === 'T' ? '10' : r)
