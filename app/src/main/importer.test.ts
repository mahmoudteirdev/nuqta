import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseCsv } from '@shared/csv'
import { normCode } from '@shared/input'
import { summarize } from '@shared/ledger'
import { shekels } from '@shared/money'
import { cardActions, cardRecord } from './actions/card'
import { decodeCsv, importActions } from './actions/import'
import { openDatabase, type Db } from './db/db'
import { Store } from './db/store'
import { commitImport, parseImport, planImport } from './importer'
import { MockRouter } from './router/mock'
import { RouterService } from './router/service'

describe('CSV reading', () => {
  it('handles BOM, quotes, commas and line breaks inside quotes, and CRLF', () => {
    const t = '\uFEFFname,comment\r\n"ab12cd","قال ""مرحبا"", وراح"\r\n"x9y8","سطر\nثاني"\r\n'
    expect(parseCsv(t)).toEqual([['name', 'comment'], ['ab12cd', 'قال "مرحبا", وراح'], ['x9y8', 'سطر\nثاني']])
  })

  it('detects ; and tab delimiters (Arabic Excel often saves with ;)', () => {
    expect(parseCsv('name;profile\nAAAA1;3h\n')).toEqual([['name', 'profile'], ['AAAA1', '3h']])
    expect(parseCsv('name\tprofile\nAAAA1\t3h')).toEqual([['name', 'profile'], ['AAAA1', '3h']])
  })

  it('reads UTF-8, and falls back to Windows-1256 for files saved by Arabic Excel', () => {
    expect(decodeCsv(new TextEncoder().encode('الكود\n1234'))).toBe('الكود\n1234')
    // «الكود» بترميز Windows-1256.
    const cp1256 = new Uint8Array([0xc7, 0xe1, 0xdf, 0xe6, 0xcf, 0x0a, 0x31, 0x32, 0x33, 0x34])
    expect(decodeCsv(cp1256)).toBe('الكود\n1234')
  })
})

describe('understanding the file', () => {
  it('a MikroTik user export: name, profile, uptime', () => {
    const p = parseImport('name,password,profile,uptime,comment\nab12cd,,3h,0s,old\nZZ99YY,,1h,45m,old\n,,1h,,\nبيت,,1h,,')
    expect(p.rows).toEqual([
      { code: 'ab12cd', profile: '3h', used: false },
      { code: 'ZZ99YY', profile: '1h', used: true }
    ])
    expect(p.invalid).toBe(2)
  })

  it('Arabic headers, and a plain list of codes with no header', () => {
    expect(parseImport('الكود,الفئة,مستخدم\nQ2ZS-85WE,ساعة,نعم').rows).toEqual([{ code: 'Q2ZS-85WE', profile: 'ساعة', used: true }])
    expect(parseImport('Q2ZS85WE\nM6YB39KG\n').rows.map((r) => r.code)).toEqual(['Q2ZS85WE', 'M6YB39KG'])
  })
})

