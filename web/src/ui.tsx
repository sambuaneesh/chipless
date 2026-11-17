import type { ButtonHTMLAttributes, ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { initials, rankText, seatColor, SUIT } from './fmt'
import { haptic } from './native'
import { prefs } from './prefs'

// ------------------------------------------------------------------ icons

const PATHS: Record<string, string> = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  close: 'M6 6l12 12M18 6 6 18',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16M12 10v4l2 2M9 2h6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  cards: 'M8 3h10a2 2 0 0 1 2 2v12M4 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5L20 7',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01',
  play: 'M7 4v16l13-8z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
}

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function IconBtn({ name, label, onClick, disabled, badge }: { name: string; label: string; onClick: () => void; disabled?: boolean; badge?: boolean }) {
  return (
    <button class="iconbtn" aria-label={label} title={label} onClick={() => { haptic('tick'); onClick() }} disabled={disabled}>
      <Icon name={name} />
      {badge && <span class="dot" />}
    </button>
  )
}

// ------------------------------------------------------------------ sheet

let backStack: (() => void)[] = []
;(window as unknown as { __back: () => boolean }).__back = () => {
  const f = backStack.pop()
  if (f) { f(); return true }
  return false
}

/** Bottom sheet. Closes on backdrop tap, Escape and Android back. */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    backStack.push(onClose)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    ref.current?.focus()
    return () => {
      backStack = backStack.filter((f) => f !== onClose)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  return (
    <div class="sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ controls

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger' | 'quiet' | 'raise'; big?: boolean; disabled?: boolean }

export function Btn({ kind = 'ghost', big, class: cls, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      class={`btn ${kind}${big ? ' big' : ''} ${cls || ''}`}
      onClick={(e) => { haptic('tick'); (onClick as ((e: Event) => void) | undefined)?.(e) }}
    />
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button role="radio" aria-checked={v === value} class={v === value ? 'on' : ''} onClick={() => { haptic('tick'); onChange(v) }}>{l}</button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <button class="toggle-row" role="switch" aria-checked={on} onClick={() => { haptic('tick'); onChange(!on) }}>
      <span class="tl"><span>{label}</span>{sub && <small>{sub}</small>}</span>
      <span class={'switch' + (on ? ' on' : '')} />
    </button>
  )
}

export function NumField({ label, value, onChange, min = 0, step = 1, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <label class="field">
      <span>{label}</span>
      <div class="num">
        <button aria-label={`Less ${label}`} onClick={(e) => { e.preventDefault(); onChange(Math.max(min, value - step)) }}><Icon name="minus" size={18} /></button>
        <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value} aria-label={label}
          onInput={(e) => {
            const el = e.target as HTMLInputElement
            const digits = el.value.replace(/\D/g, '').slice(0, 9)
            if (digits !== el.value) el.value = digits
            onChange(digits ? Math.max(min, Number(digits)) : min)
          }} />
        {suffix && <em>{suffix}</em>}
        <button aria-label={`More ${label}`} onClick={(e) => { e.preventDefault(); onChange(value + step) }}><Icon name="plus" size={18} /></button>
      </div>
    </label>
  )
}

/** Press-and-hold to confirm (all-in). The ring fills over [ms]. */
export function HoldBtn({ label, sub, onDone, ms = 600 }: { label: string; sub?: string; onDone: () => void; ms?: number }) {
  const [holding, setHolding] = useState(false)
  const t = useRef<number | undefined>(undefined)
  const start = (e: Event) => {
    e.preventDefault()
    setHolding(true)
    haptic('tick')
    t.current = window.setTimeout(() => { setHolding(false); haptic('heavy'); onDone() }, ms)
  }
  const stop = () => { clearTimeout(t.current); setHolding(false) }
  return (
    <button class={'btn hold' + (holding ? ' holding' : '')} style={{ '--hold': `${ms}ms` }}
      aria-label={`${label} — press and hold`}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) start(e) }} onKeyUp={stop}>
      <span class="fill" />
      <span class="lbl">{label}</span>
      {sub && <small>{holding ? 'keep holding…' : sub}</small>}
    </button>
  )
}

// ------------------------------------------------------------------ poker bits

export function Avatar({ name, seat, size = 44 }: { name: string; seat: number; size?: number }) {
  return (
    <span class="avatar" style={{ '--c': seatColor(seat), width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
  )
}

const LADDER = [1, 5, 25, 100, 500, 1000, 5000, 25000]
const CHIP_COLORS: Record<number, string> = { 1: '#e9e5dc', 5: '#d24b4b', 25: '#2f9e63', 100: '#26292b', 500: '#7d4bc8', 1000: '#e0b23e', 5000: '#e07b39', 25000: '#5f87a3' }

/** Chip colours for an amount (largest first), capped for display. Decoration only. */
export function chipColors(amount: number, smallest: number, max = 5): string[] {
  const ladder = LADDER.filter((d) => d >= smallest).reverse()
  const out: string[] = []
  let left = amount
  for (const d of ladder) {
    while (left >= d && out.length < max) { out.push(CHIP_COLORS[d]); left -= d }
  }
  if (!out.length && amount > 0) out.push(CHIP_COLORS[ladder[ladder.length - 1] ?? 1])
  return out
}

export const smallestChip = (sb: number) => [...LADDER].reverse().find((d) => sb % d === 0) ?? 1

export function ChipStack({ amount, sb, max = 5 }: { amount: number; sb: number; max?: number }) {
  const cols = chipColors(amount, smallestChip(sb), max).reverse()
  return (
    <span class="chipstack" aria-hidden="true">
      {cols.map((c, i) => <i class="chip" style={{ '--chip': c, '--i': i }} />)}
    </span>
  )
}

export function Card({ c, small, onClick, dim }: { c: string | null; small?: boolean; onClick?: () => void; dim?: boolean }) {
  if (!c) return <span class={'card empty' + (small ? ' small' : '')} onClick={onClick} />
  const suit = c[1]
  const color = prefs.fourColor ? { s: 'k', h: 'r', d: 'b', c: 'g' }[suit] : suit === 'h' || suit === 'd' ? 'r' : 'k'
  return (
    <span class={`card ${color}${small ? ' small' : ''}${dim ? ' dim' : ''}`} onClick={onClick} aria-label={`${rankText(c[0])} of ${({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as Record<string, string>)[suit]}`}>
      <b>{rankText(c[0])}</b><i>{SUIT[suit]}</i>
    </span>
  )
}
