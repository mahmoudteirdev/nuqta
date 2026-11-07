import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { seedDemo } from '../dev/seed'
import { openDatabase, type Db } from './db'
import { reportCsv, reportsData } from './reports'
import { Store } from './store'

let db: Db
let store: Store
const NOW = new Date(2026, 10, 6, 14, 0)
const now = NOW.toISOString()

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  seedDemo(db, NOW)
  store = new Store(db, () => now)
})
afterEach(() => db.close())

const row = (r: ReturnType<typeof reportsData>, name: string) => r.collected.rows.find((x) => x.name === name)!

describe('collected vs used', () => {
  it('last 30 days, at each batch’s wholesale price; owed is today’s balance', () => {
    const r = reportsData(db, store, 30, now)
    // يوسف: 525 + 147 + 138 كرت × ₪2 = ₪1,620، ودفع ₪300 قبل 9 أيام (زي النموذج).
    expect(row(r, 'محل يوسف')).toMatchObject({ usedAg: shekels(1620), paidAg: shekels(300), owedAg: shekels(1320) })
    expect(row(r, 'سوبرماركت أبو خالد')).toMatchObject({ usedAg: shekels(2660), paidAg: shekels(1500), owedAg: shekels(1160) })
    expect(row(r, 'كشك الميناء')).toMatchObject({ usedAg: shekels(1120), paidAg: shekels(500), owedAg: shekels(620) })
    expect(row(r, 'مكتبة الأمل')).toMatchObject({ usedAg: shekels(1788), paidAg: shekels(1200), owedAg: shekels(588) })
    expect(r.collected).toMatchObject({ usedAg: shekels(7188), paidAg: shekels(3500), owedAg: shekels(3688) })
  })

  it('a shorter period leaves older usage and payments out, but not the balance', () => {
    const r = reportsData(db, store, 7, now)
    // استخدام أبو خالد الكبير كان قبل 7 أيام بالضبط، يعني برا آخر 7 أيام (من 31 أكتوبر).
    expect(row(r, 'سوبرماركت أبو خالد')).toMatchObject({ usedAg: shekels(180), paidAg: shekels(1500), owedAg: shekels(1160) })
    expect(row(r, 'محل يوسف')).toMatchObject({ usedAg: shekels(570), paidAg: 0 })
    expect(r.collected.owedAg).toBe(shekels(3688))
  })

  it('a correction today cancels the payment in the report too', () => {
    const y = store.distributors().find((d) => d.name === 'محل يوسف')!
    const s = store.settle(y.id, shekels(400), 'p1')
    if (!s.ok) throw new Error()
    expect(row(reportsData(db, store, 30, now), 'محل يوسف').paidAg).toBe(shekels(700))
    store.correct(y.id, s.value.entry.id, '', 'p2')
    expect(row(reportsData(db, store, 30, now), 'محل يوسف').paidAg).toBe(shekels(300))
  })
})

describe('commission', () => {
  it('per card from its own batch’s margin, not a single category for everyone', () => {
    const r = reportsData(db, store, 30, now)
    expect(r.commission.map((c) => [c.name, c.cards, c.commissionAg / 100])).toEqual([
      ['سوبرماركت أبو خالد', 1330, 1330], ['مكتبة الأمل', 894, 894], ['محل يوسف', 810, 810], ['كشك الميناء', 560, 560]
    ])
    // سعر جديد للفئة ما بيغير عمولة كروت انستخدمت من دفعات قديمة.
    store.setCategoryPrices(2, shekels(2), shekels(5))
    expect(reportsData(db, store, 30, now).commission[0]!.commissionAg).toBe(shekels(1330))
  })
})

describe('stale and returned', () => {
  it('cards delivered over 30 days ago and still unused count as stale', () => {
    const r = reportsData(db, store, 30, now)
    const by = Object.fromEntries(r.stale.map((s) => [s.name, [s.held, s.staleCards, s.returned]]))
    expect(by).toEqual({ 'محل يوسف': [90, 75, 0], 'سوبرماركت أبو خالد': [70, 70, 0], 'كشك الميناء': [140, 140, 0], 'مكتبة الأمل': [6, 6, 0] })
    expect(r.staleAfterDays).toBe(30)
  })
})

describe('CSV export', () => {
  it('opens in Excel: BOM, Arabic headers, plain shekel numbers, quoted when needed', () => {
    const r = reportsData(db, store, 30, now)
    const csv = reportCsv(r, 'collected')
    expect(csv.startsWith('﻿الموزع,المستخدم ₪,المحصّل ₪,الفرق ₪,نسبة التحصيل\r\n')).toBe(true)
    expect(csv).toContain('محل يوسف,1620.00,300.00,1320.00,19%\r\n')
    expect(csv.trimEnd().split('\r\n').at(-1)).toBe('المجموع,7188.00,3500.00,3688.00,')
    const tricky = { ...r, commission: [{ id: '9', name: 'محل "النور", فرع 2', cards: 1, commissionAg: 150 }] }
    expect(reportCsv(tricky, 'commission')).toContain('"محل ""النور"", فرع 2",1,1.50')
  })
})
