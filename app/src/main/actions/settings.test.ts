import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { homeData } from '../db/queries'
import { reportsData } from '../db/reports'
import { Store } from '../db/store'
import { seedDemo } from '../dev/seed'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import { DEFAULT_RULES } from '../rules'
import { accountActions } from './account'
import { batchActions } from './batch'
import { settingsActions } from './settings'

let db: Db
let store: Store
let api: ReturnType<typeof settingsActions>
const NOW = new Date(2026, 10, 6, 14, 0)
const now = NOW.toISOString()

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  seedDemo(db, NOW)
  store = new Store(db, () => now)
  api = settingsActions({ db: () => db, store: () => store, now: () => now })
})
afterEach(() => db.close())

function ok<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  return r.value
}

describe('network settings', () => {
  it('saves the network name and the support number shown on the card', () => {
    expect(api.networkSettings()).toEqual({ networkName: 'شبكة النور', phone: '' })
    ok(api.saveNetworkSettings({ networkName: ' نت النور ', phone: ' 059 123 4567 ' }))
    expect(api.networkSettings()).toEqual({ networkName: 'نت النور', phone: '059 123 4567' })
  })

  it.each([
    [{ networkName: '  ', phone: '' }, 'network_name'],
    [{ networkName: 'x', phone: '059abc' }, 'phone_invalid'],
    [{ networkName: 'x', phone: '٠٥٩' }, 'phone_invalid']
  ])('refuses %o', (s, code) => {
    expect(api.saveNetworkSettings(s)).toEqual({ ok: false, error: { code } })
  })
})

describe('users', () => {
  it('the network owner always exists, and technicians can be added', () => {
    expect(api.users()).toEqual([{ id: 1, name: 'صاحب الشبكة', role: 'owner' }])
    ok(api.addUser({ name: ' سامي ', role: 'technician' }))
    expect(api.users().map((u) => [u.name, u.role])).toEqual([['صاحب الشبكة', 'owner'], ['سامي', 'technician']])
    expect(api.addUser({ name: '', role: 'technician' })).toEqual({ ok: false, error: { code: 'user_name' } })
    expect(api.addUser({ name: 'x', role: 'boss' as 'owner' })).toEqual({ ok: false, error: { code: 'user_role' } })
  })
})

describe('temporary rules', () => {
  it('defaults match what the screens used before, and bad values are refused', () => {
    expect(api.rules()).toEqual(DEFAULT_RULES)
    expect(api.saveRules({ ...DEFAULT_RULES, collectAfterDays: 0 })).toEqual({ ok: false, error: { code: 'rule_collectAfterDays', range: [1, 90] } })
    expect(api.saveRules({ ...DEFAULT_RULES, maxBatchCount: 2.5 })).toEqual({ ok: false, error: { code: 'rule_maxBatchCount', range: [1, 5000] } })
    expect(api.rules()).toEqual(DEFAULT_RULES)
  })

  it('a changed rule takes effect everywhere it is used', async () => {
    ok(api.saveRules({ collectAfterDays: 10, stockLowCards: 0, staleAfterDays: 60, defaultCreditLimitAg: shekels(250), maxBatchCount: 5 }))

    // شغل اليوم: يوسف آخر تسوية قبل 9 أيام، فمهمته بتختفي. وتنبيه المخزون بيوقف.
    const tasks = homeData(db, store, { now, routerUp: true }).tasks
    expect(tasks.map((t) => (t.kind === 'collect' || t.kind === 'stock' ? `${t.kind}:${t.name}` : t.kind))).toEqual(['collect:كشك الميناء'])

    // الراكد: بعد 60 يوم ما في شي راكد ببيانات التجربة.
    expect(reportsData(db, store, 30, now).stale.every((s) => s.staleCards === 0)).toBe(true)

    // الموزع الجديد بياخذ السقف الجديد.
    const acc = accountActions({ db: () => db, store: () => store, routerUp: () => true, afterChange: () => {}, now: () => now })
    const d = ok(acc.addDistributor({ name: 'جديد', area: '', openingAg: 0 }, 'n1'))
    expect(acc.account(d.id).current!.creditLimitAg).toBe(shekels(250))

    // أكبر دفعة.
    const svc = new RouterService(store, new MockRouter())
    const batches = batchActions({ db: () => db, store: () => store, service: () => svc, afterSend: () => {}, print: async () => ({ ok: true }) })
    expect(batches.batchForm().maxCount).toBe(5)
    expect(await batches.createBatch({ routerId: 1, categoryId: 1, distributorId: null, count: 6 }, 'b1')).toEqual({ ok: false, error: { code: 'count_invalid' } })
  })
})
