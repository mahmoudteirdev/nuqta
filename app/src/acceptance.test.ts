// اختبارات القبول لأول نسخة (HANDOFF القسم 12). كل اختبار اسمه رقم البند.
// البنود 8 و9 و10 بدها طابعة وإنسان ومستخدمين: تفاصيلها بـACCEPTANCE.md.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normCode, num } from '@shared/input'
import { summarize } from '@shared/ledger'
import { shekels } from '@shared/money'
import { accountActions } from './main/actions/account'
import { batchActions } from './main/actions/batch'
import { openDatabase, type Db } from './main/db/db'
import { Store } from './main/db/store'
import { seedDemo } from './main/dev/seed'
import { MockRouter } from './main/router/mock'
import { RouterService } from './main/router/service'
import { RouterError, type NewHotspotUser } from './main/router/types'

function fresh(): { db: Db; store: Store } {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  return { db: r.db, store: new Store(r.db) }
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
}

describe('HANDOFF 12', () => {
  it('1. 1,000 random operations on the real database: owed equals the ledger sum, every amount an integer', async () => {
    const { db, store } = fresh()
    const router = new MockRouter({ firstSendRate: 1 })
    const svc = new RouterService(store, router)
    store.addRouter({ name: 'R', host: 'h' })
    const cats = [store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: 150, saleAg: 299 }),
      store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: 233, saleAg: 350 })]
    const dists = ['a', 'b', 'c'].map((n, i) => {
      const d = store.addDistributor({ name: n, creditLimitAg: 0, debtPolicy: i === 2 ? 'on_delivery' : 'on_use', openingAg: 1000 * i }, `d${n}`)
      if (!d.ok) throw new Error()
      return d.value.id
    })
    const r = rng(2026)
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
    const held = new Map<string, string[]>(dists.map((d) => [d, []]))
    for (let i = 0; i < 1000; i++) {
      const d = pick(dists)
      const k = r()
      if (k < 0.15) {
        const b = store.createBatch({ categoryId: pick(cats), routerId: 1, distributorId: d, count: 1 + Math.floor(r() * 20) }, `b${i}`)
        if (!b.ok) continue
        await svc.sendBatch(b.value.batch.id)
        store.printBatch(b.value.batch.id, 'a4-12', 'owner', 'new')
        store.deliverBatch(b.value.batch.id, `dv${i}`)
        held.get(d)!.push(...store.batchCodes(b.value.batch.id, 'delivered'))
      } else if (k < 0.45) {
        const mine = held.get(d)!
        for (const c of mine.splice(0, Math.floor(r() * 5))) router.use(c, 60)
        await svc.syncUsage()
      } else if (k < 0.55) {
        const mine = held.get(d)!
        if (mine.length) store.returnCards(d, mine.splice(0, 1 + Math.floor(r() * 2)), `r${i}`)
      } else if (k < 0.9) {
        // مبالغ بكسور زي 0.29 اللي بتخرّب الـfloat.
        store.settle(d, 1 + Math.floor(r() * 4999), `s${i}`)
      } else {
        const last = [...store.entries(d)].reverse().find((e) => e.type === 'settlement')
        if (last) store.correct(d, last.id, 'سبب', `c${i}`)
      }
    }
    for (const d of dists) {
      const sql = db.get<{ owed: number; held: number; bad: number }>(
        `SELECT sum(charge_ag - paid_ag) owed, sum(cards_delta) held,
           sum(typeof(charge_ag) <> 'integer' OR typeof(paid_ag) <> 'integer' OR typeof(cards_delta) <> 'integer') bad
         FROM ledger WHERE distributor_id = ?`, Number(d))!
      const s = summarize(store.entries(d))
      expect(s.owedAg).toBe(sql.owed)
      expect(sql.bad).toBe(0)
      expect(Number.isSafeInteger(s.owedAg)).toBe(true)
      const cards = db.get<{ n: number }>("SELECT count(*) n FROM cards c JOIN batches b ON b.id = c.batch_id WHERE b.distributor_id = ? AND c.status = 'delivered'", Number(d))!.n
      expect(s.held).toBe(cards)
      expect(s.held).toBe(sql.held)
    }
    expect(db.get<{ n: number }>('SELECT count(*) n FROM ledger')!.n).toBeGreaterThan(400)
    // ثقيل عن قصد: ألف عملية على قاعدة بيانات حقيقية. لحاله ثانيتين، ومع باقي الاختبارات أكثر.
  }, 30_000)

  it('2. changing a category price changes no old amount', () => {
    const { db, store } = fresh()
    seedDemo(db, new Date(2026, 10, 6, 14))
    const snapshot = () => ({
      ledger: db.all('SELECT id, charge_ag, paid_ag FROM ledger ORDER BY id'),
      batches: db.all('SELECT id, whole_ag, sale_ag FROM batches ORDER BY id'),
      owed: store.distributors().map((d) => d.summary.owedAg)
    })
    const before = snapshot()
    for (const c of store.categories()) store.setCategoryPrices(c.id, c.wholeAg * 3, c.saleAg * 3)
    expect(snapshot()).toEqual(before)
  })

  it('3. no way from the app or the database to change or delete a ledger entry', () => {
    const { db, store } = fresh()
    store.addDistributor({ name: 'x', creditLimitAg: 0, openingAg: 500 }, 'o')
    expect(() => db.run('UPDATE ledger SET charge_ag = 1')).toThrow(/append-only/)
    expect(() => db.run('DELETE FROM ledger')).toThrow(/append-only/)
    expect(() => db.run('UPDATE ledger SET note = ? WHERE 1', 'x')).toThrow(/append-only/)
    // البرنامج نفسه: الكتابة الوحيدة على الدفتر بكل الكود هي INSERT.
    const src = resolve(__dirname, 'main')
    const files = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.ts') && !f.endsWith('.test.ts') ? [join(d, f)] : []))
    })(src)
    const writes = files.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\b(UPDATE|DELETE\s+FROM|INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO)\s+ledger\b/gi)].map((m) => m[1]!.toUpperCase().split(/\s+/)[0]))
    expect(writes).toEqual(['INSERT'])
  })

  it('4. router cut in the middle of sending a batch: no card printed before it is confirmed, no code lost', async () => {
    const { db, store } = fresh()
    store.addRouter({ name: 'R', host: 'h' })
    store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: shekels(1), saleAg: shekels(2) })
    const real = new MockRouter({ firstSendRate: 1 })
    // راوتر بيوصل نص الأكواد وبعدين بينقطع.
    let cutAfter: number | null = 40
    const flaky = Object.assign(Object.create(real) as MockRouter, {
      addUsers: async (users: readonly NewHotspotUser[]) => {
        if (cutAfter === null) return real.addUsers(users)
        await real.addUsers(users.slice(0, cutAfter))
        cutAfter = null
        real.up = false
        throw new RouterError('closed', 'connection reset')
      },
      users: () => real.users()
    })
    const printed: string[] = []
    const api = batchActions({
      db: () => db, store: () => store, service: () => new RouterService(store, flaky), afterSend: () => {},
      print: async (job) => { printed.push(...job.codes); return { ok: true } }
    })
    const sent = await api.createBatch({ routerId: 1, categoryId: 1, distributorId: null, count: 100 }, 'b')
    if (!sent.ok) throw new Error()
    expect(sent.value).toMatchObject({ routerDown: true, view: { toPrint: 0, pending: 100 } })
    expect(await api.printBatch(sent.value.view.id, 'new')).toEqual({ ok: false, error: { code: 'nothing_to_print' } })
    const codes = store.batchCodes(sent.value.view.id)
    expect(new Set(codes).size).toBe(100)

    // الراوتر رجع: إعادة الإرسال بتكمل بنفس الأكواد، واللي وصل قبل الانقطاع ما بيتكرر.
    real.up = true
    const again = await api.resendBatch(sent.value.view.id)
    expect(again.ok && again.value.view).toMatchObject({ toPrint: 100, pending: 0 })
    await api.printBatch(sent.value.view.id, 'new')
    expect(printed.sort()).toEqual([...codes].sort())
    expect((await real.users()).length).toBe(100)
  })

  it('5. a full day without connection, then sync: nothing counted twice', async () => {
    const { db, store } = fresh()
    seedDemo(db, new Date(2026, 10, 6, 14))
    const router = new MockRouter({ firstSendRate: 1 })
    const svc = new RouterService(store, router)
    const d = store.distributors().find((x) => x.name === 'محل يوسف')!
    const b = store.createBatch({ categoryId: 2, routerId: 1, distributorId: d.id, count: 50 }, 'day')
    if (!b.ok) throw new Error()
    await svc.sendBatch(b.value.batch.id)
    store.printBatch(b.value.batch.id, 'a4-12')
    store.deliverBatch(b.value.batch.id, 'dday')
    const before = summarize(store.entries(d.id))
    router.up = false
    expect((await svc.syncUsage()).ok).toBe(false)
    for (const c of b.value.codes.slice(0, 30)) router.use(c, 3600)
    router.up = true
    for (let i = 0; i < 3; i++) await svc.syncUsage()
    const after = summarize(store.entries(d.id))
    expect(after.used - before.used).toBe(30)
    expect(after.owedAg - before.owedAg).toBe(30 * shekels(2))
  })

  it('6. pressing «سجّل التسوية» twice fast records once, even when both requests run together', async () => {
    const { db, store } = fresh()
    const d = store.addDistributor({ name: 'x', creditLimitAg: 0, openingAg: shekels(500) }, 'o')
    if (!d.ok) throw new Error()
    const api = accountActions({ db: () => db, store: () => store, routerUp: () => true, afterChange: () => {} })
    const [a, b] = await Promise.all([Promise.resolve(api.settle(d.value.id, shekels(200), false, 'same')), Promise.resolve(api.settle(d.value.id, shekels(200), false, 'same'))])
    expect(a).toEqual(b)
    expect(store.entries(d.value.id).filter((e) => e.type === 'settlement')).toHaveLength(1)
    expect(summarize(store.entries(d.value.id)).owedAg).toBe(shekels(300))
  })

  it('7. every num() and normCode() example in section 5 matches the prototype', () => {
    // التفصيل الكامل، و20,000 مدخل عشوائي مقارنة بنسخة النموذج نفسها: src/shared/input.test.ts.
    expect(['١٬٣٢٠', '۱۲۳', '1,320', '12.5', '12,5', '₪300'].map(num)).toEqual([1320, 123, 1320, 12.5, 12.5, 300])
    expect(['1e5', '0x10', '1.234'].map(num).every(Number.isNaN)).toBe(true)
    expect([normCode('7k4f92qm'), normCode('ؤث٣لا92قم')]).toEqual(['7K4F-92QM', 'CE3B-92RL'])
  })
})
