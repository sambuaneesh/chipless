// Records the website demo video and screenshots from a real game against the dev server.
// Usage: node site/capture.mjs <hostUrl> <guestUrl> <outDir>   (run from web/ so playwright-core resolves)
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const [hostUrl, guestUrl, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' })
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await new Promise((resolve, reject) => {
  const u = new URL(hostUrl)
  const ws = new WebSocket(`ws://${u.host}/ws`)
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', host: u.searchParams.get('host') })); ws.send(JSON.stringify({ t: 'cmd', c: 'reset' })); setTimeout(() => { ws.close(); resolve() }, 300) }
  ws.onerror = reject
})

const hctx = await browser.newContext({ ...phone, recordVideo: { dir: `${out}/raw`, size: { width: 390, height: 844 } } })
const h = await hctx.newPage()
const g = await (await browser.newContext(phone)).newPage()
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` })
const tap = async (p, name, pause = 900) => { await p.getByRole('button', { name }).first().click(); await wait(pause) }

await h.goto(hostUrl)
await h.waitForSelector('text=New table')
await wait(1500)
await shot(h, 'home')
await tap(h, 'New table', 700)
for (const n of ['Maya', 'Arjun', 'Sam', 'Zoe']) {
  await h.locator('input[placeholder*="name"]').type(n, { delay: 55 })
  await h.keyboard.press('Enter'); await wait(250)
}
await tap(h, /^MAMaya|Maya$/, 500)
await h.getByRole('radio', { name: 'Real buy-ins' }).click(); await wait(500)
await h.getByRole('radio', { name: 'Everyone uses theirs' }).click(); await wait(700)
await tap(h, /Start table/, 1200)
await h.keyboard.press('Escape').catch(() => {})
await h.getByRole('button', { name: 'Invite phones' }).click(); await wait(1200)
await shot(h, 'invite')
await h.getByRole('button', { name: 'Close' }).click(); await wait(500)

await g.goto(guestUrl)
await g.waitForSelector('text=Who are you?')
await wait(500)
await shot(g, 'guest-join')
await g.getByRole('button', { name: /Zoe/ }).click(); await wait(800)

await tap(h, /Deal hand 1/, 1600)
await shot(h, 'deal')
// Preflop: Zoe (UTG, on her phone) calls, Maya raises, Arjun folds, Sam and Zoe call.
await wait(600)
await shot(g, 'guest-turn')
await tap(g, /^Call/, 1000)
await tap(h, /^Raise/, 900)
await h.getByRole('button', { name: /^3×/ }).click(); await wait(800)
await shot(h, 'raise')
await tap(h, /^Raise to/, 1100)
await tap(h, /^Fold/, 900)
await tap(h, /^Call/, 900)
await tap(g, /^Call/, 1400)
await shot(h, 'flop')
// Flop: Sam checks, Zoe checks, Maya bets half pot, Sam calls, Zoe folds.
await tap(h, /^Check/, 900)
await tap(g, /^Check/, 900)
await tap(h, /^Bet/, 700)
await h.getByRole('button', { name: /½ pot/ }).click(); await wait(600)
await tap(h, /^Bet \d/, 1000)
await tap(h, /^Call/, 900)
await shot(g, 'guest-waiting')
await tap(g, /^Fold/, 1300)
// Turn and river: checks.
for (let i = 0; i < 4; i++) await tap(h, /^Check/, 800)
await wait(600)
await shot(h, 'showdown')
await tap(h, /Enter cards/, 800)
const pick = async (c) => { await h.getByRole('gridcell', { name: c }).click(); await wait(140) }
for (const c of ['Kh', '9h', '4c', '2h', 'Jd', 'Ah', 'Qh', 'Kd', 'Kc']) await pick(c)
await wait(1300)
await shot(h, 'referee')
await tap(h, /Award pot/, 2200)
await shot(h, 'result')
await shot(g, 'guest-result')
await tap(h, 'Menu', 600)
await tap(h, /End game & settle up/, 600)
await tap(h, 'End & settle', 1800)
await shot(h, 'settle')
await wait(800)
await hctx.close()
await browser.close()
console.log('captured')
