import { useState } from 'preact/hooks'
import { chips, CURRENCIES, money } from './fmt'
import { cmd } from './net'
import { haptic } from './native'
import { local } from './prefs'
import type { Cfg } from './types'
import { Avatar, Btn, Icon, NumField, Seg, Toggle } from './ui'
import { openSheet } from './uistate'
import { HandRanks } from './referee'

export function Home({ onNew }: { onNew: () => void }) {
  return (
    <div class="home">
      <div class="brand">
        <div class="logo" aria-hidden="true"><i /><i /><i /></div>
        <h1>Chipless</h1>
        <p>Real cards. No chips needed.<br />The app runs the table and teaches as you play.</p>
      </div>
      <div class="homeacts">
        <Btn kind="primary" big onClick={onNew}><Icon name="play" /> New table</Btn>
        <Btn kind="ghost" big onClick={() => openSheet({ k: 'calc' })}><Icon name="cards" /> Who wins? <small>card checker</small></Btn>
      </div>
      <HandRanks />
    </div>
  )
}

type Preset = 'casual' | 'deep' | 'tourney' | 'custom'
const PRESETS: Record<Exclude<Preset, 'custom'>, { label: string; sub: string; sb: number; bb: number; stack: number; timer: boolean }> = {
  casual: { label: 'Casual', sub: '5/10 · 1,000 chips', sb: 5, bb: 10, stack: 1000, timer: false },
  deep: { label: 'Long night', sub: '5/10 · 2,000 chips', sb: 5, bb: 10, stack: 2000, timer: false },
  tourney: { label: 'Tournament', sub: '25/50 · 5,000 · blinds rise', sb: 25, bb: 50, stack: 5000, timer: true },
}

