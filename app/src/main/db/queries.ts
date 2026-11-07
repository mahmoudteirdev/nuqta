// قراءات الشاشات. القراءة بس: الكتابة كلها بـstore.ts.

import type { AccountData, HomeData, HomeTask, UsedCard } from '@shared/api'
import { runningBalances } from '@shared/ledger'
import type { Db } from './db'
import type { Store } from './store'
import { readRules } from '../rules'


/** رقم اليوم بالتوقيت المحلي، عشان «قبل كم يوم» تمشي على أيام التقويم مش 24 ساعة. */
export function localDay(iso: string): number {
  const d = new Date(iso)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

export function startOfLocalDay(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

export function homeData(
  db: Db,
  store: Store,
  o: { now: string; routerUp: boolean; collectAfterDays?: number; stockLowCards?: number }
): HomeData {
  const today = startOfLocalDay(o.now)
  const rules = readRules(store)
  const collectAfter = o.collectAfterDays ?? rules.collectAfterDays
  const stockLow = o.stockLowCards ?? rules.stockLowCards
  const daysSince = (iso: string) => localDay(o.now) - localDay(iso)

  const usageToday = db
    .all<{ d: number | null; name: string | null; v: number }>(
      `SELECT b.distributor_id d, ds.name, sum(CASE WHEN b.distributor_id IS NULL THEN b.sale_ag ELSE b.whole_ag END) v
       FROM cards c JOIN batches b ON b.id = c.batch_id LEFT JOIN distributors ds ON ds.id = b.distributor_id
       WHERE c.first_used_at >= ? GROUP BY b.distributor_id ORDER BY v DESC`,
      today
    )
    .map((r) => ({ distributorId: r.d === null ? null : String(r.d), name: r.name, valueAg: r.v }))

  const collected = db.get<{ v: number | null }>(
    "SELECT sum(paid_ag) v FROM ledger WHERE type IN ('settlement', 'correction') AND created_at >= ?", today
  )?.v ?? 0

  const dists = store.distributors()
  const tasks: HomeTask[] = []
  if (!o.routerUp) tasks.push({ kind: 'router' })

  for (const p of db.all<{ id: number; no: number; n: number }>(
    "SELECT b.id, b.no, count(*) n FROM cards c JOIN batches b ON b.id = c.batch_id WHERE c.status = 'pending' GROUP BY b.id ORDER BY b.no"
  )) tasks.push({ kind: 'pending', batchId: p.id, batchNo: p.no, pending: p.n })

  const lastSettle = new Map(
    // التسوية اللي انصححت ما بتنحسب: كأنها ما صارت.
    db.all<{ d: number; at: string }>(
      `SELECT distributor_id d, max(created_at) at FROM ledger WHERE type = 'settlement'
       AND id NOT IN (SELECT ref_ledger_id FROM ledger WHERE type = 'correction' AND ref_ledger_id IS NOT NULL) GROUP BY distributor_id`
    )
      .map((r) => [String(r.d), r.at])
  )
  for (const d of [...dists].sort((a, b) => b.summary.owedAg - a.summary.owedAg)) {
    const days = daysSince(lastSettle.get(d.id) ?? d.openedAt)
    if (d.summary.owedAg > 0 && days >= collectAfter) tasks.push({ kind: 'collect', distributorId: d.id, name: d.name, owedAg: d.summary.owedAg, days })
  }

  for (const s of db.all<{ d: number; name: string; cat: string; held: number }>(
    `SELECT b.distributor_id d, ds.name, k.name cat, sum(c.status = 'delivered') held
     FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id JOIN distributors ds ON ds.id = b.distributor_id
     WHERE c.delivered_at IS NOT NULL GROUP BY b.distributor_id, b.category_id HAVING held < ? ORDER BY held`,
    stockLow
  )) tasks.push({ kind: 'stock', distributorId: String(s.d), name: s.name, held: s.held, categoryName: s.cat })

  for (const d of dists) {
    if (!d.summary.openDisputeId) continue
    const at = db.get<{ created_at: string }>('SELECT created_at FROM ledger WHERE id = ?', Number(d.summary.openDisputeId))!.created_at
    tasks.push({ kind: 'dispute', distributorId: d.id, name: d.name, days: daysSince(at) })
  }

  return {
    usedTodayAg: usageToday.reduce((a, u) => a + u.valueAg, 0),
    collectedTodayAg: Math.max(collected, 0),
    owedTotalAg: dists.reduce((a, d) => a + Math.max(d.summary.owedAg, 0), 0),
    tasks,
    usageToday
  }
}

export function accountData(db: Db, store: Store, distributorId: string | null, now: string): AccountData {
  const all = store.distributors().sort((a, b) => b.summary.owedAg - a.summary.owedAg)
  const distributors = all.map((d) => ({ id: d.id, name: d.name, owedAg: d.summary.owedAg }))
  const d = all.find((x) => x.id === distributorId) ?? all[0]
  if (!d) return { distributors, current: null }

  const entries = store.entries(d.id)
  const balances = runningBalances(entries)
  const byId = new Map(entries.map((e) => [e.id, e]))
  const corrected = new Set(entries.filter((e) => e.type === 'correction' && e.refId).map((e) => e.refId!))
  const batchNo = new Map(
    db.all<{ id: number; no: number }>('SELECT DISTINCT b.id, b.no FROM batches b JOIN ledger l ON l.batch_id = b.id WHERE l.distributor_id = ?', Number(d.id))
      .map((r) => [String(r.id), r.no])
  )
  const lastSettlement = [...entries].reverse().find((e) => e.type === 'settlement' && !corrected.has(e.id))
  const last = [...entries].reverse().find((e) => e.type !== 'dispute_open' && e.type !== 'dispute_close')

  return {
    distributors,
    current: {
      id: d.id,
      name: d.name,
      area: d.area,
      creditLimitAg: d.creditLimitAg,
      debtPolicy: d.debtPolicy,
      daysSinceSettlement: lastSettlement ? localDay(now) - localDay(lastSettlement.createdAt) : null,
      held: d.summary.held,
      usedValueAg: d.summary.usedValueAg,
      paidAg: d.summary.paidAg,
      owedAg: d.summary.owedAg,
      openDispute: d.summary.openDisputeId !== null,
      entries: entries
        .map((e, i) => ({
          id: e.id,
          at: e.createdAt,
          type: e.type,
          refType: e.refId ? (byId.get(e.refId)?.type ?? null) : null,
          cardsDelta: e.cardsDelta,
          chargeAg: e.chargeAg,
          paidAg: e.paidAg,
          balanceAg: balances[i]!,
          batchNo: e.batchId ? (batchNo.get(e.batchId) ?? null) : null,
          note: e.note,
          corrected: corrected.has(e.id)
        }))
        .reverse(),
      correctable: last && last.type === 'settlement' && !corrected.has(last.id) ? { id: last.id, paidAg: last.paidAg } : null
    }
  }
}

export function usageCards(db: Db, entryId: string): { cards: UsedCard[]; total: number } {
  const cards = db.all<{ code: string; first_used_at: string; first_mac: string | null }>(
    'SELECT code, first_used_at, first_mac FROM cards WHERE usage_ledger_id = ? ORDER BY first_used_at, code LIMIT 50', Number(entryId)
  ).map((r) => ({ code: r.code, usedAt: r.first_used_at, mac: r.first_mac }))
  const total = Number(db.get<{ n: number }>('SELECT count(*) n FROM cards WHERE usage_ledger_id = ?', Number(entryId))!.n)
  return { cards, total }
}
