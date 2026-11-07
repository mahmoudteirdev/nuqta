import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { batchActions } from './actions/batch'
import { licenseActions } from './actions/license'
import { openDatabase } from './db/db'
import { Store } from './db/store'
import { base32Decode, base32Encode, checkKey, deviceCode, encodePayload, formatKey, licenseState, TRIAL_DAYS, type LicenseClaims } from './license'
import { LICENSE_PUBLIC_KEY } from './license-public-key'
import { MockRouter } from './router/mock'
import { RouterService } from './router/service'

let priv: KeyObject
let pub: string
let dir: string
const DEVICE = deviceCode('8f2a1c44-0b1d-4e7a-9c3e-1234567890ab')

const issue = (c: Partial<LicenseClaims> = {}, key = priv) => {
  const payload = encodePayload({ deviceCode: DEVICE, expires: null, plan: 'full', ...c })
  return formatKey(payload, sign(null, payload, key))
}

beforeAll(() => {
  const kp = generateKeyPairSync('ed25519')
  priv = kp.privateKey
  pub = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  dir = mkdtempSync(join(tmpdir(), 'nuqta-lic-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('encoding', () => {
  it('base32 round-trips, and decoding forgives case, dashes, spaces and O/I/L', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255, 128, 7])
    const s = base32Encode(bytes)
    expect(base32Decode(s)).toEqual(bytes)
    expect(base32Decode(s.toLowerCase().match(/.{1,3}/g)!.join(' - '))).toEqual(bytes)
    expect(base32Decode('0O1IL')).toEqual(base32Decode('00111'))
    expect(base32Decode('ÄÖ')).toBeNull()
  })

  it('the device code is stable for a machine and shaped NQ-XXXX-XXXX without 0 O 1 I L', () => {
    expect(deviceCode('ABC')).toBe(deviceCode(' abc '))
    expect(DEVICE).toMatch(/^NQ-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/)
    expect(deviceCode('other machine')).not.toBe(DEVICE)
  })
})

describe('checking a key', () => {
  it('a key signed for this device works offline, with or without an expiry', () => {
    expect(checkKey(issue(), DEVICE, pub, '2026-11-07')).toEqual({ ok: true, claims: { deviceCode: DEVICE, expires: null, plan: 'full' } })
    expect(checkKey(issue({ expires: '2027-11-07' }), DEVICE, pub, '2026-11-07').ok).toBe(true)
  })

  it.each([
    ['another device', () => checkKey(issue({ deviceCode: deviceCode('x') }), DEVICE, pub, '2026-11-07'), 'other_device'],
    ['past its expiry', () => checkKey(issue({ expires: '2026-11-06' }), DEVICE, pub, '2026-11-07'), 'expired'],
    ['signed by someone else', () => checkKey(issue({}, generateKeyPairSync('ed25519').privateKey), DEVICE, pub, '2026-11-07'), 'invalid'],
    ['one character changed', () => {
      const k = issue()
      const i = k.length - 8
      return checkKey(k.slice(0, i) + (k[i] === 'A' ? 'B' : 'A') + k.slice(i + 1), DEVICE, pub, '2026-11-07')
    }, 'invalid'],
    ['garbage', () => checkKey('XXXX-XXXX-XXXX', DEVICE, pub, '2026-11-07'), 'invalid']
  ])('refuses a key %s', (_n, run, reason) => {
    expect(run()).toEqual({ ok: false, reason })
  })

  it('the real vendor public key in the app is a valid Ed25519 key', () => {
    expect(checkKey(issue(), DEVICE, LICENSE_PUBLIC_KEY, '2026-11-07')).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('the vendor tool (scripts/license.mjs)', () => {
  const script = resolve(__dirname, '../../scripts/license.mjs')

  it('issues keys the app accepts, and refuses to overwrite an existing private key', () => {
    const out = execFileSync(process.execPath, [script, 'keygen', dir], { encoding: 'utf8' })
    const toolPub = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(out)![0]
    const key = execFileSync(process.execPath, [script, 'issue', '--key', join(dir, 'license-private.pem'), '--device', DEVICE, '--until', '2030-01-01'], { encoding: 'utf8' }).trim()
    expect(checkKey(key, DEVICE, toolPub, '2026-11-07')).toEqual({ ok: true, claims: { deviceCode: DEVICE, expires: '2030-01-01', plan: 'full' } })
    expect(() => execFileSync(process.execPath, [script, 'keygen', dir], { stdio: 'pipe' })).toThrow()
  })
})

describe('trial and activation', () => {
  const at = (days: number) => new Date(Date.parse('2026-11-01T09:00:00Z') + days * 86_400_000).toISOString()

  it(`${TRIAL_DAYS} days of full trial, then expired`, () => {
    const s = (d: number) => licenseState({ key: null, device: DEVICE, publicKeyPem: pub, installedAt: at(0), now: at(d) })
    expect(s(0)).toEqual({ state: 'trial', daysLeft: 14 })
    expect(s(13)).toEqual({ state: 'trial', daysLeft: 1 })
    expect(s(14)).toEqual({ state: 'expired' })
  })

  it('a saved key for another device (database copied to a new machine) does not count', () => {
    const s = licenseState({ key: issue(), device: deviceCode('new pc'), publicKeyPem: pub, installedAt: at(0), now: at(1) })
    expect(s.state).toBe('trial')
  })

  it('activation saves the key; after expiry only generating new batches stops', async () => {
    const r = openDatabase(':memory:')
    if (!r.ok) throw new Error()
    const store = new Store(r.db)
    let now = at(20)
    const lic = licenseActions({ store: () => store, device: DEVICE, installedAt: at(0), publicKeyPem: pub, now: () => now })
    expect(lic.info()).toEqual({ state: 'expired', deviceCode: DEVICE })

    store.addRouter({ name: 'R', host: 'h' })
    store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: shekels(1), saleAg: shekels(2) })
    const batches = batchActions({
      db: () => r.db, store: () => store, service: () => new RouterService(store, new MockRouter()), afterSend: () => {},
      print: async () => ({ ok: true }), canGenerate: () => lic.info().state !== 'expired'
    })
    const make = () => batches.createBatch({ routerId: 1, categoryId: 1, distributorId: null, count: 2 }, `b-${Math.random()}`)
    expect(await make()).toEqual({ ok: false, error: { code: 'license_required' } })
    // الحسابات شغالة: موزع وتسوية.
    expect(store.addDistributor({ name: 'محل', creditLimitAg: 0, openingAg: shekels(10) }, 'd').ok).toBe(true)

    expect(lic.activateLicense('')).toEqual({ ok: false, error: { code: 'license_empty' } })
    expect(lic.activateLicense('XXXX')).toEqual({ ok: false, error: { code: 'license_invalid' } })
    expect(lic.activateLicense(issue({ deviceCode: deviceCode('x') }))).toEqual({ ok: false, error: { code: 'license_other_device' } })
    expect(lic.activateLicense(issue().toLowerCase())).toEqual({ ok: true, value: { state: 'licensed', deviceCode: DEVICE, plan: 'full', expires: null } })
    expect((await make()).ok).toBe(true)

    // مفتاح بانتهاء: بعد تاريخه بيرجع البرنامج للوضع العادي (منتهي هون لأن التجربة خلصت من زمان).
    store.setSetting('license_key', issue({ expires: '2026-12-01' }))
    expect(lic.info().state).toBe('licensed')
    now = '2026-12-02T09:00:00.000Z'
    expect(lic.info().state).toBe('expired')
    r.db.close()
  })
})

