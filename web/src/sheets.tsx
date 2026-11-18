import { useEffect, useMemo, useState } from 'preact/hooks'
import { chips, money, seatColor as seatColorOf, signed, SITE } from './fmt'
import { cmd, forgetSeat, send, store, useStore } from './net'
import { canExit, exitApp, isNative, saveFile, share } from './native'
import { RanksSheet } from './referee'
import { seatAngle } from './table'
import { prefs, setPref } from './prefs'
import { qrPath } from './qr'
import { CurrencyPick } from './setup'
import type { Snap } from './types'
import { Avatar, Btn, Icon, moved, NumField, Seg, Sheet, SortList, Toggle } from './ui'
import { closeSheet, openSheet, uiSet, useUi } from './uistate'

export function Sheets({ s }: { s: Snap | null }) {
  const u = useUi()
  const sh = u.sheet
  if (!sh) return null
  switch (sh.k) {
    case 'menu': return <Menu s={s} />
    case 'history': return s && <History s={s} />
    case 'players': return s && <Players s={s} />
    case 'seat': return s && <SeatMenu s={s} id={sh.id} />
    case 'blinds': return s && <Blinds s={s} />
    case 'settings': return <Settings s={s} />
    case 'invite': return s && <Invite s={s} />
    case 'ranks': return <RanksSheet />
    case 'seating': return s && <Seating s={s} />
    case 'export': return <Export s={s} />
    case 'restore': return <Restore s={s} />
    case 'close': return <CloseTable s={s} />
    case 'confirm': return (
      <Sheet title="Are you sure?" onClose={closeSheet}>
        <p>{sh.text}</p>
        <div class="row">
          <Btn kind="quiet" big onClick={closeSheet}>Cancel</Btn>
          <Btn kind="primary" big onClick={() => { closeSheet(); sh.run() }}>{sh.yes}</Btn>
        </div>
      </Sheet>
    )
    default: return null
  }
}

function Item({ icon, label, sub, onClick }: { icon: string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button class="item" onClick={onClick}>
      <Icon name={icon} /><span><b>{label}</b>{sub && <small>{sub}</small>}</span><Icon name="right" size={18} />
    </button>
  )
}

function Menu({ s }: { s: Snap | null }) {
  const host = store.role === 'host'
  const playing = s?.phase === 'play'
  return (
    <Sheet title="Menu" onClose={closeSheet}>
      <div class="list">
        {playing && <Item icon="history" label="Hand history" sub="Everything that happened" onClick={() => openSheet({ k: 'history' })} />}
        <Item icon="ranks" label="Hand rankings" sub="Which hand beats which, card values" onClick={() => openSheet({ k: 'ranks' })} />
        {host && playing && <Item icon="users" label="Players & seats" sub="Add, rebuy, sit out, fix stacks" onClick={() => openSheet({ k: 'players' })} />}
        {host && playing && <Item icon="seats" label="Seating order" sub="Drag to change who sits where" onClick={() => openSheet({ k: 'seating' })} />}
        {host && playing && <Item icon="timer" label="Blinds & timer" sub={s?.timer ? `Level ${s.timer.level}` : `${chips(s!.cfg.sb)}/${chips(s!.cfg.bb)} fixed`} onClick={() => openSheet({ k: 'blinds' })} />}
        {host && playing && <Item icon="qr" label="Invite phones" sub={s?.lan.open ? 'Sharing on your network' : 'Let friends join from their browser'} onClick={() => openSheet({ k: 'invite' })} />}
        <Item icon="cards" label="Who wins?" sub="Enter cards, get the winner explained" onClick={() => openSheet({ k: 'calc' })} />
        <Item icon="gear" label="Settings" sub="Sound, voice, hints, display" onClick={() => openSheet({ k: 'settings' })} />
        {host && playing && <Item icon="flag" label="End game & settle up" sub="Results and who pays whom" onClick={() => openSheet({ k: 'confirm', text: 'End the game and see the results?', yes: 'End & settle', run: () => cmd('end') })} />}
        {s && s.phase !== 'setup' && <Item icon="save" label="Save & export" sub={host ? 'Readable hand history · backup to switch phones' : 'Readable hand history'} onClick={() => openSheet({ k: 'export' })} />}
        {host && <Item icon="open" label="Continue a saved game" sub="Restore a backup from another phone" onClick={() => openSheet({ k: 'restore' })} />}
        {host && s && s.phase !== 'setup' && <Item icon="plus" label="New game" sub="Start over with a fresh table" onClick={() => openSheet({ k: 'confirm', text: 'Start a new game? The current table and results will be cleared.', yes: 'New game', run: () => cmd('reset') })} />}
        {host && s && s.phase !== 'setup' && <Item icon="power" label={canExit ? 'Close table & exit' : 'Close table'} sub="End the game for everyone and shut it down" onClick={() => openSheet({ k: 'close' })} />}
        {host && canExit && (!s || s.phase === 'setup') && <Item icon="power" label="Exit Chipless" sub="Close the app" onClick={() => exitApp()} />}
        {!host && store.me != null && <Item icon="close" label="Leave my seat" sub="Use this phone for someone else" onClick={() => { forgetSeat(); closeSheet() }} />}
      </div>
    </Sheet>
  )
}