describe('importing', () => {
  let db: Db
  let store: Store
  let router: MockRouter
  let svc: RouterService
  let yousef: string
  const now = '2026-11-07T10:00:00.000Z'

  beforeEach(() => {
    const r = openDatabase(':memory:')
    if (!r.ok) throw new Error(r.detail)
    db = r.db
    store = new Store(db, () => now)
    router = new MockRouter()
    svc = new RouterService(store, router)
    store.addRouter({ name: 'R', host: 'h' })
    store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: shekels(1), saleAg: shekels(2) })
    store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) })
    const d = store.addDistributor({ name: 'محل يوسف', creditLimitAg: 0 }, 'd')
    if (!d.ok) throw new Error()
    yousef = d.value.id
  })
  afterEach(() => db.close())

  const file = 'name,profile,uptime\nab12cd,3h,0s\nAB12CD,3h,0s\nef34gh,3h,1h\nij56kl,1h,\nmn78op,vip,\n'

  it('plan: duplicates skipped (any case), profiles mapped to categories, unknown ones flagged', () => {
    const plan = planImport(db, store, parseImport(file))
    expect(plan.duplicates).toBe(1)
    expect(plan.groups.map((g) => [g.profile, g.categoryName, g.count, g.used])).toEqual([['3h', '3 ساعات', 2, 1], ['1h', 'ساعة', 1, 0], ['vip', null, 1, 0]])
  })

  it('old cards with no seller go in as direct sale, with no debt, searchable and tagged on the router', () => {
    const plan = planImport(db, store, parseImport(file))
    const r = commitImport(db, store, plan, { distributorId: null, fallbackCategoryId: null }, 'imp1', now)
    expect(r).toMatchObject({ imported: 3, skipped: 1, batches: [1001, 1002] })
    expect(cardRecord(db, normCode('AB12CD'))).toMatchObject({ code: 'ab12cd', status: 'delivered', distributorName: null, categoryName: '3 ساعات' })
    expect(cardRecord(db, 'EF34GH')).toMatchObject({ status: 'active' })
    expect(db.get<{ n: number }>('SELECT count(*) n FROM ledger')!.n).toBe(1)
    expect(store.pendingJobs('router.tag').map((j) => j.payload)).toEqual([
      { codes: ['ab12cd', 'ef34gh'], comment: 'nuqta:B-1001' }, { codes: ['ij56kl'], comment: 'nuqta:B-1002' }
    ])
    // ما في ولا شي يتكرر لو الملف انستورد مرة ثانية.
    expect(planImport(db, store, parseImport(file)).fresh.map((x) => x.code)).toEqual(['mn78op'])
  })

  it('to a distributor: unused cards become his custody, used ones carry no debt, and future usage is charged', () => {
    const plan = planImport(db, store, parseImport(file))
    commitImport(db, store, plan, { distributorId: yousef, fallbackCategoryId: 1 }, 'imp2', now)
    // 3h: كرت غير مستخدم + كرت مستخدم، 1h: كرت، vip→ساعة: كرت.
    expect(summarize(store.entries(yousef))).toMatchObject({ delivered: 3, held: 3, owedAg: 0 })
    store.recordUsage(['ab12cd'], now, 'u1')
    expect(summarize(store.entries(yousef))).toMatchObject({ used: 1, held: 2, owedAg: shekels(2) })
  })

  it('the same import request twice records once', () => {
    const plan = planImport(db, store, parseImport(file))
    const a = commitImport(db, store, plan, { distributorId: null, fallbackCategoryId: null }, 'imp3', now)
    const b = commitImport(db, store, plan, { distributorId: null, fallbackCategoryId: null }, 'imp3', now)
    expect(b.batches).toEqual(a.batches)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM cards')!.n).toBe(3)
  })

  it('after the router is tagged, usage of imported cards is picked up by the normal sync', async () => {
    router.load([{ name: 'ab12cd', profile: '3h', uptimeSeconds: 0, disabled: false, comment: 'من برنامج قديم' }])
    commitImport(db, store, planImport(db, store, parseImport('name,profile\nab12cd,3h')), { distributorId: yousef, fallbackCategoryId: null }, 'imp4', now)
    expect(await svc.flushOutbox()).toEqual({ done: 1, waiting: 0 })
    router.use('ab12cd', 120)
    expect((await svc.syncUsage()).ok && summarize(store.entries(yousef)).used).toBe(1)
  })

  it('checking an imported lowercase card asks the router with its exact case', async () => {
    router.load([{ name: 'ab12cd', profile: '3h', uptimeSeconds: 0, disabled: false, comment: 'old' }])
    const csv = ['name,profile', 'ab12cd,3h'].join('\n')
    commitImport(db, store, planImport(db, store, parseImport(csv)), { distributorId: null, fallbackCategoryId: null }, 'imp5', now)
    await svc.flushOutbox()
    const check = await cardActions({ db: () => db, service: () => svc }).checkCard('AB12-CD')
    expect(check).toMatchObject({ code: 'ab12cd', verdict: 'unused', routerChecked: true })
  })

  it('through the screen actions: preview first, nothing written until commit', async () => {
    let tagged = 0
    const api = importActions({
      db: () => db, store: () => store, now: () => now, afterImport: () => { tagged++ },
      pickFile: async () => ({ name: 'C:\\old\\kroot.csv', bytes: new TextEncoder().encode(file) })
    })
    const p = await api.importPreview()
    if (!p.ok || 'cancelled' in p.value) throw new Error()
    expect(p.value).toMatchObject({ fileName: 'kroot.csv', total: 5, fresh: 4, duplicates: 1, invalid: 0 })
    expect(db.get<{ n: number }>('SELECT count(*) n FROM cards')!.n).toBe(0)
    expect(api.importCommit(p.value.token, { distributorId: null, fallbackCategoryId: null }, 'k')).toEqual({ ok: true, value: { imported: 3, skipped: 1, batches: [1001, 1002] } })
    expect(tagged).toBe(1)
    expect(api.importCommit('old-token', { distributorId: null, fallbackCategoryId: null }, 'k2')).toEqual({ ok: false, error: { code: 'import_expired' } })
  })
})
