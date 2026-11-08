// تبويبات الكروت: سجل الدفعات، الفئات والأسعار، وقوالب الطباعة.

import type { ActionError, Backend, BatchLogRow, PrintTemplate, TemplateSettings } from '@shared/api'
import { isAgorot } from '@shared/money'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import type { RouterService } from '../router/service'
import type { CardsJob } from '@shared/print'
import type { PrintOutcome } from '../print'
import { printCards } from './batch'

const TEMPLATES: readonly PrintTemplate[] = ['a4-12', 'a4-24', 'thermal']

export function readTemplate(store: Store): TemplateSettings {
  const t = store.getSetting('print_template') as PrintTemplate | null
  return {
    template: t && TEMPLATES.includes(t) ? t : 'a4-12',
    networkName: store.getSetting('network_name') ?? '',
    showPrice: store.getSetting('print_show_price') !== '0',
    phone: store.getSetting('support_phone') ?? '',
    bgImage: store.getSetting('print_bg_image') || null
  }
}

type CardsBackend = Pick<Backend,
  'batchLog' | 'reprintBatch' | 'categories' | 'setCategoryPrices' | 'addCategory' | 'updateCategory' | 'deleteCategory' | 'routerProfiles' | 'addRouterProfile' | 'templateSettings' | 'saveTemplateSettings'>

export function cardsActions(ctx: { db: () => Db; store: () => Store; service: () => RouterService; print: (job: CardsJob) => Promise<PrintOutcome> }): CardsBackend {
  const printedTimes = (id: number) => Number(ctx.db().get<{ n: number }>('SELECT count(*) n FROM print_log WHERE batch_id = ?', id)!.n)

  return {
    batchLog: () =>
      ctx.db().all<{
        id: number; no: number; cat: string; dist: string | null; count: number; used: number; pending: number
        printable: number; times: number; status: BatchLogRow['stage']; created_at: string
      }>(
        `SELECT b.id, b.no, k.name cat, d.name dist, b.count, b.status, b.created_at,
           (SELECT count(*) FROM cards c WHERE c.batch_id = b.id AND c.first_used_at IS NOT NULL) used,
           (SELECT count(*) FROM cards c WHERE c.batch_id = b.id AND c.status IN ('generated', 'pending')) pending,
           (SELECT count(*) FROM cards c WHERE c.batch_id = b.id AND c.status IN ('confirmed', 'printed', 'delivered')) printable,
           (SELECT count(*) FROM print_log p WHERE p.batch_id = b.id) times
         FROM batches b JOIN categories k ON k.id = b.category_id LEFT JOIN distributors d ON d.id = b.distributor_id
         ORDER BY b.no DESC LIMIT 500`
      ).map((r) => ({
        id: r.id, no: r.no, categoryName: r.cat, distributorName: r.dist, count: r.count, used: r.used, pending: r.pending,
        printedTimes: r.times, printable: r.printable > 0, stage: r.status, createdAt: r.created_at
      })),

    reprintBatch: async (id) => {
      const r = await printCards(ctx.db(), ctx.store(), ctx.print, id, 'all')
      return r.ok ? { ok: true, value: { printedTimes: printedTimes(id) } } : r
    },

    categories: () => ctx.store().categories().map((c) => ({ id: c.id, name: c.name, routerProfile: c.routerProfile, wholeAg: c.wholeAg, saleAg: c.saleAg })),

    setCategoryPrices: (id, wholeAg, saleAg) => {
      if (!isAgorot(wholeAg) || !isAgorot(saleAg) || wholeAg <= 0 || saleAg <= 0) return { ok: false, error: { code: 'amount_invalid' } }
      const r = ctx.store().setCategoryPrices(id, wholeAg, saleAg)
      return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error as ActionError }
    },

    addCategory: (c) => {
      const name = c.name.trim()
      if (!name) return { ok: false, error: { code: 'category_name' } }
      if (!isAgorot(c.wholeAg) || c.wholeAg <= 0) return { ok: false, error: { code: 'category_whole' } }
      if (!c.routerProfile.trim()) return { ok: false, error: { code: 'category_profile' } }
      // سعر البيع بيبدأ زي الجملة، والمستخدم بيحدده بعدين (زي النموذج).
      const id = ctx.store().addCategory({ name, routerProfile: c.routerProfile.trim(), limitUptime: null, wholeAg: c.wholeAg, saleAg: c.wholeAg })
      return { ok: true, value: { id } }
    },

    updateCategory: (id, c) => {
      const name = c.name.trim()
      if (!name) return { ok: false, error: { code: 'category_name' } }
      const r = ctx.store().updateCategory(id, { name, routerProfile: c.routerProfile?.trim() })
      return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error as ActionError }
    },

    deleteCategory: (id) => {
      const r = ctx.store().archiveCategory(id)
      return r.ok ? { ok: true, value: undefined } : { ok: false, error: r.error as ActionError }
    },

    addRouterProfile: async (p) => {
      const name = p.name.trim()
      if (!name) return { ok: false, error: { code: 'category_profile' } }
      const r = await ctx.service().addProfile({ name, rateLimit: p.rateLimit?.trim(), sharedUsers: p.sharedUsers })
      if (!r.ok) return { ok: false, error: { code: 'router_unreachable' } }
      return { ok: true, value: { name } }
    },

    routerProfiles: async () => {
      const r = await ctx.service().test()
      return r.ok ? r.value.profiles : null
    },

    templateSettings: () => readTemplate(ctx.store()),

    saveTemplateSettings: (t) => {
      if (!TEMPLATES.includes(t.template)) return { ok: false, error: { code: 'template' } }
      if (!t.networkName.trim()) return { ok: false, error: { code: 'network_name' } }
      const store = ctx.store()
      store.setSetting('print_template', t.template)
      store.setSetting('network_name', t.networkName.trim())
      store.setSetting('print_show_price', t.showPrice ? '1' : '0')
      store.setSetting('print_bg_image', t.bgImage ?? '')
      return { ok: true, value: undefined }
    }
  }
}
