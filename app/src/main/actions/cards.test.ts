import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { seedDemo } from '../dev/seed'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import { batchActions } from './batch'
import { cardsActions } from './cards'

let db: Db
let store: Store
let router: MockRouter
let api: ReturnType<typeof cardsActions>
let batches: ReturnType<typeof batchActions>

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  seedDemo(db, new Date(2026, 10, 6, 14, 0))
  store = new Store(db)
  router = new MockRouter()
  const service = new RouterService(store, router)
  const print = async () => ({ ok: true }) as const
  api = cardsActions({ db: () => db, store: () => store, service: () => service, print })
  batches = batchActions({ db: () => db, store: () => store, service: () => service, afterSend: () => {}, print })
})
afterEach(() => db.close())

function ok<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  return r.value
}

describe('batch log', () => {
  it('newest first, with usage, pending and print counts', () => {
    const log = api.batchLog()
    expect(log.map((b) => b.no)).toEqual([1006, 1005, 1004, 1003, 1002, 1001])
    const yousef2 = log.find((b) => b.no === 1005)!
    expect(yousef2).toMatchObject({ distributorName: 'محل يوسف', categoryName: '3 ساعات', count: 300, used: 285, printedTimes: 1, printable: true, pending: 0 })
    expect(log.find((b) => b.no === 1006)!.distributorName).toBeNull()
  })

  it('a reprint uses the same codes and is counted every time', async () => {
    const before = db.all<{ code: string }>('SELECT code FROM cards WHERE batch_id = 1 ORDER BY code').map((r) => r.code)
    expect(ok(await api.reprintBatch(1))).toEqual({ printedTimes: 2 })
    expect(ok(await api.reprintBatch(1))).toEqual({ printedTimes: 3 })
    expect(db.all<{ code: string }>('SELECT code FROM cards WHERE batch_id = 1 ORDER BY code').map((r) => r.code)).toEqual(before)
    expect(api.batchLog().find((b) => b.id === 1)!.printedTimes).toBe(3)
  })

  it('a batch the router never confirmed cannot be reprinted, and shows as pending', async () => {
    router.up = false
    const sent = ok(await batches.createBatch({ routerId: 1, categoryId: 2, distributorId: null, count: 5 }, 'x1'))
    const row = api.batchLog()[0]!
    expect(row).toMatchObject({ id: sent.view.id, pending: 5, printable: false, stage: 'sent' })
    expect(await api.reprintBatch(sent.view.id)).toEqual({ ok: false, error: { code: 'nothing_to_print' } })
  })
})

describe('categories and prices', () => {
  it('lists categories with their router profile and prices', () => {
    expect(api.categories().map((c) => [c.name, c.routerProfile, c.wholeAg / 100, c.saleAg / 100])).toEqual([
      ['ساعة', '1h', 1, 2], ['3 ساعات', '3h', 2, 3], ['يوم كامل', 'day', 4, 5], ['أسبوع', 'week', 15, 20]
    ])
  })

  it('a new price affects new batches only (acceptance test 2), and selling below wholesale only warns', () => {
    const oldCharges = db.all<{ c: number }>('SELECT charge_ag c FROM ledger ORDER BY id').map((r) => r.c)
    expect(ok(api.setCategoryPrices(2, shekels(3), shekels(2)))).toEqual({ saleBelowWhole: true })
    expect(db.all<{ c: number }>('SELECT charge_ag c FROM ledger ORDER BY id').map((r) => r.c)).toEqual(oldCharges)
    expect(db.get<{ w: number }>('SELECT whole_ag w FROM batches WHERE no = 1005')!.w).toBe(shekels(2))
    expect(api.setCategoryPrices(2, 0, shekels(2))).toEqual({ ok: false, error: { code: 'amount_invalid' } })
  })

  it('adds a category with sale price starting at wholesale', () => {
    const { id } = ok(api.addCategory({ name: ' شهر ', routerProfile: 'month', wholeAg: shekels(40) }))
    expect(api.categories().find((c) => c.id === id)).toEqual({ id, name: 'شهر', routerProfile: 'month', wholeAg: shekels(40), saleAg: shekels(40) })
    expect(api.addCategory({ name: '', routerProfile: 'x', wholeAg: 100 })).toEqual({ ok: false, error: { code: 'category_name' } })
    expect(api.addCategory({ name: 'x', routerProfile: 'x', wholeAg: 0 })).toEqual({ ok: false, error: { code: 'category_whole' } })
    expect(api.addCategory({ name: 'x', routerProfile: ' ', wholeAg: 100 })).toEqual({ ok: false, error: { code: 'category_profile' } })
  })

  it('updates and deletes or archives a category', () => {
    const { id } = ok(api.addCategory({ name: 'تجربة', routerProfile: 'trial', wholeAg: shekels(5) }))
    ok(api.updateCategory(id, { name: 'تجربة معدلة', routerProfile: 'trial-2' }))
    expect(api.categories().find((c) => c.id === id)).toMatchObject({ name: 'تجربة معدلة', routerProfile: 'trial-2' })

    // حذف فئة ما عليها دفعات
    ok(api.deleteCategory(id))
    expect(api.categories().find((c) => c.id === id)).toBeUndefined()

    // أرشفة فئة عليها دفعات سابقة
    ok(api.deleteCategory(1))
    expect(api.categories().find((c) => c.id === 1)).toBeUndefined()
  })

  it('reads hotspot profiles from the router, or null when it is down', async () => {
    expect(await api.routerProfiles()).toEqual(['1h', '3h', 'day', 'week'])
    router.up = false
    expect(await api.routerProfiles()).toBeNull()
  })
})

describe('print templates', () => {
  it('defaults, saves, and the saved template is what printing records', async () => {
    expect(api.templateSettings()).toEqual({ template: 'a4-12', networkName: 'شبكة النور', showPrice: true, phone: '', bgImage: null })
    ok(api.saveTemplateSettings({ template: 'thermal', networkName: ' نت الحارة ', showPrice: false, phone: '' }))
    expect(api.templateSettings()).toEqual({ template: 'thermal', networkName: 'نت الحارة', showPrice: false, phone: '', bgImage: null })
    expect(api.saveTemplateSettings({ template: 'thermal', networkName: '  ', showPrice: true, phone: '' })).toEqual({ ok: false, error: { code: 'network_name' } })

    ok(await api.reprintBatch(1))
    expect(db.get<{ t: string }>('SELECT template t FROM print_log ORDER BY id DESC LIMIT 1')!.t).toBe('thermal')
    expect(batches.batchForm().template).toBe('thermal')
  })
})
