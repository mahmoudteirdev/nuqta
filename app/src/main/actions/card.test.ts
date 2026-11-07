import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import { cardActions, cardRecord, diagnose, type CardRecord, type RouterView } from './card'

const base: CardRecord = {
  code: '7K4F-92QM', status: 'delivered', createdAt: '2026-10-06T07:00:00Z', confirmedAt: '2026-10-06T07:00:01Z',
  deliveredAt: '2026-10-06T08:00:00Z', firstUsedAt: null, firstMac: null, returnedAt: null, batchId: 3, batchNo: 1035,
  categoryName: '3 ساعات', limitUptime: '3h', distributorName: 'مكتبة الأمل', printTimes: 1, firstPrintAt: '2026-10-06T07:30:00Z'
}
const user = (uptimeSeconds = 0, disabled = false) => ({ name: base.code, uptimeSeconds, disabled, comment: 'nuqta:B-1035' })
const session = { id: '*A', user: base.code, mac: '4F:A2:11:22:33:44', address: '10.5.50.2', uptimeSeconds: 120 }
const on = (u: ReturnType<typeof user> | null, s: typeof session | null = null): RouterView => ({ user: u, session: s })

describe('diagnose: one verdict per situation', () => {
  it.each<[string, Partial<CardRecord>, RouterView, string, number | null]>([
    ['router never confirmed it', { status: 'pending', confirmedAt: null, deliveredAt: null }, on(null), 'not_on_router_yet', null],
    ['printed, not handed over', { status: 'printed', deliveredAt: null }, on(user()), 'not_delivered', 10800],
    ['returned by the distributor', { status: 'returned', returnedAt: '2026-11-01T10:00:00Z' }, on(user(0, true)), 'returned', null],
    ['someone is on it now', { status: 'active', firstUsedAt: '2026-11-06T09:00:00Z' }, on(user(120), session), 'in_use', 10680],
    ['all time used up', { status: 'active', firstUsedAt: '2026-11-05T17:20:00Z' }, on(user(10800)), 'expired', 0],
    ['used, time left', { status: 'active', firstUsedAt: '2026-11-06T09:00:00Z' }, on(user(3600)), 'used_time_left', 7200],
    ['sound and never used', {}, on(user()), 'unused', 10800],
    ['confirmed by us, gone from the router', {}, on(null), 'missing_on_router', null],
    ['disabled on the router by hand', {}, on(user(0, true)), 'disabled', 10800]
  ])('%s', (_name, patch, router, verdict, left) => {
    const c = diagnose({ ...base, ...patch }, router)
    expect(c.verdict).toBe(verdict)
    expect(c.secondsLeft).toBe(left)
  })

  it('router down: judged from our records only, and says so', () => {
    const c = diagnose({ ...base, status: 'active', firstUsedAt: '2026-11-06T09:00:00Z' }, null)
    expect(c).toMatchObject({ verdict: 'used_time_left', routerChecked: false, secondsLeft: null, session: null })
    expect(diagnose(base, null)).toMatchObject({ verdict: 'unused', secondsLeft: 10800 })
  })

  it('history follows the card through its life', () => {
    const c = diagnose({ ...base, status: 'active', firstUsedAt: '2026-11-05T17:20:00Z', firstMac: 'AA:BB', printTimes: 2 }, on(user(10800)))
    expect(c.history.map((e) => e.kind)).toEqual(['generated', 'confirmed', 'printed', 'delivered', 'used', 'expired'])
    expect(c.history[2]).toMatchObject({ times: 2 })
    expect(c.history[3]).toMatchObject({ to: 'مكتبة الأمل' })
  })
})

describe('checkCard through the database and router', () => {
  let db: Db
  let store: Store
  let router: MockRouter
  let api: ReturnType<typeof cardActions>
  let codes: string[]

  beforeEach(async () => {
    const r = openDatabase(':memory:')
    if (!r.ok) throw new Error(r.detail)
    db = r.db
    store = new Store(db)
    router = new MockRouter({ firstSendRate: 1 })
    const svc = new RouterService(store, router)
    api = cardActions({ db: () => db, service: () => svc })
    const rt = store.addRouter({ name: 'الرئيسي', host: 'x' })
    const cat = store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: shekels(1), saleAg: shekels(2) })
    const d = store.addDistributor({ name: 'محل يوسف', creditLimitAg: 0 }, 'd')
    if (!d.ok) throw new Error()
    const b = store.createBatch({ categoryId: cat, routerId: rt, distributorId: d.value.id, count: 3 }, 'b')
    if (!b.ok) throw new Error()
    codes = b.value.codes
    await svc.sendBatch(b.value.batch.id)
    store.printBatch(b.value.batch.id, 'a4-12')
    store.deliverBatch(b.value.batch.id, 'dv')
  })
  afterEach(() => db.close())

  it('unknown code → null; any spelling of a real code works', async () => {
    expect(await api.checkCard('ZZZZ-ZZZZ')).toBeNull()
    expect((await api.checkCard(codes[0]!.toLowerCase().replace('-', '')))!.code).toBe(codes[0])
  })

  it('a card used on the router since the last sync is charged before the verdict, and a live session can be kicked', async () => {
    const sid = router.use(codes[0]!, 600)
    const c = (await api.checkCard(codes[0]!))!
    expect(c).toMatchObject({ verdict: 'in_use', secondsLeft: 3000, session: { id: sid } })
    expect(cardRecord(db, codes[0]!)!.status).toBe('active')
    expect(store.distributors()[0]!.summary.used).toBe(1)
    expect(await api.kickSession(sid)).toEqual({ ok: true, value: undefined })
    expect((await api.checkCard(codes[0]!))!.verdict).toBe('used_time_left')
  })

  it('router down: still answers from our records', async () => {
    router.up = false
    expect(await api.checkCard(codes[1]!)).toMatchObject({ verdict: 'unused', routerChecked: false })
    expect(await api.kickSession('*1')).toEqual({ ok: false, error: { code: 'unreachable' } })
  })
})
