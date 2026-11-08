// فحص كرت: ليش ما بيشتغل والخطوة الجاية. الحكم من سجلنا ومن الراوتر مع بعض.
// diagnose() صافية، فكل حالة إلها اختبار بـcard.test.ts.

import type { ActionError, Backend, CardCheck, CardEvent, CardVerdict } from '@shared/api'
import type { CardStatus } from '@shared/cards'
import { normCode } from '@shared/input'
import type { Db } from '../db/db'
import type { RouterService } from '../router/service'
import { parseUptime, type ActiveSession, type HotspotUser } from '../router/types'

export interface CardRecord {
  code: string
  status: CardStatus
  createdAt: string
  confirmedAt: string | null
  deliveredAt: string | null
  firstUsedAt: string | null
  firstMac: string | null
  returnedAt: string | null
  batchId: number
  batchNo: number
  categoryName: string
  limitUptime: string | null
  distributorName: string | null
  /** مرات الطباعة، وأول مرة. */
  printTimes: number
  firstPrintAt: string | null
}

/** null = الراوتر ما رد. */
export type RouterView = { user: HotspotUser | null; session: ActiveSession | null } | null

export function diagnose(c: CardRecord, r: RouterView): CardCheck {
  const limit = (r?.user as any)?.limitUptimeSeconds ?? (c.limitUptime ? parseUptime(c.limitUptime) || null : null)
  const uptime = r?.user?.uptimeSeconds ?? (c.firstUsedAt ? null : 0)
  const left = limit !== null && uptime !== null ? Math.max(limit - uptime, 0) : null

  let verdict: CardVerdict
  if (c.status === 'generated' || c.status === 'pending') verdict = 'not_on_router_yet'
  else if (c.status === 'returned') verdict = 'returned'
  else if (r && !r.user) verdict = 'missing_on_router'
  else if (r?.session) verdict = 'in_use'
  else if (r?.user?.disabled) verdict = 'disabled'
  else if (c.status === 'confirmed' || c.status === 'printed') verdict = 'not_delivered'
  else if (left === 0 && limit !== null && (uptime ?? 0) > 0) verdict = 'expired'
  else if (c.firstUsedAt || (uptime ?? 0) > 0 || c.status === 'active') verdict = 'used_time_left'
  else verdict = 'unused'

  const history: CardEvent[] = [{ kind: 'generated', at: c.createdAt }]
  if (c.confirmedAt) history.push({ kind: 'confirmed', at: c.confirmedAt })
  if (c.printTimes && c.firstPrintAt) history.push({ kind: 'printed', at: c.firstPrintAt, times: c.printTimes })
  if (c.deliveredAt) history.push({ kind: 'delivered', at: c.deliveredAt, to: c.distributorName })
  if (c.firstUsedAt) history.push({ kind: 'used', at: c.firstUsedAt, mac: c.firstMac })
  if (c.returnedAt) history.push({ kind: 'returned', at: c.returnedAt, from: c.distributorName })
  if (verdict === 'expired') history.push({ kind: 'expired' })

  return {
    code: c.code,
    verdict,
    routerChecked: r !== null,
    categoryName: c.categoryName,
    batchId: c.batchId,
    batchNo: c.batchNo,
    distributorName: c.distributorName,
    limitSeconds: limit,
    // الراوتر ما بيعرف الكرت، أو موقوف عندنا: الوقت الباقي مش معروف أو ما إله معنى.
    secondsLeft: verdict === 'returned' || verdict === 'not_on_router_yet' || verdict === 'missing_on_router' ? null : left,
    session: r?.session ? { id: r.session.id, mac: r.session.mac, address: r.session.address, uptimeSeconds: r.session.uptimeSeconds } : null,
    history
  }
}

export function cardRecord(db: Db, code: string): CardRecord | null {
  const raw = code.trim()
  const norm = normCode(code)
  const unhyphenated = raw.replace(/-/g, '')
  const r = db.get<{
    code: string; status: CardStatus; created_at: string; confirmed_at: string | null; delivered_at: string | null
    first_used_at: string | null; first_mac: string | null; returned_at: string | null; batch_id: number; no: number
    cat: string; limit_uptime: string | null; dist: string | null; times: number; first_print: string | null
  }>(
    `SELECT c.code, c.status, b.created_at, c.confirmed_at, c.delivered_at, c.first_used_at, c.first_mac, c.returned_at,
       c.batch_id, b.no, k.name cat, k.limit_uptime, d.name dist, c.printed_times times,
       (SELECT min(at) FROM print_log p WHERE p.batch_id = c.batch_id) first_print
     FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id
     LEFT JOIN distributors d ON d.id = b.distributor_id WHERE c.code = ? OR c.code = ? OR c.code = ?`,
    raw, norm, unhyphenated
  )
  return r
    ? {
        code: r.code, status: r.status, createdAt: r.created_at, confirmedAt: r.confirmed_at, deliveredAt: r.delivered_at,
        firstUsedAt: r.first_used_at, firstMac: r.first_mac, returnedAt: r.returned_at, batchId: r.batch_id, batchNo: r.no,
        categoryName: r.cat, limitUptime: r.limit_uptime, distributorName: r.dist, printTimes: r.times, firstPrintAt: r.first_print
      }
    : null
}

export function cardActions(ctx: { db: () => Db; service: () => RouterService }): Pick<Backend, 'checkCard' | 'kickSession' | 'extendCard'> {
  return {
    checkCard: async (raw) => {
      const found = cardRecord(ctx.db(), normCode(raw))
      if (!found) return null
      // الكود زي ما هو محفوظ: الكروت المستوردة ممكن تكون بأحرف صغيرة، والراوتر بيفرّق.
      const code = found.code
      const svc = ctx.service()
      // نسجل الاستخدام الجديد أول، عشان الحكم والكشف يحكوا نفس الشي.
      await svc.syncUsage()
      const look = await svc.lookup(code)
      return diagnose(cardRecord(ctx.db(), code)!, look.ok ? look.value : null)
    },

    extendCard: async (code: string, minutes: number) => {
      if (!code || minutes <= 0) return { ok: false, error: { code: 'validation' } }
      const norm = normCode(code)
      const found = cardRecord(ctx.db(), norm)
      if (!found) return { ok: false, error: { code: 'not_found' } }
      const r = await ctx.service().extendUserUptime(found.code, minutes * 60)
      if (!r.ok) return { ok: false, error: { code: 'code' in r.error ? String(r.error.code) : 'router' } as ActionError }
      return { ok: true, value: { newLimit: r.value.newLimit } }
    },

    kickSession: async (id) => {
      const r = await ctx.service().kick(id)
      if (r.ok) return { ok: true, value: undefined }
      return { ok: false, error: { code: 'code' in r.error ? String(r.error.code) : 'router' } as ActionError }
    }
  }
}
