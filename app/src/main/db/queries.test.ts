import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { seedDemo } from '../dev/seed'
import { openDatabase, type Db } from './db'
import { homeData, localDay } from './queries'
import { Store } from './store'

let db: Db
let store: Store
const now = new Date(2026, 10, 6, 14, 0)

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  seedDemo(db, now)
  store = new Store(db, () => now.toISOString())
})
afterEach(() => db.close())

describe('home data on the demo seed', () => {
  it('totals: usage today at wholesale (direct sale at sale price), owed ignores credit', () => {
    const h = homeData(db, store, { now: now.toISOString(), routerUp: true })
    // يوسف 138×2، أبو خالد 90×2، الأمل 24×2، بيع مباشر 50×2 (سعر بيع الساعة).
    expect(h.usageToday.map((u) => [u.name, u.valueAg])).toEqual([
      ['محل يوسف', shekels(276)], ['سوبرماركت أبو خالد', shekels(180)], [null, shekels(100)], ['مكتبة الأمل', shekels(48)]
    ])
    expect(h.usedTodayAg).toBe(shekels(604))
    expect(h.owedTotalAg).toBe(shekels(1320 + 1160 + 620 + 588))
    expect(h.collectedTodayAg).toBe(0)
  })

  it('tasks in priority order: collections by amount after 7 days, then low stock', () => {
    const h = homeData(db, store, { now: now.toISOString(), routerUp: true })
    expect(h.tasks).toEqual([
      { kind: 'collect', distributorId: expect.any(String), name: 'محل يوسف', owedAg: shekels(1320), days: 9 },
      { kind: 'collect', distributorId: expect.any(String), name: 'كشك الميناء', owedAg: shekels(620), days: 22 },
      { kind: 'stock', distributorId: expect.any(String), name: 'مكتبة الأمل', held: 6, categoryName: '3 ساعات' }
    ])
  })

  it('router down goes first; a pending batch and an open dispute show up', () => {
    const port = store.distributors().find((d) => d.name === 'كشك الميناء')!
    must(store.openDispute(port.id, '', 'k1'))
    const { batch, codes } = must(store.createBatch({ categoryId: 1, routerId: 1, distributorId: port.id, count: 10 }, 'k2'))
    must(store.applySendResult(batch.id, codes.slice(0, 7)))
    const kinds = homeData(db, store, { now: now.toISOString(), routerUp: false }).tasks.map((t) => t.kind)
    expect(kinds).toEqual(['router', 'pending', 'collect', 'collect', 'stock', 'dispute'])
  })

  it('settling today moves money into «collected today» and clears the task', () => {
    const y = store.distributors().find((d) => d.name === 'محل يوسف')!
    must(store.settle(y.id, shekels(1000), 'k3'))
    const h = homeData(db, store, { now: now.toISOString(), routerUp: true })
    expect(h.collectedTodayAg).toBe(shekels(1000))
    expect(h.tasks.some((t) => t.kind === 'collect' && t.name === 'محل يوسف')).toBe(false)
  })

  it('counts calendar days, not 24-hour blocks', () => {
    expect(localDay(new Date(2026, 10, 6, 0, 5).toISOString()) - localDay(new Date(2026, 10, 5, 23, 55).toISOString())).toBe(1)
  })
})

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  return r.value
}
