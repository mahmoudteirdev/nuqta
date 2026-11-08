#!/usr/bin/env node
// أداة إصدار التراخيص لصاحب البرنامج. ما بتنشحن مع البرنامج.
//
//   npm run license:admin
//       بتفتح صفحة محلية بالمتصفح: اسم الزبون وكود الجهاز والمدة، وبتطلع السيريال وبتسجله بقائمة الزباين.
//
//   --dir <مجلد>    مجلد المفتاح الخاص وسجل الزباين. الافتراضي ~/.nuqta-vendor. لازم يكون برا المشروع.
//   --port <رقم>    الافتراضي: أي منفذ فاضي.
//   --no-open       ما تفتح المتصفح.
//   --public-key-file <ملف>   ملف المفتاح العام بالبرنامج (للفحص).
//
// الأمان: السيرفر على 127.0.0.1 بس، وكل طلب بدو رمز عشوائي بينعمل كل تشغيلة، وبيتأكد من Host وOrigin
// عشان صفحة ويب ثانية ما تقدر تصدر سيريال من متصفحك. المفتاح الخاص ما بيطلع من السيرفر أبدا.

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addDays, addMonths, dateText, generateKeys, isRealDate, issueKey, issueResetKey, normalizeDevice, normalizeRequest, publicFromPrivate } from './license-lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const PROJECT = resolve(APP, '..')

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

const DIR = resolve(arg('--dir') || join(homedir(), '.nuqta-vendor'))
const PUBLIC_FILE = resolve(arg('--public-key-file') || join(APP, 'src/main/license-public-key.ts'))
const KEY_FILE = join(DIR, 'license-private.pem')
const LOG_FILE = join(DIR, 'licenses.jsonl')
const TOKEN = randomBytes(24).toString('hex')

const inside = relative(PROJECT, DIR)
if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
  console.error(`المجلد لازم يكون برا المشروع، عشان المفتاح وأسماء الزباين ما يروحوا على git: ${DIR}`)
  process.exit(1)
}

// ───── الملفات