export function Setup({ onBack }: { onBack: () => void }) {
  const saved = (() => { try { return JSON.parse(local('chipless.lastNames') || '[]') as string[] } catch { return [] } })()
  const [names, setNames] = useState<string[]>(saved.length >= 2 ? saved : [])
  const [input, setInput] = useState('')
  const [dealer, setDealer] = useState(-1)
  const [preset, setPreset] = useState<Preset>('casual')
  const [c, setC] = useState({ sb: 5, bb: 10, stack: 1000, timer: false, minutes: 20 })
  const [mode, setMode] = useState<Cfg['mode']>('free')
  const [currency, setCurrency] = useState('')
  const [buyIn, setBuyIn] = useState(500)
  const [teach, setTeach] = useState<Cfg['teach']>('beginner')
  const [share, setShare] = useState(false)

  const add = () => {
    const n = input.trim().slice(0, 16)
    if (!n || names.some((x) => x.toLowerCase() === n.toLowerCase()) || names.length >= 10) return
    haptic('tick')
    setNames([...names, n]); setInput('')
  }
  const remove = (i: number) => { setNames(names.filter((_, j) => j !== i)); if (dealer === i) setDealer(-1) }
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= names.length) return
    const a = [...names]; [a[i], a[j]] = [a[j], a[i]]; setNames(a)
    if (dealer === i) setDealer(j); else if (dealer === j) setDealer(i)
  }
  const choose = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') { const x = PRESETS[p]; setC({ ...c, sb: x.sb, bb: x.bb, stack: x.stack, timer: x.timer }) }
  }
  const start = () => {
    local('chipless.lastNames', JSON.stringify(names))
    haptic('confirm')
    cmd('setup', {
      names, button: dealer, sb: c.sb, bb: c.bb, stack: c.stack, timer: c.timer, minutes: c.minutes,
      mode, currency, money: Math.round(buyIn * 100), decimals: 2, teach,
    })
    if (share) cmd('lan', { open: true })
  }
  const can = names.length >= 2 && c.sb > 0 && c.bb >= c.sb && c.stack > 0
  const cfgPreview = { ...c, mode, currency, money: Math.round(buyIn * 100), decimals: 2 } as Cfg

  return (
    <div class="setup">
      <header class="topbar">
        <button class="iconbtn" aria-label="Back" onClick={onBack}><Icon name="left" /></button>
        <div class="tb-info"><b>New table</b></div>
      </header>

      <section>
        <h2>Who's playing?</h2>
        <p class="tiny muted">Add names in the order you sit, going clockwise. Tap a name to make them the first dealer.</p>
        <div class="names">
          {names.map((n, i) => (
            <div class={'nm-row' + (dealer === i ? ' is-dealer' : '')}>
              <button class="nm-main" onClick={() => setDealer(dealer === i ? -1 : i)} aria-label={`${n}${dealer === i ? ', first dealer' : ''}`}>
                <Avatar name={n} seat={i} size={34} /><span>{n}</span>{dealer === i && <i class="dchip">D</i>}
              </button>
              <button class="iconbtn sm" aria-label={`Move ${n} up`} onClick={() => move(i, -1)} disabled={i === 0}><Icon name="left" size={16} /></button>
              <button class="iconbtn sm" aria-label={`Move ${n} down`} onClick={() => move(i, 1)} disabled={i === names.length - 1}><Icon name="right" size={16} /></button>
              <button class="iconbtn sm" aria-label={`Remove ${n}`} onClick={() => remove(i)}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
        {names.length < 10 && (
          <div class="addp">
            <input placeholder={names.length ? 'Add another name' : 'First player name'} value={input} maxLength={16} enterKeyHint="done"
              onInput={(e) => setInput((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Btn kind="ghost" onClick={add} disabled={!input.trim()}><Icon name="plus" size={18} /> Add</Btn>
          </div>
        )}
        <p class="tiny muted">{dealer < 0 ? 'First dealer: random.' : `${names[dealer]} deals first.`} Friends can also add themselves later from their phone.</p>
      </section>

      <section>
        <h2>Stakes</h2>
        <div class="presets3">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <button class={'preset' + (preset === k ? ' on' : '')} onClick={() => choose(k)} aria-pressed={preset === k}>
              <b>{PRESETS[k].label}</b><small>{PRESETS[k].sub}</small>
            </button>
          ))}
          <button class={'preset' + (preset === 'custom' ? ' on' : '')} onClick={() => choose('custom')} aria-pressed={preset === 'custom'}><b>Custom</b><small>Your own numbers</small></button>
        </div>
        {preset === 'custom' && (
          <div class="grid2">
            <NumField label="Small blind" value={c.sb} min={1} step={c.sb >= 25 ? 25 : 5} onChange={(v) => setC({ ...c, sb: v, bb: Math.max(c.bb, v * 2) })} />
            <NumField label="Big blind" value={c.bb} min={1} step={c.bb >= 50 ? 50 : 10} onChange={(v) => setC({ ...c, bb: v })} />
            <NumField label="Starting chips" value={c.stack} min={1} step={c.stack >= 1000 ? 500 : 100} onChange={(v) => setC({ ...c, stack: v })} />
            <NumField label="Minutes per level" value={c.minutes} min={1} step={5} onChange={(v) => setC({ ...c, minutes: v })} />
          </div>
        )}
        {preset === 'custom' && <Toggle on={c.timer} onChange={(v) => setC({ ...c, timer: v })} label="Blinds rise on a timer" />}
        <p class="tiny muted">Each player starts with {chips(c.stack)} chips — {Math.floor(c.stack / c.bb)} big blinds.{c.timer ? ` Blinds go up every ${c.minutes} minutes.` : ''}</p>
      </section>

      <section>
        <h2>Are chips worth money?</h2>
        <Seg label="Chips are" value={mode} onChange={setMode} options={[['free', 'Just for fun'], ['money', 'Real buy-ins']]} />
        {mode === 'money' && (
          <div class="grid2">
            <CurrencyPick value={currency} onChange={setCurrency} />
            <NumField label="Buy-in" value={buyIn} min={0} step={100} onChange={setBuyIn} />
          </div>
        )}
        {mode === 'money' && <p class="tiny muted">{money(cfgPreview.money, cfgPreview)} buys {chips(c.stack)} chips. Rebuys are tracked, and at the end the app works out the fewest payments.</p>}
      </section>

      <section>
        <h2>How much poker do you know?</h2>
        <Seg label="Teaching level" value={teach} onChange={setTeach} options={[['beginner', 'New to it'], ['mixed', 'Some of us'], ['pro', 'We know']]} />
      </section>

      <section>
        <h2>Phones</h2>
        <Seg label="Phones" value={share ? 'all' : 'one'} onChange={(v) => setShare(v === 'all')} options={[['one', 'Pass this phone'], ['all', 'Everyone uses theirs']]} />
        <p class="tiny muted">{share ? 'Friends scan a QR code and join from their browser — no install. You can still act for anyone here.' : 'Leave the phone in the middle of the table. You can invite phones any time later.'}</p>
      </section>

      <div class="sticky-cta">
        <Btn kind="primary" big disabled={!can} onClick={start}>{names.length < 2 ? 'Add at least 2 players' : `Start table · ${names.length} players`}</Btn>
      </div>
    </div>
  )
}

export function CurrencyPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label class="field"><span>Currency</span>
      <select class="select" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        {CURRENCIES.map(([code, sym, name]) => <option value={code}>{code ? `${sym.trim()} ${name}` : name}</option>)}
      </select>
    </label>
  )
}

export function Waiting({ text }: { text: string }) {
  return (
    <div class="home">
      <div class="brand">
        <div class="logo" aria-hidden="true"><i /><i /><i /></div>
        <h1>Chipless</h1>
        <p>{text}</p>
      </div>
      <div class="spinner" aria-hidden="true" />
      <HandRanks />
    </div>
  )
}
