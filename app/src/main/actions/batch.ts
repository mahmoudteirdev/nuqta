// عمليات شاشة توليد الدفعة: توليد ← إرسال ← تأكيد ← طباعة ← تسليم (HANDOFF القسم 6).

import type { ActionError, ActionResult, Backend, BatchView, SendOutcomeView } from '@shared/api'
import type { CardsJob } from '@shared/print'
import type { PrintOutcome } from '../print'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import type { RouterService } from '../router/service'
import { readRules } from '../rules'
import { readTemplate } from './cards'


type BatchBackend = Pick<Backend, 'batchForm' | 'batchView' | 'createBatch' | 'resendBatch' | 'printBatch' | 'deliverBatch'>

export function batchView(db: Db, batchId: number): BatchView | null {
  const b = db.get<{
    id: number; no: number; status: BatchView['stage']; count: number; whole_ag: number; sale_ag: number
    router: string; cat: string; did: number | null; dname: string | null; policy: BatchView['debtPolicy']; rid: number; kid: number
  }>(
    `SELECT b.id, b.no, b.status, b.router_id rid, b.category_id kid, b.count, b.whole_ag, b.sale_ag, r.name router, k.name cat, d.id did, d.name dname, d.debt_policy policy
     FROM batches b JOIN routers r ON r.id = b.router_id JOIN categories k ON k.id = b.category_id
     LEFT JOIN distributors d ON d.id = b.distributor_id WHERE b.id = ?`,
    batchId
  )
  if (!b) return null
  const n = Object.fromEntries(
    db.all<{ status: string; n: number }>('SELECT status, count(*) n FROM cards WHERE batch_id = ? GROUP BY status', batchId).map((r) => [r.status, r.n])
  )
  const times = db.get<{ n: number }>('SELECT count(*) n FROM print_log WHERE batch_id = ?', batchId)!.n
  const preview = db.all<{ code: string; status: string }>('SELECT code, status FROM cards WHERE batch_id = ? ORDER BY rowid LIMIT 6', batchId)
  // الكروت المؤكدة أول عشان المعاينة تبين اللي رح ينطبع، وبعدها اللي بالانتظار.
  const order = (s: string) => (s === 'pending' || s === 'generated' ? 1 : 0)
  return {
    id: b.id,
    no: b.no,
    stage: b.status,
    routerId: b.rid,
    categoryId: b.kid,
    routerName: b.router,
    categoryName: b.cat,
    distributorId: b.did === null ? null : String(b.did),
    distributorName: b.dname,
    debtPolicy: b.policy,
    count: b.count,
    wholeAg: b.whole_ag,
    saleAg: b.sale_ag,
    toPrint: n['confirmed'] ?? 0,
    toDeliver: n['printed'] ?? 0,
    delivered: (n['delivered'] ?? 0) + (n['active'] ?? 0) + (n['expired'] ?? 0) + (n['returned'] ?? 0),
    pending: (n['pending'] ?? 0) + (n['generated'] ?? 0),
    printedTimes: times,
    preview: [...preview].sort((x, y) => order(x.status) - order(y.status)).map((c) => ({ code: c.code, ready: order(c.status) === 0 }))
  }
}

export function batchActions(ctx: {
  db: () => Db
  store: () => Store
  service: () => RouterService
  /** بعد الإرسال: حالة الراوتر بالشريط لازم تتحدث. */
  afterSend: (routerUp: boolean) => void
  /** بيطبع فعلا (نافذة الطباعة). بالاختبار بيكون وهمي. */
  print: (job: CardsJob) => Promise<PrintOutcome>
  /** بعد انتهاء التجربة بدون ترخيص: توليد دفعات جديدة بيوقف بس. */
  canGenerate?: () => boolean
}): BatchBackend {
  const view = (id: number) => batchView(ctx.db(), id)!

  const send = async (batchId: number): Promise<ActionResult<SendOutcomeView>> => {
    const r = await ctx.service().sendBatch(batchId)
    if (!r.ok) return { ok: false, error: { code: 'code' in r.error ? String(r.error.code) : 'router' } as ActionError }
    ctx.afterSend(!r.value.routerDown)
    return { ok: true, value: { view: view(batchId), routerDown: r.value.routerDown, rejected: r.value.rejected.length } }
  }

  return {
    batchForm: () => {
      const store = ctx.store()
      return {
        routers: ctx.db().all<{ id: number; name: string }>('SELECT id, name FROM routers ORDER BY id'),
        categories: store.categories().map((c) => ({ id: c.id, name: c.name, wholeAg: c.wholeAg, saleAg: c.saleAg })),
        distributors: store.distributors().map((d) => ({ id: d.id, name: d.name, owedAg: d.summary.owedAg, creditLimitAg: d.creditLimitAg, debtPolicy: d.debtPolicy })),
        maxCount: readRules(store).maxBatchCount,
        template: readTemplate(store).template
      }
    },

    batchView: (id) => batchView(ctx.db(), id),

    createBatch: async (b, opKey) => {
      if (ctx.canGenerate && !ctx.canGenerate()) return { ok: false, error: { code: 'license_required' } }
      const max = readRules(ctx.store()).maxBatchCount
      if (!Number.isSafeInteger(b.count) || b.count <= 0 || b.count > max) return { ok: false, error: { code: 'count_invalid' } }
      const r = ctx.store().createBatch(b, opKey)
      if (!r.ok) return { ok: false, error: r.error as ActionError }
      // الطلب المكرر بيرجع الدفعة نفسها بحالتها، بدون إرسال ثاني.
      if (r.value.duplicate) return { ok: true, value: { view: view(r.value.batch.id), routerDown: false, rejected: 0 } }
      return send(r.value.batch.id)
    },

    resendBatch: (id) => send(id),

    printBatch: async (id, scope) => {
      const r = await printCards(ctx.db(), ctx.store(), ctx.print, id, scope)
      return r.ok ? { ok: true, value: view(id) } : r
    },

    deliverBatch: (id, opKey) => {
      const r = ctx.store().deliverBatch(id, opKey)
      return r.ok ? { ok: true, value: { delivered: r.value.delivered, view: view(id) } } : { ok: false, error: r.error as ActionError }
    }
  }
}

/**
 * بيطبع ورقة الكروت، وبيسجل الطباعة بس إذا نجحت (HANDOFF القسم 7: «الطباعة فشلت: نفس الأكواد»).
 * بيسجل بالضبط الأكواد اللي انطبعت، حتى لو انأكد غيرها وهي بالطابعة.
 */
export async function printCards(
  db: Db,
  store: Store,
  print: (job: CardsJob) => Promise<PrintOutcome>,
  batchId: number,
  scope: 'new' | 'again' | 'all'
): Promise<ActionResult<{ codes: string[] }>> {
  const v = batchView(db, batchId)
  if (!v) return { ok: false, error: { code: 'not_found' } }
  const codes = store.printableCodes(batchId, scope)
  if (!codes.length) return { ok: false, error: { code: 'nothing_to_print' } }
  const tpl = readTemplate(store)
  const out = await print({
    kind: 'cards', template: tpl.template, networkName: tpl.networkName, phone: tpl.phone, showPrice: tpl.showPrice,
    categoryName: v.categoryName, saleAg: v.saleAg, batchNo: v.no, codes
  })
  if (!out.ok) return { ok: false, error: { code: out.reason === 'cancelled' ? 'print_cancelled' : 'print_failed' } }
  const r = store.printBatch(batchId, tpl.template, 'owner', scope, codes)
  return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error as ActionError }
}
