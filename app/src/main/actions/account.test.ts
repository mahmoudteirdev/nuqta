import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Backend } from '@shared/api'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { seedDemo } from '../dev/seed'
import { accountActions } from './account'

let db: Db
let store: Store
let api: ReturnType<typeof accountActions>
let changes = 0
const NOW = new Date(2026, 10, 6, 14, 0)

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  seedDemo(db, NOW)
  store = new Store(db)
  changes = 0
  api = accountActions({ db: () => db, store: () => store, routerUp: () => true, afterChange: () => { changes++ }, now: () => NOW.toISOString() })
})
afterEach(() => db.close())

const idOf = (name: string) => store.distributors().find((d) => d.name === name)!.id
const ok = <T>(r: ReturnType<Backend['settle']> | { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify((r as { error: unknown }).error))
  return (r as { value: T }).value
}

describe('account screen data', () => {
  it('lists distributors by amount owed and opens the top one by default', () => {
    const a = api.account(null)
    expect(a.distributors.map((d) => d.name)).toEqual(['محل يوسف', 'سوبرماركت أبو خالد', 'كشك الميناء', 'مكتبة الأمل'])
    expect(a.current).toMatchObject({ name: 'محل يوسف', held: 90, owedAg: shekels(1320), paidAg: shekels(300), usedValueAg: shekels(1620), openDispute: false })
  })

  it('the statement is newest first with a running balance, like the prototype', () => {
    const e = api.account(idOf('محل يوسف')).current!.entries
    expect(e.map((x) => [x.type, x.cardsDelta, x.balanceAg / 100])).toEqual([
      ['usage', -138, 1320], ['usage', -147, 1044], ['delivery', 300, 750], ['settlement', 0, 750], ['usage', -525, 1050], ['delivery', 600, 0], ['opening', 0, 0]
    ])
    expect(e.find((x) => x.type === 'delivery')!.batchNo).toBeGreaterThan(1000)
  })

  it('«شوف الكروت» lists the exact cards behind a usage line', () => {
    const usage = api.account(idOf('محل يوسف')).current!.entries[0]!
    const r = api.usageCards(usage.id)
    expect(r.total).toBe(138)
    expect(r.cards).toHaveLength(50)
  })
})

describe('settling', () => {
  it('asks before taking more than owed, without saving anything', () => {
    const id = idOf('كشك الميناء')
    const r = ok<{ kind: string }>(api.settle(id, shekels(700), false, 'k1'))
    expect(r).toEqual({ kind: 'confirm', paidAg: shekels(700), dueAg: shekels(620), extraAg: shekels(80) })
    expect(api.account(id).current!.owedAg).toBe(shekels(620))
    expect(ok(api.settle(id, shekels(700), true, 'k1'))).toMatchObject({ kind: 'saved', extraAg: shekels(80), remainingAg: 0 })
    expect(api.account(id).current!.owedAg).toBe(shekels(-80))
  })

  it('a repeated request returns the same numbers and records once', () => {
    const id = idOf('محل يوسف')
    const a = ok(api.settle(id, shekels(1000), false, 'k2'))
    const b = ok(api.settle(id, shekels(1000), false, 'k2'))
    expect(b).toEqual(a)
    expect(a).toMatchObject({ kind: 'saved', paidAg: shekels(1000), extraAg: 0, remainingAg: shekels(320) })
    expect(api.account(id).current!.entries.filter((e) => e.type === 'settlement')).toHaveLength(2)
  })

  it('the last settlement can be corrected once; then the button has nothing to do', () => {
    const id = idOf('محل يوسف')
    ok(api.settle(id, shekels(500), false, 'k3'))
    const target = api.account(id).current!.correctable!
    expect(target.paidAg).toBe(shekels(500))
    ok(api.correctSettlement(id, target.id, 'k4'))
    const after = api.account(id).current!
    expect(after.correctable).toBeNull()
    expect(after.owedAg).toBe(shekels(1320))
    expect(after.entries[0]).toMatchObject({ type: 'correction', refType: 'settlement', paidAg: shekels(-500) })
    expect(after.entries[1]!.corrected).toBe(true)
    // التسوية الملغية ما بتنحسب «آخر تسوية»، فمهمة التحصيل بتضل.
    expect(after.daysSinceSettlement).toBe(9)
  })
})

describe('other actions', () => {
  it('returns by code, queues the router job and reports the count', () => {
    const id = idOf('مكتبة الأمل')
    const codes = db.all<{ code: string }>(
      "SELECT c.code FROM cards c JOIN batches b ON b.id = c.batch_id WHERE b.distributor_id = ? AND c.status = 'delivered' LIMIT 3", Number(id)
    ).map((r) => r.code)
    expect(ok(api.returnCards(id, codes, 'k5'))).toEqual({ count: 3, routerUp: true })
    expect(api.account(id).current!.held).toBe(3)
    expect(changes).toBe(1)
    expect(api.returnCards(id, ['ZZZZ-ZZZZ'], 'k6')).toEqual({ ok: false, error: { code: 'not_held', codes: ['ZZZZ-ZZZZ'] } })
  })

  it('adds a distributor with the default limit and an opening balance', () => {
    const r = ok<{ id: string }>(api.addDistributor({ name: ' محل جديد ', area: '', openingAg: shekels(250) }, 'k7'))
    expect(api.account(r.id).current).toMatchObject({ name: 'محل جديد', creditLimitAg: shekels(1000), owedAg: shekels(250), usedValueAg: 0 })
    expect(api.addDistributor({ name: '  ', area: '', openingAg: 0 }, 'k8')).toEqual({ ok: false, error: { code: 'name_required' } })
  })

  it('disputes and the credit limit', () => {
    const id = idOf('محل يوسف')
    ok(api.openDispute(id, 'كروت ما اشتغلت', 'k9'))
    expect(api.account(id).current!.openDispute).toBe(true)
    ok(api.closeDispute(id, 'k10'))
    expect(api.account(id).current!.openDispute).toBe(false)
    expect(api.setCreditLimit(id, 0)).toEqual({ ok: false, error: { code: 'amount_invalid' } })
    ok(api.setCreditLimit(id, shekels(2000)))
    expect(api.account(id).current!.creditLimitAg).toBe(shekels(2000))
  })
})
