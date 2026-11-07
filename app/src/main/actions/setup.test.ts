import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { seedDemo } from '../dev/seed'
import { connectRouter, type SecretBox } from '../router/connect'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import { draftFor, setupActions, setupState } from './setup'

let db: Db
let store: Store
let router: MockRouter
let api: ReturnType<typeof setupActions>
const secrets: SecretBox = { available: () => true, encrypt: (s) => `sealed:${s.length}`, decrypt: () => 'x' }

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  store = new Store(db)
  router = new MockRouter()
  const svc = new RouterService(store, router)
  api = setupActions({ store: () => store, service: () => svc })
})
afterEach(() => db.close())

function ok<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  return r.value
}

describe('when setup shows', () => {
  it('a fresh install needs setup, a database with work in it does not', () => {
    expect(setupState(store)).toEqual({ needed: true, step: 1 })
    seedDemo(db)
    expect(setupState(store).needed).toBe(false)
  })

  it('finishing setup hides it for good, even with no categories', () => {
    api.finishSetup()
    expect(setupState(store).needed).toBe(false)
  })

  it('remembers the step, so closing the app halfway resumes there', () => {
    api.setSetupStep(3)
    expect(setupState(store)).toEqual({ needed: true, step: 3 })
  })
})

describe('profile suggestions', () => {
  it.each([
    ['1h', 'ساعة', '1h'], ['3h', '3 ساعات', '3h'], ['day', 'يوم كامل', '1d'], ['Week', 'أسبوع', '7d'], ['12h', '12h', '12h'], ['vip', 'vip', '']
  ])('%s → %s, %s', (p, name, limit) => {
    expect(draftFor(p)).toEqual({ name, profile: p, limitUptime: limit })
  })
})

describe('the whole first run', () => {
  it('connect → categories from the router → distributors → a working test card', async () => {
    // 1. ربط الراوتر.
    ok(await connectRouter(store, { host: '192.168.88.1', user: 'nuqta', password: 'p' }, { makeClient: () => router, secrets }))
    expect(store.routers()).toHaveLength(1)

    // 2. الفئات: ملفات الراوتر بأسماء واوقات مقترحة، والسعر فاضي.
    const { drafts } = await api.setupCategories()
    expect(drafts!.map((d) => [d.profile, d.name, d.limitUptime, d.wholeAg])).toEqual([
      ['1h', 'ساعة', '1h', 0], ['3h', '3 ساعات', '3h', 0], ['day', 'يوم كامل', '1d', 0], ['week', 'أسبوع', '7d', 0]
    ])
    const priced = drafts!.map((d, i) => (i < 2 ? { ...d, wholeAg: shekels(i + 1), saleAg: shekels(i + 2) } : d))
    expect(ok(api.saveSetupCategories(priced))).toEqual({ count: 2 })
    expect(store.categories().map((c) => [c.name, c.limitUptime, c.wholeAg / 100, c.saleAg / 100])).toEqual([['ساعة', '1h', 1, 2], ['3 ساعات', '3h', 2, 3]])
    expect(setupState(store).step).toBe(3)

    // رجوع وتعديل السعر ما بيكرر الفئة.
    ok(api.saveSetupCategories([{ ...priced[0]!, saleAg: shekels(3) }]))
    expect(store.categories()).toHaveLength(2)
    expect((await api.setupCategories()).drafts![0]).toMatchObject({ wholeAg: shekels(1), saleAg: shekels(3) })

    // 4. كرت التجربة: كرت واحد بيع مباشر، والراوتر أكده. طلبه مرة ثانية بيرجع نفس الكرت.
    const card = ok(await api.setupTestCard())
    expect(card.confirmed).toBe(true)
    expect(router.user(card.code)).toBeTruthy()
    expect(ok(await api.setupTestCard()).code).toBe(card.code)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM cards')!.n).toBe(1)

    api.finishSetup()
    expect(setupState(store).needed).toBe(false)
  })

  it('refuses a step 2 with no priced category, or a time the router cannot read', () => {
    const d = { name: 'x', profile: 'x', limitUptime: '3h', wholeAg: 0, saleAg: 0 }
    expect(api.saveSetupCategories([d])).toEqual({ ok: false, error: { code: 'setup_no_category' } })
    expect(api.saveSetupCategories([{ ...d, wholeAg: 100, saleAg: 200, limitUptime: 'ساعتين' }])).toEqual({ ok: false, error: { code: 'setup_uptime', codes: ['x'] } })
    expect(store.categories()).toHaveLength(0)
  })

  it('router down: categories cannot be read, and the test card is saved but not confirmed', async () => {
    store.addRouter({ name: 'R', host: 'h' })
    store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: 100, saleAg: 200 })
    router.up = false
    expect((await api.setupCategories()).drafts).toBeNull()
    expect(ok(await api.setupTestCard()).confirmed).toBe(false)
    router.up = true
    expect(ok(await api.setupTestCard()).confirmed).toBe(true)
  })

  it('a test card needs a router and a category first', async () => {
    expect(await api.setupTestCard()).toEqual({ ok: false, error: { code: 'setup_incomplete' } })
  })
})