const STATIC = {
  '/admin.css': [join(HERE, 'license-admin/admin.css'), 'text/css; charset=utf-8'],
  '/admin.js': [join(HERE, 'license-admin/admin.js'), 'text/javascript; charset=utf-8'],
  '/tokens.css': [join(APP, 'src/renderer/src/styles/tokens.css'), 'text/css; charset=utf-8'],
  '/components.css': [join(APP, 'src/renderer/src/styles/components.css'), 'text/css; charset=utf-8'],
  '/fonts/ar-400.woff2': [join(APP, 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2'), 'font/woff2'],
  '/fonts/ar-600.woff2': [join(APP, 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2'), 'font/woff2'],
  '/fonts/la-400.woff2': [join(APP, 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2'), 'font/woff2'],
  '/fonts/la-600.woff2': [join(APP, 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2'), 'font/woff2'],
  '/fonts/mono-600.woff2': [join(APP, 'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2'), 'font/woff2']
}

function readRows() {
  if (!existsSync(LOG_FILE)) return { rows: [], badLines: 0 }
  const rows = []
  let badLines = 0
  for (const line of readFileSync(LOG_FILE, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      badLines++
    }
  }
  return { rows, badLines }
}

const pemBody = (pem) => String(pem).replace(/-----[^-]+-----/g, '').replace(/\s/g, '')

/** المفتاح العام جوا البرنامج لازم يطابق مفتاحنا الخاص، وإلا السيريالات ما بتنقبل عند الزبون. */
function appKeyState() {
  if (!existsSync(KEY_FILE)) return 'none'
  if (!existsSync(PUBLIC_FILE)) return 'unknown'
  const m = /`(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`/.exec(readFileSync(PUBLIC_FILE, 'utf8'))
  if (!m) return 'unknown'
  return pemBody(m[1]) === pemBody(publicFromPrivate(readFileSync(KEY_FILE))) ? 'match' : 'mismatch'
}

function state() {
  const { rows, badLines } = readRows()
  return { dir: DIR, keyReady: existsSync(KEY_FILE), appKey: appKeyState(), rows, badLines, today: dateText(new Date()) }
}

// ───── الأفعال

class Refused extends Error {}

function clean(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
}

function expiryFrom(d, today) {
  if (d?.kind === 'forever') return null
  if (d?.kind === 'months' && [6, 12].includes(d.months)) return addMonths(today, d.months)
  if (d?.kind === 'until') {
    if (!isRealDate(String(d.date ?? ''))) throw new Refused('until_invalid')
    if (d.date < dateText(today)) throw new Refused('until_past')
    return d.date
  }
  throw new Refused('duration_invalid')
}

function issue(body) {
  if (!existsSync(KEY_FILE)) throw new Refused('no_key')
  const customer = clean(body.customer, 120)
  if (!customer) throw new Refused('customer_required')
  const device = normalizeDevice(body.device)
  if (!device) throw new Refused('device_invalid')
  const now = new Date()
  const expires = expiryFrom(body.duration, now)
  const row = {
    id: randomBytes(8).toString('hex'),
    customer,
    phone: clean(body.phone, 40),
    note: clean(body.note, 300),
    device,
    plan: 'full',
    expires,
    issuedAt: now.toISOString(),
    key: issueKey(readFileSync(KEY_FILE), { device, expires, plan: 'full' })
  }
  // بالسجل أول: ما في سيريال بيطلع من الأداة بدون ما ينكتب.
  appendFileSync(LOG_FILE, JSON.stringify(row) + '\n', { mode: 0o600 })
  return row
}

function issueReset(body) {
  if (!existsSync(KEY_FILE)) throw new Refused('no_key')
  const customer = clean(body.customer, 120)
  if (!customer) throw new Refused('customer_required')
  const device = normalizeDevice(body.device)
  if (!device) throw new Refused('device_invalid')
  const request = normalizeRequest(body.request)
  if (!request) throw new Refused('request_invalid')
  const now = new Date()
  const expires = addDays(now, 3)
  const row = {
    id: randomBytes(8).toString('hex'),
    kind: 'reset',
    customer,
    phone: '',
    note: '',
    device,
    request,
    expires,
    issuedAt: now.toISOString(),
    key: issueResetKey(readFileSync(KEY_FILE), { device, request, expires })
  }
  appendFileSync(LOG_FILE, JSON.stringify(row) + '\n', { mode: 0o600 })
  return row
}

function keygen() {
  if (existsSync(KEY_FILE)) throw new Refused('key_exists')
  mkdirSync(DIR, { recursive: true })
  // wx: ما بنكتب فوق مفتاح موجود مهما صار، لأن كل السيريالات مربوطة فيه.
  writeFileSync(KEY_FILE, generateKeys().privatePem, { mode: 0o600, flag: 'wx' })
}

function syncPublicKey() {
  if (!existsSync(KEY_FILE)) throw new Refused('no_key')
  if (!existsSync(PUBLIC_FILE)) throw new Refused('no_public_file')
  const pem = String(publicFromPrivate(readFileSync(KEY_FILE))).trim()
  const before = readFileSync(PUBLIC_FILE, 'utf8')
  const after = before.replace(/`-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----`/, `\`${pem}\``)
  if (after === before && appKeyState() !== 'match') throw new Refused('no_public_file')
  writeFileSync(PUBLIC_FILE, after)
}

const csvCell = (v) => {
  let s = String(v ?? '')
  // خلية بتبلش بهالأحرف Excel بيعاملها كمعادلة.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

function exportCsv() {
  const head = ['النوع', 'الزبون', 'التلفون', 'كود الجهاز', 'الانتهاء', 'تاريخ الإصدار', 'ملاحظة', 'السيريال']
  const lines = readRows().rows.map((r) => [r.kind === 'reset' ? 'استرجاع رمز' : 'ترخيص', r.customer, r.phone, r.device, r.expires ?? 'بدون انتهاء', String(r.issuedAt).slice(0, 10), r.note, r.key].map(csvCell).join(','))
  return '﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n'
}

// ───── السيرفر

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store'
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { ...SECURITY, 'Content-Type': type, ...extra })
  res.end(body)
}
const json = (res, status, value) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(value))

function readBody(req) {
  return new Promise((ok, no) => {
    let size = 0
    const parts = []
    req.on('data', (c) => {
      size += c.length
      if (size > 64 * 1024) {
        no(new Refused('too_large'))
        req.destroy()
      } else parts.push(c)
    })
    req.on('end', () => {
      try {
        ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'))
      } catch {
        no(new Refused('bad_json'))
      }
    })
    req.on('error', no)
  })
}

let port = 0

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, 'text/plain', 'forbidden')
    const url = new URL(req.url, `http://${host}`)

    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname]
      if (!existsSync(file)) return send(res, 404, 'text/plain', 'not found')
      return send(res, 200, type, readFileSync(file))
    }

    if (req.method === 'GET' && url.pathname === '/') {
      if (url.searchParams.get('t') !== TOKEN) return send(res, 403, 'text/plain; charset=utf-8', 'الرابط مش صحيح. استخدم الرابط اللي طبعته الأداة.')
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(HERE, 'license-admin/admin.html')))
    }

    if (req.method === 'GET' && url.pathname === '/api/export.csv') {
      if (url.searchParams.get('t') !== TOKEN) return send(res, 403, 'text/plain', 'forbidden')
      return send(res, 200, 'text/csv; charset=utf-8', exportCsv(), { 'Content-Disposition': `attachment; filename="nuqta-customers-${dateText(new Date())}.csv"` })
    }

    if (!url.pathname.startsWith('/api/')) return send(res, 404, 'text/plain', 'not found')
    if (req.headers['x-token'] !== TOKEN) return json(res, 403, { ok: false, error: 'forbidden' })

    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { ok: true, value: state() })

    if (req.method !== 'POST') return json(res, 404, { ok: false, error: 'not_found' })
    const origin = req.headers.origin
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return json(res, 403, { ok: false, error: 'forbidden' })
    if (!String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { ok: false, error: 'bad_type' })
    const body = await readBody(req)

    if (url.pathname === '/api/issue') return json(res, 200, { ok: true, value: issue(body) })
    if (url.pathname === '/api/issue-reset') return json(res, 200, { ok: true, value: issueReset(body) })
    if (url.pathname === '/api/keygen') {
      keygen()
      return json(res, 200, { ok: true, value: state() })
    }
    if (url.pathname === '/api/sync-public-key') {
      syncPublicKey()
      return json(res, 200, { ok: true, value: state() })
    }
    return json(res, 404, { ok: false, error: 'not_found' })
  } catch (e) {
    if (e instanceof Refused) return json(res, 200, { ok: false, error: e.message })
    console.error(e)
    if (!res.headersSent) json(res, 500, { ok: false, error: 'failed' })
  }
})

server.listen(Number(arg('--port') || 0), '127.0.0.1', () => {
  port = server.address().port
  const link = `http://127.0.0.1:${port}/?t=${TOKEN}`
  console.log('أداة إصدار التراخيص شغالة. خلي هالنافذة مفتوحة، وسكّرها بـCtrl+C لما تخلص.')
  console.log(`المجلد: ${DIR}`)
  console.log(link)
  if (!process.argv.includes('--no-open')) {
    if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '""', link], { windowsHide: true }, () => {})
    else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [link], () => {})
  }
})
