// التقارير. كل المبالغ من الدفتر أو من سعر الدفعة المثبت، عشان التقرير والكشف يحكوا نفس الشي.

import type { ReportsData, ReportTab } from '@shared/api'
import { formatMoney } from '@shared/money'
import type { ReportJob } from '@shared/print'
import type { Db } from './db'
import { startOfLocalDay } from './queries'
import type { Store } from './store'
import { readRules } from '../rules'

/** بداية الفترة: أول اليوم قبل days يوم. null = من البداية. */
export function periodStart(now: string, days: number | null): string {
  if (days === null) return '0000'
  const d = new Date(now)
  return startOfLocalDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1)).toISOString())
}

export function reportsData(db: Db, store: Store, days: number | null, now: string): ReportsData {
  const since = periodStart(now, days)
  const staleAfter = readRules(store).staleAfterDays
  const staleBefore = new Date(new Date(now).getTime() - staleAfter * 86_400_000).toISOString()
  const dists = store.distributors().sort((a, b) => b.summary.owedAg - a.summary.owedAg)

  const used = new Map(
    db.all<{ d: number; v: number; n: number; m: number }>(
      `SELECT b.distributor_id d, sum(b.whole_ag) v, count(*) n, sum(b.sale_ag - b.whole_ag) m
       FROM cards c JOIN batches b ON b.id = c.batch_id
       WHERE b.distributor_id IS NOT NULL AND c.first_used_at >= ? GROUP BY b.distributor_id`,
      since
    ).map((r) => [String(r.d), r])
  )
  const paid = new Map(
    db.all<{ d: number; v: number }>(
      "SELECT distributor_id d, sum(paid_ag) v FROM ledger WHERE type IN ('settlement', 'correction') AND created_at >= ? GROUP BY distributor_id",
      since
    ).map((r) => [String(r.d), r.v])
  )
  const cardsBy = new Map(
    db.all<{ d: number; held: number; ret: number; stale: number; last: string | null }>(
      `SELECT b.distributor_id d,
         sum(c.status = 'delivered') held,
         sum(c.status = 'returned') ret,
         sum(c.status = 'delivered' AND c.delivered_at < ?) stale,
         max(c.delivered_at) last
       FROM cards c JOIN batches b ON b.id = c.batch_id WHERE b.distributor_id IS NOT NULL GROUP BY b.distributor_id`,
      staleBefore
    ).map((r) => [String(r.d), r])
  )

  const rows = dists.map((d) => ({
    id: d.id, name: d.name, usedAg: used.get(d.id)?.v ?? 0, paidAg: paid.get(d.id) ?? 0, owedAg: Math.max(d.summary.owedAg, 0)
  }))

  return {
    days,
    collected: {
      usedAg: rows.reduce((a, r) => a + r.usedAg, 0),
      paidAg: rows.reduce((a, r) => a + r.paidAg, 0),
      owedAg: rows.reduce((a, r) => a + r.owedAg, 0),
      rows
    },
    commission: dists
      .map((d) => ({ id: d.id, name: d.name, cards: used.get(d.id)?.n ?? 0, commissionAg: used.get(d.id)?.m ?? 0 }))
      .sort((a, b) => b.commissionAg - a.commissionAg),
    stale: dists.map((d) => {
      const c = cardsBy.get(d.id)
      return { id: d.id, name: d.name, held: c?.held ?? 0, returned: c?.ret ?? 0, staleCards: c?.stale ?? 0, lastDeliveryAt: c?.last ?? null }
    }),
    staleAfterDays: staleAfter
  }
}

const money = (ag: number) => (ag / 100).toFixed(2)
const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV بـUTF-8 مع BOM، عشان Excel يفتح العربي صح. المال رقم بالشيكل بخانتين. */
export function reportCsv(r: ReportsData, tab: ReportTab): string {
  let lines: (string | number)[][]
  if (tab === 'collected') {
    lines = [['الموزع', 'المستخدم ₪', 'المحصّل ₪', 'الفرق ₪', 'نسبة التحصيل']]
    for (const x of r.collected.rows) lines.push([x.name, money(x.usedAg), money(x.paidAg), money(x.owedAg), x.usedAg ? `${Math.min(Math.round((x.paidAg / x.usedAg) * 100), 100)}%` : ''])
    lines.push(['المجموع', money(r.collected.usedAg), money(r.collected.paidAg), money(r.collected.owedAg), ''])
  } else if (tab === 'commission') {
    lines = [['الموزع', 'كروت مستخدمة', 'العمولة التقديرية ₪']]
    for (const x of r.commission) lines.push([x.name, x.cards, money(x.commissionAg)])
  } else {
    lines = [['الموزع', 'كروت عنده', `راكدة أكثر من ${r.staleAfterDays} يوم`, 'مرتجعة', 'آخر تسليم']]
    for (const x of r.stale) lines.push([x.name, x.held, x.staleCards, x.returned, x.lastDeliveryAt?.slice(0, 10) ?? ''])
  }
  return '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'
}

const dayMonth = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long' })

/** التقرير جاهز للطباعة: نفس أعمدة الشاشة كنص. */
export function reportJob(r: ReportsData, tab: ReportTab, networkName: string, now: string): ReportJob {
  const period = r.days === null ? 'من البداية' : r.days === 7 ? 'آخر 7 أيام' : `آخر ${r.days} يوم`
  const base = { kind: 'report' as const, networkName, printedAt: now }
  if (tab === 'collected') {
    return {
      ...base, title: 'المحصّل مقابل المستخدم', subtitle: `${period}، بسعر الجملة`,
      columns: ['الموزع', 'المستخدم', 'المحصّل', 'الفرق', 'نسبة التحصيل'], numeric: [1, 2, 3, 4],
      rows: r.collected.rows.map((x) => [x.name, formatMoney(x.usedAg), formatMoney(x.paidAg), formatMoney(x.owedAg), x.usedAg ? `${Math.min(Math.round((x.paidAg / x.usedAg) * 100), 100)}%` : '—']),
      footer: ['المجموع', formatMoney(r.collected.usedAg), formatMoney(r.collected.paidAg), formatMoney(r.collected.owedAg), '']
    }
  }
  if (tab === 'commission') {
    return {
      ...base, title: 'عمولة الموزعين', subtitle: `${period}. فرق سعر البيع عن الجملة لكل كرت، بسعر دفعته.`,
      columns: ['الموزع', 'كروت مستخدمة', 'العمولة التقديرية'], numeric: [1, 2],
      rows: r.commission.map((x) => [x.name, x.cards.toLocaleString('en-US'), formatMoney(x.commissionAg)])
    }
  }
  return {
    ...base, title: 'كروت راكدة ومرتجعة', subtitle: `الوضع الحالي. الراكد: انسلم من أكثر من ${r.staleAfterDays} يوم ولسا ما انستخدم.`,
    columns: ['الموزع', 'كروت عنده', 'راكدة', 'مرتجعة', 'آخر تسليم'], numeric: [1, 2, 3],
    rows: r.stale.map((x) => [x.name, String(x.held), String(x.staleCards), String(x.returned), x.lastDeliveryAt ? dayMonth.format(new Date(x.lastDeliveryAt)) : '—'])
  }
}
