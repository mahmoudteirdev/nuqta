import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { summarize } from '@shared/ledger'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import type { CardsJob } from '@shared/print'
import type { PrintOutcome } from '../print'
import { batchActions } from './batch'

let db: Db
let store: Store
let router: MockRouter
let api: ReturnType<typeof batchActions>
let ids: { router: number; h3: number; dist: string }
let lastUp: boolean | null = null
let jobs: CardsJob[] = []
let printResult: PrintOutcome = { ok: true }

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  store = new Store(db)
  router = new MockRouter()
  const service = new RouterService(store, router)
  jobs = []
  printResult = { ok: true }
  api = batchActions({ db: () => db, store: () => store, service: () => service, afterSend: (up) => { lastUp = up }, print: async (j) => { jobs.push(j); return printResult } })
  ids = {
    router: store.addRouter({ name: 'الراوتر الرئيسي', host: '192.168.88.1' }),
    h3: store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) }),
    dist: (() => { const x = store.addDistributor({ name: 'مكتبة الأمل', creditLimitAg: shekels(1000) }, 'd1'); if (!x.ok) throw new Error(); return x.value.id })()
  }
})
afterEach(() => db.close())

function ok<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  return r.value
}
const params = (count = 100, distributorId: string | null = ids.dist) => ({ routerId: ids.router, categoryId: ids.h3, distributorId, count })

describe('batch flow', () => {
  it('generate → partial confirm → print → bad print → reprint same codes → deliver → resend → print only the new → done', async () => {
    const sent = ok(await api.createBatch(params(), 'b1'))
    expect(sent.routerDown).toBe(false)
    expect(sent.view).toMatchObject({ no: 1001, stage: 'sent', count: 100, toPrint: 88, pending: 12, toDeliver: 0, delivered: 0, printedTimes: 0 })
    expect(sent.view.preview.every((p) => p.ready)).toBe(true)
    expect(lastUp).toBe(true)

    const printed = ok(await api.printBatch(sent.view.id, 'new'))
    expect(printed).toMatchObject({ toPrint: 0, toDeliver: 88, printedTimes: 1 })
    const again = ok(await api.printBatch(sent.view.id, 'again'))
    expect(again).toMatchObject({ toDeliver: 88, printedTimes: 2 })

    const d1 = ok(api.deliverBatch(sent.view.id, 'dv1'))
    expect(d1.delivered).toBe(88)
    expect(d1.view).toMatchObject({ stage: 'sent', delivered: 88, pending: 12 })

    const re = ok(await api.resendBatch(sent.view.id))
    expect(re.view).toMatchObject({ toPrint: 12, pending: 0 })
    // الطباعة الجديدة بتطبع الـ12 بس، مش الـ88 اللي انسلموا.
    const p2 = ok(await api.printBatch(sent.view.id, 'new'))
    expect(p2).toMatchObject({ toDeliver: 12, delivered: 88, printedTimes: 3 })
    const lastLog = db.get<{ cards: number }>('SELECT cards FROM print_log ORDER BY id DESC LIMIT 1')!
    expect(lastLog.cards).toBe(12)

    const d2 = ok(api.deliverBatch(sent.view.id, 'dv2'))
    expect(d2.view.stage).toBe('done')
    expect(summarize(store.entries(ids.dist))).toMatchObject({ delivered: 100, held: 100, owedAg: 0 })
  })

  it('the same generate request twice makes one batch and sends once', async () => {
    const a = ok(await api.createBatch(params(10), 'b2'))
    const b = ok(await api.createBatch(params(10), 'b2'))
    expect(b.view.id).toBe(a.view.id)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM batches')!.n).toBe(1)
  })

  it('router down: saved with nothing confirmed, printing refused, resend while down keeps it, then works', async () => {
    router.up = false
    const r = ok(await api.createBatch(params(20), 'b3'))
    expect(r).toMatchObject({ routerDown: true, view: { toPrint: 0, pending: 20 } })
    expect(lastUp).toBe(false)
    expect(await api.printBatch(r.view.id, 'new')).toEqual({ ok: false, error: { code: 'nothing_to_print' } })
    expect(ok(await api.resendBatch(r.view.id)).routerDown).toBe(true)
    router.up = true
    await api.resendBatch(r.view.id)
    expect(ok(await api.resendBatch(r.view.id)).view).toMatchObject({ toPrint: 20, pending: 0 })
  })

  it('direct sale delivers without any ledger entry', async () => {
    const r = ok(await api.createBatch(params(10, null), 'b4'))
    await api.resendBatch(r.view.id)
    ok(await api.printBatch(r.view.id, 'new'))
    const d = ok(api.deliverBatch(r.view.id, 'dv4'))
    expect(d.view).toMatchObject({ stage: 'done', distributorName: null })
    expect(store.entries(ids.dist).filter((e) => e.type === 'delivery')).toHaveLength(0)
  })

  it('refuses bad counts, including above the temporary maximum', async () => {
    for (const count of [0, -5, 2.5, 1001]) expect(await api.createBatch(params(count), `bad${count}`)).toEqual({ ok: false, error: { code: 'count_invalid' } })
    store.setSetting('max_batch_count', '2000')
    expect((await api.createBatch(params(1001), 'big')).ok).toBe(true)
    expect(api.batchForm().maxCount).toBe(2000)
  })

  it('the form lists routers, categories with prices, and distributors with their limits', () => {
    expect(api.batchForm()).toEqual({
      routers: [{ id: ids.router, name: 'الراوتر الرئيسي' }],
      categories: [{ id: ids.h3, name: '3 ساعات', wholeAg: shekels(2), saleAg: shekels(3), hotspotServer: null }],
      distributors: [{ id: ids.dist, name: 'مكتبة الأمل', owedAg: 0, creditLimitAg: shekels(1000), debtPolicy: 'on_use' }],
      maxCount: 1000,
      template: 'a4-12',
      hotspotServers: []
    })
  })
})

