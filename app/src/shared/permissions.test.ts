import { describe, expect, it } from 'vitest'
import { allowed, OWNER_SCREENS, PERMISSIONS, type AccessContext } from './permissions'

const ctx = (c: Partial<AccessContext>): AccessContext => ({ role: null, setupOpen: false, dbBroken: false, dev: false, ...c })
const methods = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]
const where = (p: string) => methods.filter((m) => PERMISSIONS[m] === p)

describe('permissions', () => {
  it('locked: only the login door, status and the print window', () => {
    expect(methods.filter((m) => allowed(m, ctx({})))).toEqual(where('public'))
    expect(where('public').sort()).toEqual(['createOwnerPin', 'login', 'pinResetApply', 'pinResetRequest', 'printJob', 'printReady', 'status'])
  })

  it('technician: day work yes, money and settings no', () => {
    const tech = ctx({ role: 'technician' })
    for (const m of ['createBatch', 'printBatch', 'deliverBatch', 'checkCard', 'kickSession', 'network', 'logout'] as const) expect(allowed(m, tech)).toBe(true)
    for (const m of where('owner')) expect(allowed(m, tech)).toBe(false)
    for (const m of ['account', 'settle', 'correctSettlement', 'reports', 'addUser', 'setUserPin', 'restoreBackup', 'activateLicense', 'importCommit', 'setCategoryPrices'] as const) expect(allowed(m, tech)).toBe(false)
    expect(allowed('devSetRouter', tech)).toBe(false)
  })

  it('owner: everything except dev tools outside dev', () => {
    const owner = ctx({ role: 'owner' })
    expect(methods.filter((m) => !allowed(m, owner))).toEqual(['devSetRouter'])
    expect(allowed('devSetRouter', ctx({ role: 'owner', dev: true }))).toBe(true)
  })

  it('first-run setup is open before any PIN exists, then closes', () => {
    expect(allowed('connectRouter', ctx({ setupOpen: true }))).toBe(true)
    expect(allowed('connectRouter', ctx({}))).toBe(false)
    expect(allowed('connectRouter', ctx({ role: 'technician' }))).toBe(false)
    expect(allowed('settle', ctx({ setupOpen: true }))).toBe(false)
  })

  it('a broken database can be restored without signing in', () => {
    expect(allowed('restoreBackup', ctx({ dbBroken: true }))).toBe(true)
    expect(allowed('backups', ctx({ dbBroken: true }))).toBe(true)
    expect(allowed('restoreBackup', ctx({ role: 'technician' }))).toBe(false)
  })

  it('owner-only screens are the money and settings ones', () => {
    expect([...OWNER_SCREENS].sort()).toEqual(['account', 'reports', 'settings'])
  })
})
