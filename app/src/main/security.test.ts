import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { licenseActions, pinResetActions } from './actions/license'
import { Auth, hashPin } from './auth'
import { listBackups, makeBackup } from './backup'
import { openDatabase, type Db } from './db/db'
import { MIGRATIONS } from './db/schema'
import { Store } from './db/store'
import { allowDevEnv, devEnv, lockDevEnv } from './dev-env'
import { checkKey, deviceCode, formatKey } from './license'
import { installedAt, machineId } from './machine'

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'nuqta-sec-')) })
afterAll(() => {
  lockDevEnv()
  rmSync(dir, { recursive: true, force: true })
})

describe('development settings', () => {
  afterEach(() => {
    lockDevEnv()
    delete process.env['NUQTA_MACHINE_ID']
    delete process.env['NUQTA_INSTALLED_AT']
  })

  it('are ignored until the app opens them, so a packaged build cannot be steered', () => {
    process.env['NUQTA_MACHINE_ID'] = 'someone-elses-machine'
    process.env['NUQTA_INSTALLED_AT'] = '2099-01-01T00:00:00.000Z'
    expect(devEnv('NUQTA_MACHINE_ID')).toBeUndefined()
    expect(machineId(dir)).not.toBe('someone-elses-machine')
    expect(installedAt(dir)).not.toBe('2099-01-01T00:00:00.000Z')
    allowDevEnv()
    expect(machineId(dir)).toBe('someone-elses-machine')
    expect(installedAt(dir)).toBe('2099-01-01T00:00:00.000Z')
  })

  it('are only ever read through devEnv', () => {
    const src = resolve(__dirname)
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('dev-env.ts'))
    expect(files.length).toBeGreaterThan(10)
    const offenders = files.filter((f) => /process\.env/.test(readFileSync(join(src, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('wrong PIN count', () => {
  let db: Db
  let t: number
  const fresh = () => new Auth(() => db, () => t)
  beforeEach(() => {
    const r = openDatabase(':memory:')
    if (!r.ok) throw new Error(r.detail)
    db = r.db
    t = 1_000_000
    db.run('INSERT INTO users(name, role, created_at, pin_hash) VALUES (?, ?, ?, ?)', 'سامي', 'technician', 'now', hashPin('5678'))
  })
  afterEach(() => db.close())

  it('survives closing and reopening the app', () => {
    let auth = fresh()
    for (let i = 0; i < 3; i++) expect(auth.login(1, '0000')).toBe('pin_wrong')
    auth = fresh()
    expect(auth.login(1, '0000')).toBe('pin_wrong')
    auth = fresh()
    expect(auth.login(1, '0000')).toBe('locked')
    auth = fresh()
    expect(auth.login(1, '5678')).toBe('locked')
    expect(auth.lockedFor(1)).toBe(30)
    t += 31_000
    // الجولة الثانية بتطول، حتى بعد إعادة التشغيل.
    auth = fresh()
    for (let i = 0; i < 4; i++) expect(auth.login(1, '0000')).toBe('pin_wrong')
    expect(auth.login(1, '0000')).toBe('locked')
    expect(fresh().lockedFor(1)).toBe(60)
  })

  it('clears after a successful sign-in', () => {
    const auth = fresh()
    for (let i = 0; i < 4; i++) auth.login(1, '0000')
    expect(auth.login(1, '5678')).toBeNull()
    expect(db.get('SELECT pin_fails, pin_rounds, pin_locked_until FROM users WHERE id = 1')).toEqual({ pin_fails: 0, pin_rounds: 0, pin_locked_until: 0 })
  })
})

describe('backup before a database upgrade', () => {
  const oldDb = (name: string, version: number) => {
    const path = join(dir, name)
    const raw = new DatabaseSync(path)
    for (let v = 0; v < version; v++) raw.exec(MIGRATIONS[v]!)
    raw.exec(`PRAGMA user_version = ${version}`)
    raw.exec("INSERT INTO settings(key, value) VALUES ('network_name', 'شبكة قديمة')")
    raw.close()
    return path
  }

  it('keeps a copy of the old version, data included, and a later prune leaves it', () => {
    const backups = join(dir, 'up-backups')
    const path = oldDb('up.db', MIGRATIONS.length - 1)
    const r = openDatabase(path, (old) => { makeBackup(old, backups, 'before-update') })
    if (!r.ok) throw new Error(r.detail)
    expect(r.version).toBe(MIGRATIONS.length)
    r.db.close()
    const made = listBackups(backups)
    expect(made.map((b) => b.kind)).toEqual(['before-update'])
    const copy = new DatabaseSync(join(backups, made[0]!.file), { readOnly: true })
    expect(copy.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length - 1 })
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'network_name'").get()).toEqual({ value: 'شبكة قديمة' })
    copy.close()
  })

  it('does nothing for a new database or one already up to date', () => {
    let calls = 0
    const count = () => { calls++ }
    const path = join(dir, 'new.db')
    const a = openDatabase(path, count)
    if (!a.ok) throw new Error(a.detail)
    a.db.close()
    const b = openDatabase(path, count)
    if (!b.ok) throw new Error(b.detail)
    b.db.close()
    expect(calls).toBe(0)
  })
})

describe('owner PIN recovery', () => {
  const DEVICE = deviceCode('recovery-test-device')
  const OTHER = deviceCode('another-device')
  const TODAY = '2026-11-08'
  const kp = generateKeyPairSync('ed25519')
  const pub = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const signed = (text: string, key = kp.privateKey) => {
    const payload = new TextEncoder().encode(text)
    return formatKey(payload, sign(null, payload, key))
  }

  let db: Db
  let auth: Auth
  let store: Store
  let api: ReturnType<typeof pinResetActions>
  beforeEach(() => {
    const r = openDatabase(':memory:')
    if (!r.ok) throw new Error(r.detail)
    db = r.db
    store = new Store(db)
    db.run('INSERT INTO users(name, role, created_at, pin_hash) VALUES (?, ?, ?, ?)', 'صاحب الشبكة', 'owner', 'now', hashPin('1234'))
    db.run('INSERT INTO users(name, role, created_at, pin_hash) VALUES (?, ?, ?, ?)', 'سامي', 'technician', 'now', hashPin('5678'))
    auth = new Auth(() => db)
    api = pinResetActions({ store: () => store, device: DEVICE, publicKeyPem: pub, resetOwnerPin: (p) => auth.resetOwnerPin(p), now: () => `${TODAY}T10:00:00.000Z` })
  })
  afterEach(() => db.close())

  const keyFor = (request: string, device = DEVICE, expires = '2026-11-11') => signed(`NQR1|${device}|${request}|${expires}`)

  it('a signed key changes the owner PIN, signs them in and clears a lockout', () => {
    for (let i = 0; i < 5; i++) auth.login(1, '0000')
    expect(auth.lockedFor(1)).toBeGreaterThan(0)
    const { deviceCode: code, requestCode } = api.pinResetRequest()
    expect(code).toBe(DEVICE)
    expect(requestCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/)
    expect(api.pinResetRequest().requestCode).toBe(requestCode)
    expect(api.pinResetApply(keyFor(requestCode), '٤٣٢١')).toEqual({ ok: true, value: undefined })
    expect(auth.current).toMatchObject({ id: 1, role: 'owner' })
    auth.logout()
    expect(auth.login(1, '1234')).toBe('pin_wrong')
    expect(auth.login(1, '4321')).toBeNull()
    expect(auth.login(2, '5678')).toBeNull()
  })

  it('works once: the same key is refused afterwards, and a new request differs', () => {
    const { requestCode } = api.pinResetRequest()
    const key = keyFor(requestCode)
    expect(api.pinResetApply(key, '4321').ok).toBe(true)
    auth.logout()
    expect(api.pinResetApply(key, '9999')).toEqual({ ok: false, error: { code: 'reset_wrong_request' } })
    expect(api.pinResetRequest().requestCode).not.toBe(requestCode)
    expect(api.pinResetApply(key, '9999')).toEqual({ ok: false, error: { code: 'reset_wrong_request' } })
    expect(auth.login(1, '4321')).toBeNull()
  })

  it('refuses a key that is forged, for another device or request, or expired', () => {
    const { requestCode } = api.pinResetRequest()
    const expectRefused = (key: string, code: string) => {
      expect(api.pinResetApply(key, '4321')).toEqual({ ok: false, error: { code } })
      expect(auth.current).toBeNull()
    }
    expectRefused(signed(`NQR1|${DEVICE}|${requestCode}|2026-11-11`, generateKeyPairSync('ed25519').privateKey), 'reset_invalid')
    expectRefused('not-a-key', 'reset_invalid')
    expectRefused(keyFor(requestCode, OTHER), 'reset_other_device')
    expectRefused(keyFor('AAAAAAAA'), 'reset_wrong_request')
    expectRefused(keyFor(requestCode, DEVICE, '2026-11-07'), 'reset_expired')
    expect(auth.login(1, '1234')).toBeNull()
  })

  it('a bad new PIN does not use the key up', () => {
    const { requestCode } = api.pinResetRequest()
    const key = keyFor(requestCode)
    expect(api.pinResetApply(key, '12')).toEqual({ ok: false, error: { code: 'auth_pin_format' } })
    expect(api.pinResetApply(key, '4321').ok).toBe(true)
  })

  it('a license key cannot reset a PIN, and a reset key cannot activate the app', () => {
    const { requestCode } = api.pinResetRequest()
    const license = signed(`NQ1|${DEVICE}|-|full`)
    expect(checkKey(license, DEVICE, pub, TODAY).ok).toBe(true)
    expect(api.pinResetApply(license, '4321')).toEqual({ ok: false, error: { code: 'reset_invalid' } })
    const reset = keyFor(requestCode)
    expect(checkKey(reset, DEVICE, pub, TODAY)).toEqual({ ok: false, reason: 'invalid' })
    const lic = licenseActions({ store: () => store, device: DEVICE, installedAt: `${TODAY}T00:00:00.000Z`, publicKeyPem: pub, now: () => `${TODAY}T10:00:00.000Z` })
    expect(lic.activateLicense(reset)).toEqual({ ok: false, error: { code: 'license_invalid' } })
  })

  it('accepts what the command line tool issues', () => {
    const pemDir = join(dir, 'cli')
    const script = resolve(__dirname, '../../scripts/license.mjs')
    execFileSync(process.execPath, [script, 'keygen', pemDir], { encoding: 'utf8' })
    const pemPath = join(pemDir, 'license-private.pem')
    const appPub = generatedPublic(pemPath)
    const real = pinResetActions({ store: () => store, device: DEVICE, publicKeyPem: appPub, resetOwnerPin: (p) => auth.resetOwnerPin(p) })
    const { requestCode } = real.pinResetRequest()
    const key = execFileSync(process.execPath, [script, 'reset', '--key', pemPath, '--device', DEVICE, '--request', requestCode.toLowerCase()], { encoding: 'utf8' }).trim()
    expect(real.pinResetApply(key, '4321')).toEqual({ ok: true, value: undefined })
    expect(() => execFileSync(process.execPath, [script, 'reset', '--key', pemPath, '--device', DEVICE, '--request', 'short'], { stdio: 'pipe' })).toThrow()
  })
})

function generatedPublic(pemPath: string): string {
  const script = `import('${resolve(__dirname, '../../scripts/license-lib.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:')}').then(async (m) => { const fs = await import('node:fs'); process.stdout.write(String(m.publicFromPrivate(fs.readFileSync(process.argv[1])))) })`
  return execFileSync(process.execPath, ['-e', script, pemPath], { encoding: 'utf8' })
}
