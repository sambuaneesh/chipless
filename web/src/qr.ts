/**
 * Compact QR Code encoder (byte mode, error correction M, versions 1–40).
 * Follows ISO/IEC 18004; structure after Nayuki's reference design. Returns a module matrix.
 */
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
const FORMAT_M = 0

function rawModules(v: number): number {
  let r = (16 * v + 128) * v + 64
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (v >= 7) r -= 36
  }
  return r
}

const dataCodewords = (v: number) => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v]

function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsDivisor(degree: number): number[] {
  const r = new Array(degree).fill(0)
  r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root)
      if (j + 1 < degree) r[j] ^= r[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return r
}

function rsRemainder(data: number[], div: number[]): number[] {
  const r = new Array(div.length).fill(0)
  for (const b of data) {
    const f = b ^ (r.shift() as number)
    r.push(0)
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)))
  }
  return r
}

export function qrEncode(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  let ver = 1
  for (; ver <= 40; ver++) {
    const bits = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8
    if (bits <= dataCodewords(ver) * 8) break
  }
  if (ver > 40) throw new Error('Text too long for QR')

  // Bit stream
  const bb: number[] = []
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1) }
  put(4, 4)
  put(bytes.length, ver < 10 ? 8 : 16)
  bytes.forEach((b) => put(b, 8))
  const cap = dataCodewords(ver) * 8
  put(0, Math.min(4, cap - bb.length))
  put(0, (8 - (bb.length % 8)) % 8)
  for (let pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bb.length; i += 8) data.push(parseInt(bb.slice(i, i + 8).join(''), 2))

  // ECC + interleave
  const nBlocks = BLOCKS_M[ver]
  const eccLen = ECC_M[ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const nShort = nBlocks - (raw % nBlocks)
  const shortLen = Math.floor(raw / nBlocks)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < nShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const cw: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) cw.push(b[i]) })
  }

  // Matrix
  const size = ver * 4 + 17
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x: number, y: number, d: boolean) => { mod[y][x] = d; fn[y][x] = true }

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        set(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2
    const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2
    const pos = [6]
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p)
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  const drawFormat = (mask: number) => {
    const d = (FORMAT_M << 3) | mask
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((d << 10) | rem) ^ 0x5412
    const g = (i: number) => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, g(i))
    set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const c = ((bits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3), b = Math.floor(i / 3)
      set(a, b, c); set(b, a, c)
    }
  }

  // Data placement
  let bit = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const up = ((right + 1) & 2) === 0
      const y = up ? size - 1 - v : v
      if (!fn[y][x] && bit < cw.length * 8) {
        mod[y][x] = ((cw[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0
        bit++
      }
    }
  }

  const maskFn = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]
  }

  let best = 0, bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m)
    const s = penalty(mod)
    if (s < bestScore) { bestScore = s; best = m }
    applyMask(m)
  }
  applyMask(best); drawFormat(best)
  return mod
}

function penalty(m: boolean[][]): number {
  const n = m.length
  let p = 0
  const line = (get: (i: number) => boolean) => {
    let run = 1
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++
      else { if (run >= 5) p += run - 2; run = 1 }
    }
    for (let i = 0; i + 11 <= n; i++) {
      const s = Array.from({ length: 11 }, (_, k) => (get(i + k) ? 1 : 0)).join('')
      if (s === '10111010000' || s === '00001011101') p += 40
    }
  }
  for (let y = 0; y < n; y++) line((i) => m[y][i])
  for (let x = 0; x < n; x++) line((i) => m[i][x])
  let dark = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++
    if (y < n - 1 && x < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3
  }
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return p
}

/** SVG path data for dark modules (one rect per run) with a 4-module quiet zone. */
export function qrPath(text: string): { d: string; size: number } {
  const m = qrEncode(text)
  const n = m.length
  let d = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!m[y][x]) continue
      let w = 1
      while (x + w < n && m[y][x + w]) w++
      d += `M${x + 4} ${y + 4}h${w}v1h-${w}z`
      x += w - 1
    }
  }
  return { d, size: n + 8 }
}
