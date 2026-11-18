// End-to-end smoke test: host + guest phones in headless Chromium against the dev server.
// Usage: node test/e2e.mjs <hostUrl> <guestUrl> <shotsDir>
import { chromium } from 'playwright-core'

const [hostUrl, guestUrl, shots] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium' })
const [vw, vh] = (process.env.VIEWPORT || '390x844').split('x').map(Number)
const phone = { viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const errors = []
const mk = async (name) => {
  const ctx = await browser.newContext(phone)
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`) })
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  return p
}
const shot = (p, n) => p.screenshot({ path: `${shots}/${n}.png` })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const click = async (p, text) => { await p.getByRole('button', { name: text }).first().click(); await wait(250) }

// Start from a clean table.
await new Promise((resolve, reject) => {
  const u = new URL(hostUrl)
  const ws = new WebSocket(`ws://${u.host}/ws`)
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', host: u.searchParams.get('host') })); ws.send(JSON.stringify({ t: 'cmd', c: 'reset' })); setTimeout(() => { ws.close(); resolve() }, 300) }
  ws.onerror = reject
})

const host = await mk('host')
await host.goto(hostUrl)
await host.waitForSelector('text=New table')
await shot(host, '01-home')
await click(host, 'New table')
for (const n of ['Ann', 'Ben', 'Cara', 'Dan', 'Eve']) {
  await host.fill('input[placeholder*="name"]', n)
  await host.keyboard.press('Enter')
}
await host.getByRole('button', { name: /^AnnAN|Ann/ }).first().click()
await host.getByRole('radio', { name: 'Real buy-ins' }).click()
await wait(200)
await host.screenshot({ path: `${shots}/02-setup.png`, fullPage: true })
await click(host, /Start table/)
await host.waitForSelector('.ring')
await shot(host, '03-table-ready')
await click(host, /Deal hand 1/)
await wait(500)
await shot(host, '04-preflop')

const act = async (re) => { await host.getByRole('button', { name: re }).first().click(); await wait(350) }
// Preflop: UTG calls, others call, BB checks.
await act(/^Call/); await act(/^Call/); await act(/^Call/); await act(/^Call/)
await act(/^Check/)
await wait(400)
await shot(host, '05-flop')
// Pad: rank, then suit. Cards fill the highlighted slot and move on.
const pad = async (p, card) => {
  const r = card[0] === 'T' ? '10' : card[0]
  await p.locator('.pad-ranks').getByRole('button', { name: r, exact: true }).click()
  await p.locator('.pad-suits').getByRole('button', { name: { s: 'Spades', h: 'Hearts', d: 'Diamonds', c: 'Clubs' }[card[1]] }).click()
  await wait(60)
}
// Optional: record the flop as it's dealt.
await click(host, /Enter cards/)
await shot(host, '05b-board-editor')
for (const c of ['Kh', '7d', '7c']) await pad(host, c)
await shot(host, '05c-board-filled')
await click(host, /Save board/)
await wait(300)
await shot(host, '05d-board-on-table')
await act(/^Bet/)
await wait(300)
await shot(host, '06-raise-tray')
await host.getByRole('button', { name: /½ pot/ }).click()
await host.getByRole('button', { name: /^Bet \d/ }).click()
await wait(120)
await shot(host, '07-action-flash')
await wait(500)
await shot(host, '07-after-bet')

// Guest joins and claims a seat.
const guest = await mk('guest')
await guest.goto(guestUrl)
await guest.waitForSelector('text=Who are you?')
await shot(guest, '08-guest-join')
await guest.getByRole('button', { name: /Cara/ }).click()
await wait(600)
await shot(guest, '09-guest-table')
await shot(host, '10-host-sees-guest')

