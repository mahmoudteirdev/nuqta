import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { summarize } from '@shared/ledger'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store, type StoreResult } from '../db/store'
import { MockRouter } from './mock'
import { RouterService } from './service'

function must<T>(r: StoreResult<T> | { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`)
  return r.value
}

let db: Db
let store: Store
let router: MockRouter
let svc: RouterService
let now = Date.UTC(2026, 10, 6, 9, 0, 0)
let op = 0
const key = () => `op-${++op}`
const clock = () => new Date(now).toISOString()

let ids: { router: number; h3: number; dist: string }

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  store = new Store(db, clock)
  router = new MockRouter()
  svc = new RouterService(store, router, clock)
  ids = {
    router: store.addRouter({ name: 'الرئيسي', host: '192.168.88.1' }),
    h3: store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) }),
    dist: must(store.addDistributor({ name: 'مكتبة الأمل', creditLimitAg: shekels(1000) }, key())).id
  }
})
afterEach(() => db.close())

const newBatch = (count: number, distributorId: string | null = ids.dist) =>
  must(store.createBatch({ categoryId: ids.h3, routerId: ids.router, distributorId, count }, key()))

describe('sending a batch', () => {
  it('first send confirms 88%, the rest stays pending, and resending the same codes confirms them', async () => {
    const { batch, codes } = newBatch(100)
    expect(must(await svc.sendBatch(batch.id))).toEqual({ confirmed: 88, pending: 12, routerDown: false, rejected: [] })
    const pending = store.batchCodes(batch.id, 'pending')
    expect(must(await svc.sendBatch(batch.id))).toEqual({ confirmed: 100, pending: 0, routerDown: false, rejected: [] })
    expect(new Set([...store.batchCodes(batch.id, 'confirmed')])).toEqual(new Set(codes))
    expect(pending.every((c) => router.user(c)?.comment === `nuqta:B-${batch.no}`)).toBe(true)
  })

  it('router down while sending: saved, zero confirmed, printing blocked, nothing lost (acceptance test 4)', async () => {
    const { batch, codes } = newBatch(50)
    router.up = false
    expect(must(await svc.sendBatch(batch.id))).toMatchObject({ confirmed: 0, pending: 50, routerDown: true })
    expect(store.printBatch(batch.id, 'a4-24')).toEqual({ ok: false, error: { code: 'nothing_to_print' } })
    // إعادة الإرسال والراوتر لسا مقطوع: الدفعة محفوظة (batch.resendDown).
    expect(must(await svc.sendBatch(batch.id))).toMatchObject({ confirmed: 0, routerDown: true })
    router.up = true
    await svc.sendBatch(batch.id)
    await svc.sendBatch(batch.id)
    expect(store.batchCodes(batch.id, 'confirmed').sort()).toEqual([...codes].sort())
  })

  it('a profile missing on the router is reported and the cards stay pending', async () => {
    const odd = store.addCategory({ name: 'شهر', routerProfile: 'month', limitUptime: null, wholeAg: 100, saleAg: 200 })
    const { batch } = must(store.createBatch({ categoryId: odd, routerId: ids.router, distributorId: null, count: 3 }, key()))
    const r = must(await svc.sendBatch(batch.id))
    expect(r).toMatchObject({ confirmed: 0, pending: 3 })
    expect(r.rejected).toHaveLength(3)
  })
})

async function delivered(count: number, distributorId: string | null = ids.dist) {
  const { batch, codes } = newBatch(count, distributorId)
  await svc.sendBatch(batch.id)
  await svc.sendBatch(batch.id)
  must(store.printBatch(batch.id, 'a4-24'))
  must(store.deliverBatch(batch.id, key()))
  return codes
}

describe('usage sync', () => {
  it('charges a card the first time it is used, once, using the device clock', async () => {
    const codes = await delivered(20)
    router.use(codes[0]!)
    router.use(codes[1]!)
    now += 60_000
    expect(must(await svc.syncUsage())).toEqual({ newlyUsed: 2, usedButNotDelivered: [], missingOnRouter: [] })
    expect(store.card(codes[0]!)!.firstUsedAt).toBe(clock())
    router.use(codes[0]!, 600)
    now += 60_000
    expect(must(await svc.syncUsage()).newlyUsed).toBe(0)
    expect(summarize(store.entries(ids.dist))).toMatchObject({ used: 2, owedAg: shekels(4) })
  })

  it('a full day offline, then sync: everything counted once (acceptance test 5)', async () => {
    const codes = await delivered(30)
    router.up = false
    expect(await svc.syncUsage()).toMatchObject({ ok: false, error: { isDown: true } })
    for (const c of codes.slice(0, 25)) router.use(c)
    router.up = true
    now += 86_400_000
    must(await svc.syncUsage())
    must(await svc.syncUsage())
    expect(summarize(store.entries(ids.dist))).toMatchObject({ used: 25, held: 5, owedAg: shekels(50) })
  })

  it('a used card that was never delivered is reported, not charged', async () => {
    const { batch } = newBatch(5)
    await svc.sendBatch(batch.id)
    await svc.sendBatch(batch.id)
    const code = store.batchCodes(batch.id, 'confirmed')[0]!
    router.use(code)
    expect(must(await svc.syncUsage()).usedButNotDelivered).toEqual([code])
    expect(summarize(store.entries(ids.dist)).owedAg).toBe(0)
  })

  it('router reset: missing cards are flagged and the ledger is not touched (section 7)', async () => {
    const codes = await delivered(10)
    router.use(codes[0]!)
    must(await svc.syncUsage())
    const before = store.entries(ids.dist)
    router.wipe()
    const r = must(await svc.syncUsage())
    expect(r.missingOnRouter.sort()).toEqual([...codes].sort())
    expect(store.entries(ids.dist)).toEqual(before)
  })
})

describe('returns and the outbox', () => {
  it('return while the router is down: recorded now, disabled when it comes back', async () => {
    const codes = await delivered(10)
    router.up = false
    must(store.returnCards(ids.dist, codes.slice(0, 3), key()))
    expect(await svc.flushOutbox()).toEqual({ done: 0, waiting: 1 })
    expect(summarize(store.entries(ids.dist)).returned).toBe(3)
    router.up = true
    expect(await svc.flushOutbox()).toEqual({ done: 1, waiting: 0 })
    expect(codes.slice(0, 3).every((c) => router.user(c)!.disabled)).toBe(true)
    expect(router.user(codes[3]!)!.disabled).toBe(false)
  })
})

describe('sessions', () => {
  it('lists and kicks sessions; kicking with the router down fails cleanly', async () => {
    const codes = await delivered(2)
    const id = router.use(codes[0]!)
    expect(must(await svc.sessions())).toHaveLength(1)
    must(await svc.kick(id))
    expect(must(await svc.sessions())).toEqual([])
    router.up = false
    expect(await svc.kick(id)).toMatchObject({ ok: false, error: { code: 'unreachable' } })
  })
})