const KIND_ICON: Record<string, string> = { board: '▣', show: '◆', win: '★', allin: '●', raise: '▲', bet: '▲', fold: '✕', check: '✓', call: '=', street: '▸', hand: '♠', fix: '✎', why: '›' }

function History({ s }: { s: Snap }) {
  const hands = useMemo(() => {
    const m = new Map<number, typeof s.log>()
    for (const l of s.log) m.set(l.h, [...(m.get(l.h) || []), l])
    return [...m.entries()].reverse()
  }, [s.seq])
  return (
    <Sheet title="Hand history" onClose={closeSheet}>
      {hands.map(([h, lines]) => (
        <section class="hist">
          <h3>{h === 0 ? 'Setup' : `Hand ${h}`}</h3>
          {lines.map((l) => <p class={'k-' + l.kind}><i>{KIND_ICON[l.kind] || '·'}</i>{l.text}</p>)}
        </section>
      ))}
    </Sheet>
  )
}

function Players({ s }: { s: Snap }) {
  const [name, setName] = useState('')
  const [entry, setEntry] = useState<'POST' | 'WAIT'>('POST')
  const add = () => { if (name.trim()) { cmd('add', { name: name.trim(), entry }); setName('') } }
  return (
    <Sheet title="Players & seats" onClose={closeSheet}>
      <p class="muted tiny">Listed clockwise, the same order you sit. Tap a player for options.</p>
      <Btn kind="ghost" onClick={() => openSheet({ k: 'seating' })}><Icon name="seats" size={18} /> Change seating order</Btn>
      <div class="list">
        {s.players.map((p, i) => (
          <button class="item" onClick={() => openSheet({ k: 'seat', id: p.id })}>
            <Avatar name={p.name} seat={i} size={36} />
            <span><b>{p.name}{p.id === s.button ? ' · D' : ''}</b><small>{chips(p.stack)} · {p.out ? 'sitting out' : p.waiting ? 'waiting for BB' : signed(p.net)}</small></span>
            <Icon name="right" size={18} />
          </button>
        ))}
      </div>
      {s.players.length < 10 && (
        <div class="addp">
          <input placeholder="New player's name" value={name} maxLength={16} onInput={(e) => setName((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          {s.handNo > 0 && <Seg label="Joins" value={entry} onChange={setEntry} options={[['POST', 'Play now (posts BB)'], ['WAIT', 'Wait for big blind']]} />}
          <Btn kind="primary" onClick={add} disabled={!name.trim()}>Add {chips(s.cfg.stack)}</Btn>
        </div>
      )}
    </Sheet>
  )
}

function SeatMenu({ s, id }: { s: Snap; id: number }) {
  const i = s.players.findIndex((p) => p.id === id)
  const p = s.players[i]
  const [stack, setStack] = useState(p?.stack ?? 0)
  const [nm, setNm] = useState(p?.name ?? '')
  if (!p) return null
  const h = s.hand
  const live = !!h && h.street !== 'done' && h.dealt.includes(p.id) && !h.folded.includes(p.id)
  const between = !h || h.street === 'done'
  const move = (d: number) => {
    const ids = s.players.map((x) => x.id)
    const j = (i + d + ids.length) % ids.length
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    cmd('reorder', { ids })
  }
  return (
    <Sheet title={p.name} onClose={closeSheet}>
      <div class="seathead">
        <Avatar name={p.name} seat={i} size={52} />
        <div><b>{chips(p.stack)}</b> chips<br /><small class="muted">Bought in {chips(p.buyIn)} · {signed(p.net)}{p.conn === 'on' ? ' · on their phone' : ''}</small></div>
      </div>
      {h?.toAct === p.id && p.conn === 'on' && <Btn kind="primary" big onClick={() => { uiSet({ actFor: p.id }); closeSheet() }}>Act for {p.name}</Btn>}
      <div class="grid2">
        <Btn kind="ghost" disabled={live} onClick={() => cmd('rebuy', { id })}>Rebuy +{chips(s.cfg.stack)}</Btn>
        {p.out
          ? <Btn kind="ghost" onClick={() => cmd('sitin', { id, entry: 'POST' })}>Sit back in</Btn>
          : <Btn kind="ghost" onClick={() => cmd('sitout', { id })}>Sit out</Btn>}
        <Btn kind="ghost" disabled={!between} onClick={() => cmd('button', { id })}>Make dealer</Btn>
        <Btn kind="ghost" disabled={live} onClick={() => openSheet({ k: 'confirm', text: `Remove ${p.name} from the table? They leave with ${chips(p.stack)}.`, yes: 'Remove', run: () => cmd('remove', { id }) })}>Remove</Btn>
        <Btn kind="quiet" disabled={!between} onClick={() => move(-1)}><Icon name="left" size={18} /> Seat earlier</Btn>
        <Btn kind="quiet" disabled={!between} onClick={() => move(1)}>Seat later <Icon name="right" size={18} /></Btn>
      </div>
      <div class="field-row">
        <NumField label="Correct stack" value={stack} step={s.cfg.sb} onChange={setStack} />
        <Btn kind="ghost" disabled={live || stack === p.stack} onClick={() => cmd('adjust', { id, stack })}>Save</Btn>
      </div>
      <p class="tiny muted">Corrections are logged for everyone to see.</p>
      <div class="field-row">
        <label class="field"><span>Name</span><input value={nm} maxLength={16} onInput={(e) => setNm((e.target as HTMLInputElement).value)} /></label>
        <Btn kind="ghost" disabled={!nm.trim() || nm === p.name} onClick={() => cmd('rename', { id, name: nm })}>Rename</Btn>
      </div>
    </Sheet>
  )
}

function Blinds({ s }: { s: Snap }) {
  const [sb, setSb] = useState(s.cfg.sb)
  const [bb, setBb] = useState(s.cfg.bb)
  const [minutes, setMinutes] = useState(s.cfg.minutes)
  const t = s.timer
  return (
    <Sheet title="Blinds & timer" onClose={closeSheet}>
      {t && (
        <div class="timerbox">
          <div><b>Level {t.level}</b> · {chips(t.sb)}/{chips(t.bb)}<br /><small class="muted">Next {chips(t.nextSb)}/{chips(t.nextBb)} · {t.minutes} min levels</small></div>
          <div class="row">
            <Btn kind="quiet" onClick={() => cmd('timer', { do: 'prev' })}><Icon name="left" size={18} /></Btn>
            <Btn kind="ghost" onClick={() => cmd('timer', { do: t.running ? 'pause' : 'resume' })}>{t.running ? 'Pause' : 'Resume'}</Btn>
            <Btn kind="quiet" onClick={() => cmd('timer', { do: 'next' })}><Icon name="right" size={18} /></Btn>
          </div>
        </div>
      )}
      <p class="muted tiny">{t ? 'Starting blinds for level 1. Levels multiply from here.' : 'Changes apply from the next hand.'}</p>
      <div class="grid2">
        <NumField label="Small blind" value={sb} min={1} step={sb >= 25 ? 25 : sb >= 5 ? 5 : 1} onChange={(v) => { setSb(v); if (bb < v * 2) setBb(v * 2) }} />
        <NumField label="Big blind" value={bb} min={1} step={bb >= 50 ? 50 : bb >= 10 ? 10 : 1} onChange={setBb} />
      </div>
      <Toggle on={s.cfg.timer} onChange={(v) => cmd('settings', { timer: v })} label="Blinds go up on a timer" sub="Like a tournament: levels rise every few minutes" />
      {s.cfg.timer && <NumField label="Minutes per level" value={minutes} min={1} step={5} onChange={setMinutes} />}
      <Btn kind="primary" big onClick={() => { cmd('settings', { sb, bb, minutes }); closeSheet() }}>Save</Btn>
    </Sheet>
  )
}

function Settings({ s }: { s: Snap | null }) {
  const [, force] = useState(0)
  const set = <K extends keyof typeof prefs>(k: K, v: (typeof prefs)[K]) => { setPref(k, v); force((x) => x + 1) }
  const host = store.role === 'host'
  return (
    <Sheet title="Settings" onClose={closeSheet}>
      {host && s && s.phase !== 'setup' && (
        <>
          <h3>Teaching</h3>
          <Seg label="Teaching level" value={s.cfg.teach} onChange={(v) => cmd('settings', { teach: v })}
            options={[['beginner', 'New to poker'], ['mixed', 'Some know'], ['pro', 'All pros']]} />
          <p class="tiny muted">Hints explain rules at the moment they matter, and fade as you learn.</p>
        </>
      )}
      <h3>This phone</h3>
      <Toggle on={prefs.sound} onChange={(v) => set('sound', v)} label="Sounds" sub="Chips, checks, your-turn chime" />
      <Toggle on={prefs.drama} onChange={(v) => set('drama', v)} label="Dramatic sounds" sub="Big bets swell, all-ins hit hard, big pots get a fanfare" />
      <Toggle on={prefs.callBets} onChange={(v) => set('callBets', v)} label="Announce bets out loud" sub="“Maya raises by 300, to 400. Pot-sized!”" />
      {host && <Toggle on={prefs.voice} onChange={(v) => set('voice', v)} label="Call out turns" sub="“Anna, it's on you”" />}
      <Toggle on={prefs.haptics} onChange={(v) => set('haptics', v)} label="Vibration" />
      {host && <Toggle on={prefs.face} onChange={(v) => set('face', v)} label="Turn buttons toward the player" sub="For a phone lying in the middle of the table" />}
      <Toggle on={prefs.fourColor} onChange={(v) => set('fourColor', v)} label="Four-colour suits" sub="♦ blue, ♣ green, easier to tell apart" />
      {host && s && s.phase !== 'setup' && (
        <>
          <h3>Money</h3>
          <Seg label="Chips are" value={s.cfg.mode} onChange={(v) => cmd('settings', { mode: v })} options={[['free', 'Just points'], ['money', 'Real buy-ins']]} />
          {s.cfg.mode === 'money' && <MoneyFields s={s} />}
        </>
      )}
    </Sheet>
  )
}

export function MoneyFields({ s }: { s: Snap }) {
  const [cur, setCur] = useState(s.cfg.currency)
  const [amt, setAmt] = useState(s.cfg.money / Math.pow(10, s.cfg.decimals))
  return (
    <div class="money">
      <CurrencyPick value={cur} onChange={setCur} />
      <NumField label={`Buy-in for ${chips(s.cfg.stack)} chips`} value={amt} min={0} step={100} onChange={setAmt} />
      <Btn kind="ghost" onClick={() => cmd('settings', { currency: cur, money: Math.round(amt * 100), decimals: 2 })}>Save</Btn>
    </div>
  )
}

function Invite({ s }: { s: Snap }) {
  const url = s.lan.urls[0]
  const qr = useMemo(() => (url ? qrPath(url) : null), [url])
  return (
    <Sheet title="Invite phones" onClose={closeSheet}>
      {!s.lan.open ? (
        <>
          <p>Friends can join from their own phone's browser, with no app to install. Everyone sees the table live and acts on their own phone.</p>
          <Btn kind="primary" big onClick={() => cmd('lan', { open: true })}><Icon name="wifi" /> Start sharing</Btn>
          <p class="tiny muted">Everyone must be on the same Wi-Fi, or connected to this phone's hotspot.</p>
        </>
      ) : !url ? (
        <>
          <p><b>No Wi-Fi network found.</b></p>
          <p>Connect this phone to Wi-Fi, or turn on its <b>mobile hotspot</b> and have friends join it. Then reopen this screen.</p>
          <Btn kind="quiet" onClick={() => cmd('lan', { open: false })}>Stop sharing</Btn>
        </>
      ) : (
        <>
          <ol class="steps">
            <li>Join the <b>same Wi-Fi</b> as this phone (or its hotspot).</li>
            <li>Scan with the camera and tap your name.</li>
          </ol>
          <div class="qr">
            <svg viewBox={`0 0 ${qr!.size} ${qr!.size}`} role="img" aria-label={`QR code for ${url}`} shape-rendering="crispEdges">
              <rect width="100%" height="100%" fill="#fff" /><path d={qr!.d} fill="#0b0f0e" />
            </svg>
          </div>
          <div class="url">{url.replace(/^http:\/\//, '').replace(/\/$/, '')}</div>
          {s.lan.urls.length > 1 && <p class="tiny muted">Other addresses: {s.lan.urls.slice(1).map((u) => u.replace(/^http:\/\//, '')).join(', ')}</p>}
          <div class="list compact">
            {s.players.map((p, i) => (
              <div class="item static">
                <Avatar name={p.name} seat={i} size={30} />
                <span>{p.name}</span>
                <span class={'connlbl ' + (p.conn ?? 'none')}>{p.conn === 'on' ? 'Connected' : p.conn === 'off' ? 'Phone asleep' : 'Not joined'}</span>
              </div>
            ))}
          </div>
          <p class="tiny muted">Joined but can't connect? Some public Wi-Fi blocks phones from talking to each other. Use this phone's hotspot instead. Players on a hotspot without internet should tap “Stay connected” if their phone asks.</p>
          <Btn kind="quiet" onClick={() => cmd('lan', { open: false })}>Stop sharing</Btn>
        </>
      )}
    </Sheet>
  )
}

export function SettleView({ s }: { s: Snap }) {
  const st = s.settle!
  const host = store.role === 'host'
  const isMoney = s.cfg.mode === 'money'
  const [via, setVia] = useState<'min' | 'bank'>('min')
  const [bank, setBank] = useState<number>(s.players[0]?.id ?? 0)
  const name = (id: number) => st.nets.find((n) => n.id === id)?.name ?? '?'
  const nets = [...st.nets].sort((a, b) => b.chips - a.chips)
  const fmtAmt = (v: number) => (isMoney ? money(v, s.cfg) : chips(v))
  const value = (n: (typeof st.nets)[number]) => (isMoney && n.money != null ? n.money : n.chips)
  const transfers = via === 'min' ? st.transfers : st.nets.filter((n) => n.id !== bank && value(n) !== 0).map((n) => value(n) < 0 ? { from: n.id, to: bank, amount: -value(n) } : { from: bank, to: n.id, amount: value(n) })
  const text = [
    `Chipless · poker night results`,
    ...nets.map((n) => `${n.name}: ${isMoney && n.money != null ? money(n.money, s.cfg, true) : signed(n.chips)}`),
    '',
    ...(transfers.length ? ['Payments:', ...transfers.map((t) => `${name(t.from)} → ${name(t.to)}: ${fmtAmt(t.amount)}`), ''] : []),
    `Tracked with Chipless, the free poker chips app: ${SITE}`,
  ].join('\n')
  return (
    <div class="settle">
      <h1>Results</h1>
      <div class={'balanced' + (st.balanced ? '' : ' bad')}>
        {st.balanced ? <><Icon name="check" size={16} /> Balanced: {chips(st.in)} chips in, {chips(st.out)} out</> : <>Not balanced: {chips(st.in)} in, {chips(st.out)} out. Fix stacks in Players before settling.</>}
      </div>
      <div class="nets">
        {nets.map((n, i) => (
          <div class={'net' + (n.chips > 0 ? ' up' : n.chips < 0 ? ' down' : '')}>
            <span class="rank">{i + 1}</span>
            <span class="nm">{n.name}<small>bought {chips(n.buyIn)}</small></span>
            <b>{isMoney && n.money != null ? money(n.money, s.cfg, true) : signed(n.chips)}</b>
          </div>
        ))}
      </div>
      {st.balanced && (
        <>
          <h2>Who pays whom</h2>
          <Seg label="Settle" value={via} onChange={setVia} options={[['min', 'Fewest payments'], ['bank', 'Everyone via one person']]} />
          {via === 'bank' && (
            <select class="select" value={bank} onChange={(e) => setBank(Number((e.target as HTMLSelectElement).value))}>
              {st.nets.map((n) => <option value={n.id}>{n.name} collects & pays out</option>)}
            </select>
          )}
          <div class="transfers">
            {transfers.length === 0 && <p class="muted">Nobody owes anything.</p>}
            {transfers.map((t) => (
              <div class="xfer"><b>{name(t.from)}</b><span class="arrow">pays</span><b>{name(t.to)}</b><em>{fmtAmt(t.amount)}</em></div>
            ))}
          </div>
          {via === 'min' && transfers.length > 0 && <p class="tiny muted">{transfers.length} payment{transfers.length > 1 ? 's' : ''}, the fewest possible.</p>}
        </>
      )}
      <ShareBtn text={text} />
      <Btn kind="quiet" onClick={() => openSheet({ k: 'export' })}><Icon name="save" size={18} /> Save hand history{host ? ' & backup' : ''}</Btn>
      {host && (
        <div class="row">
          <Btn kind="quiet" big onClick={() => cmd('reopen')}>Back to table</Btn>
          <Btn kind="primary" big onClick={() => openSheet({ k: 'confirm', text: 'Start a new game? These results will be cleared.', yes: 'New game', run: () => cmd('reset') })}>New game</Btn>
        </div>
      )}
      {host && <Btn kind="quiet" onClick={() => openSheet({ k: 'close' })}><Icon name="power" size={18} /> {canExit ? 'Close table & exit' : 'Close table'}</Btn>}
      {!host && <p class="tiny muted center-t">Host your own game: <a href={SITE} target="_blank" rel="noopener">get Chipless</a>, free for Android.</p>}
    </div>
  )
}

function ShareBtn({ text }: { text: string }) {
  const [shown, setShown] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <>
      <Btn kind="ghost" big onClick={async () => {
        const r = await share(text)
        if (r === 'copied') setMsg('Copied. Paste it in your group chat.')
        if (r === 'shown') setShown(true)
      }}><Icon name="share" /> Share results</Btn>
      {msg && <p class="tiny muted center-t">{msg}</p>}
      {shown && <textarea class="sharetext" readOnly value={text} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
    </>
  )
}

// ------------------------------------------------------------------ seating

/** Small table diagram: who sits where, numbered in playing order (clockwise). */
function MiniRing({ names, colors, dealer }: { names: string[]; colors: number[]; dealer: number }) {
  const n = names.length
  return (
    <div class="miniring" aria-hidden="true">
      <div class="mfelt"><span>↻<small>play goes clockwise</small></span></div>
      {names.map((nm, i) => {
        const a = (seatAngle(i, n) * Math.PI) / 180
        return (
          <span class={'mseat' + (i === dealer ? ' d' : '')} style={{ left: `${50 + 42 * Math.cos(a)}%`, top: `${50 + 40 * Math.sin(a)}%`, '--c': seatColorOf(colors[i]) }}>
            <b>{i + 1}</b>{nm.length > 7 ? nm.slice(0, 6) + '…' : nm}
          </span>
        )
      })}
    </div>
  )
}

function Seating({ s }: { s: Snap }) {
  const [ids, setIds] = useState(s.players.map((p) => p.id))
  useEffect(() => { setIds((cur) => { const now = s.players.map((p) => p.id); return cur.length === now.length && now.every((x) => cur.includes(x)) ? cur : now }) }, [s.players.length])
  const by = (id: number) => s.players.find((p) => p.id === id)!
  const seatOf = (id: number) => s.players.findIndex((p) => p.id === id)
  const changed = ids.join() !== s.players.map((p) => p.id).join()
  const inHand = !!s.hand && s.hand.street !== 'done'
  const dealer = ids.indexOf(s.button ?? -1)
  return (
    <Sheet title="Seating order" onClose={closeSheet}>
      <p class="muted tiny">Drag ⠿ or use the arrows. Play goes clockwise: each player acts after the one above them.</p>
      <MiniRing names={ids.map((id) => by(id).name)} colors={ids.map(seatOf)} dealer={dealer} />
      <SortList items={ids} label={(id) => by(id).name} onMove={(a, b) => setIds(moved(ids, a, b))}
        render={(id, i) => {
          const p = by(id)
          const prev = by(ids[(i - 1 + ids.length) % ids.length])
          return (
            <div class="seatrow">
              <span class="sn">{i + 1}</span>
              <Avatar name={p.name} seat={seatOf(id)} size={32} />
              <span class="sx"><b>{p.name}{id === s.button ? ' · D' : ''}</b><small>acts after {prev.name}</small></span>
              <button class={'dbtn' + (id === s.button ? ' on' : '')} disabled={inHand || id === s.button} aria-label={`Make ${p.name} the dealer`} onClick={() => cmd('button', { id })}>D</button>
            </div>
          )
        }} />
      {inHand && <p class="tiny" style={{ color: 'var(--amber)' }}>A hand is being played. Seats change after it ends, so set them up now and save when it's over.</p>}
      <div class="row">
        <Btn kind="quiet" big disabled={!changed} onClick={() => setIds(s.players.map((p) => p.id))}>Reset</Btn>
        <Btn kind="primary" big disabled={!changed || inHand} onClick={() => { cmd('reorder', { ids }); closeSheet() }}><Icon name="check" /> Save seats</Btn>
      </div>
      <p class="tiny muted">Tap D to choose who deals next. The blinds follow the dealer.</p>
    </Sheet>
  )
}

// ------------------------------------------------------------------ export / restore / close

function Export({ s }: { s: Snap | null }) {
  const st = useStore()
  const host = store.role === 'host'
  const [msg, setMsg] = useState('')
  useEffect(() => { store.exported = null; send({ t: 'export' }) }, [])
  const ex = st.exported
  const tell = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const doShare = async (text: string) => {
    const r = await share(text)
    if (r === 'copied') tell('Copied. Paste it anywhere.')
    if (r === 'shown') tell('Sharing isn’t available here. Use Save instead.')
  }
  return (
    <Sheet title="Save & export" onClose={closeSheet}>
      {!ex ? <p class="muted">Preparing…</p> : (
        <>
          <h3>Hand history</h3>
          <p class="tiny muted">The whole night in plain text: standings, who pays whom, and every hand action by action.</p>
          <pre class="exportpre">{ex.text.split('\n').slice(0, 40).join('\n')}{ex.text.split('\n').length > 40 ? '\n…' : ''}</pre>
          <div class="row">
            <Btn kind="ghost" onClick={() => doShare(ex.text)}><Icon name="share" size={18} /> Share</Btn>
            <Btn kind="ghost" onClick={() => { saveFile(ex.file, 'text/plain', ex.text); if (!isNative) tell('Downloaded ' + ex.file) }}><Icon name="save" size={18} /> Save file</Btn>
          </div>
          {host && ex.backup && (
            <>
              <h3>Move the game to another phone</h3>
              <p class="tiny muted">A backup keeps everything: players, stacks, buy-ins, blinds, the hand in progress and its history. On the other phone open Chipless, tap <b>Continue a saved game</b> and choose this file.</p>
              <div class="row">
                <Btn kind="primary" onClick={() => { saveFile(ex.backupFile!, 'application/json', ex.backup!); if (!isNative) tell('Downloaded ' + ex.backupFile) }}><Icon name="save" size={18} /> Save backup</Btn>
                <Btn kind="ghost" onClick={() => doShare(ex.backup!)}><Icon name="share" size={18} /> Share as text</Btn>
              </div>
              {s?.phase === 'play' && <p class="tiny muted">Tip: after restoring on the new phone, close the table on this one so nobody plays on the old copy.</p>}
            </>
          )}
          {msg && <p class="tiny center-t" style={{ color: 'var(--green)' }}>{msg}</p>}
        </>
      )}
    </Sheet>
  )
}

function Restore({ s }: { s: Snap | null }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [file, setFile] = useState('')
  const busy = !!s && s.phase !== 'setup'
  let data: unknown = null
  try { data = text.trim() ? JSON.parse(text) : null } catch { data = null }
  const ok = !!data && (data as { app?: string }).app === 'chipless'
  useEffect(() => { setErr(text.trim() && !ok ? 'That doesn’t look like a Chipless backup.' : '') }, [text])
  const load = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    setFile(f.name)
    f.text().then(setText).catch(() => setErr('Couldn’t read that file.'))
  }
  const run = () => { cmd('import', { data }); closeSheet() }
  return (
    <Sheet title="Continue a saved game" onClose={closeSheet}>
      <p class="tiny muted">Pick the backup file saved on the other phone (Save & export → Save backup), or paste its text. The table continues exactly where it was, including a hand in progress.</p>
      <label class="btn ghost filepick"><Icon name="open" size={18} /> {file || 'Choose backup file'}
        <input type="file" accept=".json,application/json,text/plain" onChange={load} />
      </label>
      <textarea class="sharetext" placeholder="…or paste the backup text here" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      {err && <p class="tiny" style={{ color: 'var(--red)' }}>{err}</p>}
      {ok && busy && <p class="tiny" style={{ color: 'var(--amber)' }}>This replaces the game on this phone. Save its history first if you need it.</p>}
      <p class="tiny muted">Friends' phones need to rejoin: they scan the new QR code and tap their name.</p>
      <Btn kind="primary" big disabled={!ok} onClick={run}><Icon name="check" /> Restore game</Btn>
    </Sheet>
  )
}

function CloseTable({ s }: { s: Snap | null }) {
  const close = () => {
    closeSheet()
    cmd('close')
    if (canExit) setTimeout(exitApp, 350)
  }
  return (
    <Sheet title={canExit ? 'Close table & exit' : 'Close table'} onClose={closeSheet}>
      <p>This ends the game for everyone{s?.lan.open ? ', stops sharing with other phones' : ''}{canExit ? ' and closes Chipless' : ''}. The table, results and history are cleared.</p>
      <Btn kind="ghost" big onClick={() => openSheet({ k: 'export' })}><Icon name="save" /> Save history or backup first</Btn>
      <div class="row">
        <Btn kind="quiet" big onClick={closeSheet}>Cancel</Btn>
        <Btn kind="danger" big onClick={close}><Icon name="power" /> {canExit ? 'Close & exit' : 'Close table'}</Btn>
      </div>
    </Sheet>
  )
}
