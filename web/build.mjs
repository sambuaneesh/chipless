// Bundles the client into dist/: index.html, app.js, app.css, static files, plus .gz copies.
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const watch = process.argv.includes('--watch')
const out = 'dist'

function finish() {
  const js = readFileSync(`${out}/app.js`)
  const css = readFileSync(`${out}/app.css`)
  const v = createHash('sha1').update(js).update(css).digest('hex').slice(0, 8)
  writeFileSync(`${out}/index.html`, readFileSync('index.html', 'utf8').replaceAll('__V__', v).replace(/\n\s*/g, '\n'))
  cpSync('public', out, { recursive: true })
  let raw = 0, gz = 0
  for (const f of readdirSync(out)) {
    if (!/\.(html|js|css|svg)$/.test(f)) continue
    const buf = readFileSync(`${out}/${f}`)
    const z = gzipSync(buf, { level: 9 })
    writeFileSync(`${out}/${f}.gz`, z)
    raw += buf.length; gz += z.length
  }
  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  console.log(`web: ${kb(raw)} raw, ${kb(gz)} gzipped (budget 60 KB)`)
  if (gz > 60 * 1024) { console.error('web bundle over budget'); if (!watch) process.exit(1) }
}

const opts = {
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outdir: out,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [{ name: 'finish', setup(b) { b.onEnd((r) => { if (!r.errors.length) finish() }) } }],
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
if (watch) {
  const ctx = await esbuild.context(opts)
  await ctx.watch()
  console.log('watching…')
} else {
  await esbuild.build(opts)
}