// Play out: everyone folds to the bettor except one caller, then showdown via checks.
let guard = 0
while (guard++ < 40) {
  const street = await host.locator('.potl').first().textContent()
  if (/Showdown|Winner|Split|pots/.test(street || '')) break
  const waiting = await host.locator('text=on their phone').count()
  if (waiting) {
    // Guest acts on their own phone.
    const btn = guest.getByRole('button', { name: /^(Check|Call)/ }).first()
    if (await btn.count()) { await shot(guest, '11-guest-turn'); await btn.click(); await wait(400); continue }
  }
  const check = host.getByRole('button', { name: /^Check/ })
  if (await check.count()) { await check.first().click(); await wait(300); continue }
  const call = host.getByRole('button', { name: /^Call/ })
  if (await call.count()) { await call.first().click(); await wait(300); continue }
  break
}
await wait(500)
await shot(host, '12-showdown')
await click(host, /Enter cards/)
await wait(300)
await shot(host, '13-referee-empty')
const pick = (c) => pad(host, c)
// The flop is already filled in from the board recorded earlier; add turn and river.
for (const c of ['2s', '9h']) await pick(c)
// Fill as many contenders as the sheet shows (2 cards each).
const rows = await host.locator('.refrow').count()
const holes = [['Ks', 'Qd'], ['Kd', 'Jc'], ['Ac', '3d'], ['5h', '5s'], ['Th', 'Tc']]
for (let i = 0; i < rows - 1; i++) { await pick(holes[i][0]); await pick(holes[i][1]) }
await wait(700)
await shot(host, '14-referee-verdict')
await click(host, /Award pot/)
await wait(900)
await shot(host, '15-result')
await shot(guest, '16-guest-result')

await host.getByRole('button', { name: 'Menu' }).click()
await wait(300)
await shot(host, '17-menu')
await host.getByRole('button', { name: /Hand history/ }).click()
await wait(300)
await shot(host, '18-history')
await host.keyboard.press('Escape')
await host.getByRole('button', { name: 'Menu' }).click()
await host.getByRole('button', { name: /End game & settle up/ }).click()
await host.getByRole('button', { name: 'End & settle' }).click()
await wait(600)
await shot(host, '19-settle')
await shot(guest, '20-guest-settle')
await click(host, /Back to table/)
await wait(400)

// Seating: drag the first player two rows down.
await host.getByRole('button', { name: 'Menu' }).click()
await host.getByRole('button', { name: /Seating order/ }).click()
await wait(300)
const before = await host.locator('.seatrow .sx b').allTextContents()
const grip = host.locator('.srt-grip').first()
const box = await grip.boundingBox()
await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await host.mouse.down()
const rowH = await host.locator('.srt-row').first().evaluate((e) => e.getBoundingClientRect().height + 6)
for (let k = 1; k <= 10; k++) { await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (k * rowH * 2) / 10); await wait(16) }
await shot(host, '21-seating-drag')
await host.mouse.up()
await wait(300)
const after = await host.locator('.seatrow .sx b').allTextContents()
if (before[0] === after[0] || after[2] !== before[0]) errors.push('drag reorder failed: ' + before + ' -> ' + after)
await shot(host, '22-seating')
await click(host, /Save seats/)
await wait(300)

// Rankings from the top bar on the guest phone.
await guest.getByRole('button', { name: 'Hand rankings' }).first().click()
await wait(300)
await shot(guest, '23-guest-rankings')
await guest.keyboard.press('Escape')

// Export history + backup, restore it, then close the table.
await host.getByRole('button', { name: 'Menu' }).click()
await host.getByRole('button', { name: /Save & export/ }).click()
await host.waitForSelector('.exportpre')
await shot(host, '24-export')
const hist = await host.locator('.exportpre').textContent()
if (!/HAND HISTORY/.test(hist) || !/Flop: |Board: /.test(hist)) errors.push('export text incomplete')
const [dl] = await Promise.all([host.waitForEvent('download'), host.getByRole('button', { name: /Save backup/ }).click()])
const backupPath = `${shots}/backup.json`
await dl.saveAs(backupPath)
await host.keyboard.press('Escape')
const stacksBefore = await host.locator('.seat .st').allTextContents()
await host.getByRole('button', { name: 'Menu' }).click()
await host.getByRole('button', { name: /Continue a saved game/ }).click()
await host.locator('.filepick input').setInputFiles(backupPath)
await wait(300)
await shot(host, '25-restore')
await click(host, /Restore game/)
await wait(600)
const stacksAfter = await host.locator('.seat .st').allTextContents()
if (stacksBefore.join() !== stacksAfter.join()) errors.push('restore changed stacks: ' + stacksBefore + ' / ' + stacksAfter)
await shot(host, '26-restored')
await host.getByRole('button', { name: 'Menu' }).click()
await host.getByRole('button', { name: /Close table/ }).click()
await shot(host, '27-close')
await host.locator('.sheet').getByRole('button', { name: /^Close table$/ }).click()
await wait(500)
if (!(await host.locator('text=New table').count())) errors.push('close did not return home')
await shot(host, '28-closed')

console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors')
await browser.close()
