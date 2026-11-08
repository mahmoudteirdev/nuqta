import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkKey, deviceCode } from './license'

const SCRIPT = resolve(__dirname, '../../scripts/license-admin.mjs')
const DEVICE = deviceCode('admin-tool-test-device')
const TODAY = new Date().toISOString().slice(0, 10)

let dir: string
let publicFile: string
let child: ChildProcess
let base: string
let token: string

interface Row { id: string; customer: string; phone: string; note: string; device: string; expires: string | null; key: string }
interface State { dir: string; keyReady: boolean; appKey: string; rows: Row[]; badLines: number }
type Res<T> = { ok: true; value: T } | { ok: false; error: string }

function start(): Promise<void> {
  child = spawn(process.execPath, [SCRIPT, '--dir', dir, '--no-open', '--public-key-file', publicFile], { stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((ok, no) => {
    let out = ''
    child.stdout!.on('data', (c) => {
      out += String(c)
      const m = /(http:\/\/127\.0\.0\.1:\d+)\/\?t=([0-9a-f]+)/.exec(out)
      if (m) {
        base = m[1]!
        token = m[2]!
        ok()
      }
    })
    child.on('exit', (code) => no(new Error(`exited ${code}`)))
  })
}

function stop(): Promise<void> {
  return new Promise((ok) => {
    child.removeAllListeners('exit')
    child.on('exit', () => ok())
    child.kill()
  })
}

const post = async <T>(path: string, body: unknown): Promise<Res<T>> =>
  (await fetch(base + path, { method: 'POST', headers: { 'X-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<Res<T>>
const getState = async (): Promise<State> => {
  const r = (await (await fetch(`${base}/api/state`, { headers: { 'X-Token': token } })).json()) as Res<State>
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const issue = (body: Record<string, unknown>) => post<Row>('/api/issue', { customer: 'شبكة النور', device: DEVICE, duration: { kind: 'months', months: 12 }, ...body })
const value = <T>(r: Res<T>): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const appPublicKey = () => /`(-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)`/.exec(readFileSync(publicFile, 'utf8'))![1]!

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nuqta-admin-'))
  publicFile = join(dir, 'license-public-key.ts')
  copyFileSync(resolve(__dirname, 'license-public-key.ts'), publicFile)
  await start()
})
afterAll(async () => {
  await stop()
  rmSync(dir, { recursive: true, force: true })
})

describe('who can reach the tool', () => {
  it('refuses a missing token on the page, the API and the export', async () => {
    expect((await fetch(`${base}/`)).status).toBe(403)
    expect((await fetch(`${base}/?t=wrong`)).status).toBe(403)
    expect((await fetch(`${base}/api/state`)).status).toBe(403)
    expect((await fetch(`${base}/api/export.csv`)).status).toBe(403)
    expect((await fetch(`${base}/?t=${token}`)).status).toBe(200)
  })

  it('refuses another site: a foreign Host, a foreign Origin, or a form post', async () => {
    const status = await new Promise<number>((ok, no) => {
      const u = new URL(base)
      const r = request({ host: u.hostname, port: u.port, path: `/?t=${token}`, headers: { Host: 'evil.example' } }, (res) => { res.resume(); ok(res.statusCode!) })
      r.on('error', no)
      r.end()
    })
    expect(status).toBe(403)
    const bad = (headers: Record<string, string>) => fetch(`${base}/api/issue`, { method: 'POST', headers: { 'X-Token': token, ...headers }, body: '{}' })
    expect((await bad({ 'Content-Type': 'application/json', Origin: 'https://evil.example' })).status).toBe(403)
    expect((await bad({ 'Content-Type': 'text/plain' })).status).toBe(415)
  })

  it('will not keep the key or customer names inside the project', () => {
    const inProject = resolve(__dirname, '../../license-keys-test')
    expect(() => execFileSync(process.execPath, [SCRIPT, '--dir', inProject, '--no-open'], { stdio: 'pipe' })).toThrow()
    expect(existsSync(inProject)).toBe(false)
  })
})

describe('issuing', () => {
  it('asks for a key first, then makes one and never overwrites it', async () => {
    expect(await getState()).toMatchObject({ keyReady: false, appKey: 'none', rows: [] })
    expect(await issue({})).toEqual({ ok: false, error: 'no_key' })
    expect(value(await post<State>('/api/keygen', {}))).toMatchObject({ keyReady: true, appKey: 'mismatch' })
    const pem = readFileSync(join(dir, 'license-private.pem'), 'utf8')
    expect(await post('/api/keygen', {})).toEqual({ ok: false, error: 'key_exists' })
    expect(readFileSync(join(dir, 'license-private.pem'), 'utf8')).toBe(pem)
    const page = JSON.stringify(await getState())
    expect(page).not.toContain(pem.split('\n')[1])
  })

  it('updates the app public key only when asked, and the app then accepts the keys', async () => {
    expect(value(await post<State>('/api/sync-public-key', {})).appKey).toBe('match')
    const r = value(await issue({ phone: ' 059 123 ', note: 'دفع نقدي' }))
    expect(r).toMatchObject({ customer: 'شبكة النور', phone: '059 123', note: 'دفع نقدي', device: DEVICE })
    expect(r.expires! > TODAY).toBe(true)
    const check = checkKey(r.key, DEVICE, appPublicKey(), TODAY)
    expect(check).toEqual({ ok: true, claims: { deviceCode: DEVICE, expires: r.expires, plan: 'full' } })
    expect(checkKey(r.key, deviceCode('another-device'), appPublicKey(), TODAY)).toEqual({ ok: false, reason: 'other_device' })
    expect(checkKey(r.key, DEVICE, appPublicKey(), '2999-01-01')).toEqual({ ok: false, reason: 'expired' })
  })

  it('takes a code typed loosely, with an exact date or no end', async () => {
    const loose = value(await issue({ device: ` ${DEVICE.replace(/-/g, '').toLowerCase()} `, duration: { kind: 'until', date: '2099-02-28' } }))
    expect(loose).toMatchObject({ device: DEVICE, expires: '2099-02-28' })
    const forever = value(await issue({ duration: { kind: 'forever' } }))
    expect(forever.expires).toBeNull()
    expect(checkKey(forever.key, DEVICE, appPublicKey(), '2999-01-01').ok).toBe(true)
  })

  it('refuses what would make a useless key, and logs nothing for it', async () => {
    const before = (await getState()).rows.length
    expect(await issue({ customer: '   ' })).toEqual({ ok: false, error: 'customer_required' })
    for (const device of ['', 'NQ-1234-5678', 'NQ-OOOO-LLLL', 'XX-ABCD-EFGH', `${DEVICE}A`]) expect(await issue({ device })).toEqual({ ok: false, error: 'device_invalid' })
    expect(await issue({ duration: { kind: 'until', date: '2020-01-01' } })).toEqual({ ok: false, error: 'until_past' })
    expect(await issue({ duration: { kind: 'until', date: '2099-02-31' } })).toEqual({ ok: false, error: 'until_invalid' })
    expect(await issue({ duration: { kind: 'months', months: 999 } })).toEqual({ ok: false, error: 'duration_invalid' })
    expect((await getState()).rows).toHaveLength(before)
  })
})

describe('the customer list', () => {
  it('survives a restart and reports unreadable lines instead of losing the rest', async () => {
    const before = (await getState()).rows
    await stop()
    writeFileSync(join(dir, 'licenses.jsonl'), readFileSync(join(dir, 'licenses.jsonl'), 'utf8') + 'not json\n')
    await start()
    const after = await getState()
    expect(after.rows).toEqual(before)
    expect(after.badLines).toBe(1)
  })

  it('exports for Excel: Arabic stays readable and a cell cannot run as a formula', async () => {
    value(await issue({ customer: '=HYPERLINK("x")', phone: '+970599' }))
    const r = await fetch(`${base}/api/export.csv?t=${token}`)
    const bytes = new Uint8Array(await r.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('"الزبون"')
    expect(text).toContain(`"'=HYPERLINK(""x"")"`)
    expect(text).toContain(`"'+970599"`)
  })
})