describe('printing for real', () => {
  it('sends the right cards to the printer: template, price, phone, batch number', async () => {
    store.setSetting('support_phone', '059 123 4567')
    store.setSetting('print_template', 'a4-24')
    const sent = ok(await api.createBatch(params(100), 'p1'))
    ok(await api.printBatch(sent.view.id, 'new'))
    expect(jobs[0]).toMatchObject({ kind: 'cards', template: 'a4-24', phone: '059 123 4567', showPrice: true, categoryName: '3 ساعات', saleAg: shekels(3), batchNo: sent.view.no })
    expect(jobs[0]!.codes).toHaveLength(88)
  })

  it('a cancelled or failed print records nothing and changes no card (section 7)', async () => {
    const sent = ok(await api.createBatch(params(10), 'p2'))
    await api.resendBatch(sent.view.id)
    for (const outcome of [{ ok: false, reason: 'cancelled' }, { ok: false, reason: 'failed', detail: 'paper jam' }] as PrintOutcome[]) {
      printResult = outcome
      const r = await api.printBatch(sent.view.id, 'new')
      expect(r).toEqual({ ok: false, error: { code: outcome.ok ? '' : outcome.reason === 'cancelled' ? 'print_cancelled' : 'print_failed' } })
      expect(api.batchView(sent.view.id)).toMatchObject({ toPrint: 10, toDeliver: 0, printedTimes: 0 })
    }
    // المحاولة الجاية بتطبع نفس الأكواد.
    printResult = { ok: true }
    ok(await api.printBatch(sent.view.id, 'new'))
    expect(jobs.at(-1)!.codes).toEqual(jobs[0]!.codes)
    expect(api.batchView(sent.view.id)).toMatchObject({ toPrint: 0, toDeliver: 10, printedTimes: 1 })
  })

  it('records exactly the cards that went to the printer, even if more got confirmed meanwhile', async () => {
    const sent = ok(await api.createBatch(params(100), 'p3'))
    // الراوتر بيأكد الـ12 الباقيين والطابعة لسا شغالة على الـ88.
    let resent: Promise<unknown> | null = null
    printResult = { ok: true }
    const slow = batchActions({
      db: () => db, store: () => store, service: () => new RouterService(store, router), afterSend: () => {},
      print: async (j) => { jobs.push(j); resent = api.resendBatch(sent.view.id); await resent; return { ok: true } }
    })
    ok(await slow.printBatch(sent.view.id, 'new'))
    expect(jobs.at(-1)!.codes).toHaveLength(88)
    expect(api.batchView(sent.view.id)).toMatchObject({ toDeliver: 88, toPrint: 12 })
  })
})

describe('technician limits', () => {
  const asTech = () => {
    const service = new RouterService(store, router)
    return batchActions({ db: () => db, store: () => store, service: () => service, afterSend: () => {}, print: async () => ({ ok: true }), role: () => 'technician' })
  }

  it('hides what distributors owe, and leaves over-limit decisions to the owner', async () => {
    store.setDebtPolicy(ids.dist, 'on_delivery')
    store.actor = 'u:2'
    const sent = ok(await api.createBatch(params(100), 't1'))
    ok(await api.printBatch(sent.view.id, 'new'))
    ok(api.deliverBatch(sent.view.id, 't2'))
    expect(store.entries(ids.dist).at(-1)!.createdBy).toBe('u:2')

    const tech = asTech()
    expect(tech.batchForm().distributors[0]).toMatchObject({ owedAg: 0, creditLimitAg: 0 })
    expect(ok(await tech.createBatch(params(10), 't3')).view.count).toBe(10)

    store.setCreditLimit(ids.dist, shekels(100))
    expect(await tech.createBatch(params(10), 't4')).toEqual({ ok: false, error: { code: 'owner_required' } })
    expect(ok(await tech.createBatch(params(10, null), 't5')).view.count).toBe(10)
    expect(ok(await api.createBatch(params(10), 't6')).view.count).toBe(10)
  })
})
