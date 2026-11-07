// أول تشغيل: ربط الراوتر ← الفئات والأسعار ← الموزعين والأرصدة ← كرت تجربة.
// الخطوة بتنحفظ، فإذا البرنامج انسكر بالنص بيرجع لنفس المكان.

import type { ActionError, Backend, SetupCategoryDraft, SetupStep } from '@shared/api'
import { isAgorot } from '@shared/money'
import type { Store } from '../db/store'
import type { RouterService } from '../router/service'
import { parseUptime } from '../router/types'

const STEP = 'setup_step'
const DONE = 'setup_done'
const TEST_BATCH = 'setup_test_batch'

/** أول تشغيل لازم إذا ما خلص قبل وما في فئات. قاعدة بيانات فيها شغل ما بتنسأل من جديد. */
export function setupState(store: Store): { needed: boolean; step: SetupStep } {
  const needed = store.getSetting(DONE) !== '1' && store.categories().length === 0 && store.distributors().length === 0
  const step = Number(store.getSetting(STEP) ?? 1)
  return { needed, step: (step >= 1 && step <= 4 ? step : 1) as SetupStep }
}

/** اسم عربي ووقت مقترح من اسم ملف الراوتر. المستخدم بيقدر يغيرهم. */
export function draftFor(profile: string): Omit<SetupCategoryDraft, 'wholeAg' | 'saleAg'> {
  const p = profile.trim().toLowerCase()
  const known: Record<string, [string, string]> = {
    '1h': ['ساعة', '1h'], hour: ['ساعة', '1h'], '2h': ['ساعتين', '2h'], '3h': ['3 ساعات', '3h'],
    day: ['يوم كامل', '1d'], '1d': ['يوم كامل', '1d'], week: ['أسبوع', '7d'], '7d': ['أسبوع', '7d'], '1w': ['أسبوع', '7d'],
    month: ['شهر', '30d'], '30d': ['شهر', '30d']
  }
  const k = known[p]
  if (k) return { name: k[0], profile, limitUptime: k[1] }
  return { name: profile, profile, limitUptime: parseUptime(p) > 0 ? p : '' }
}

type SetupBackend = Pick<Backend, 'setupCategories' | 'saveSetupCategories' | 'setSetupStep' | 'setupTestCard' | 'finishSetup'>

export function setupActions(ctx: { store: () => Store; service: () => RouterService }): SetupBackend {
  return {
    setupCategories: async () => {
      const store = ctx.store()
      const saved = store.categories().map((c) => ({ id: c.id, name: c.name, routerProfile: c.routerProfile, wholeAg: c.wholeAg, saleAg: c.saleAg }))
      const info = await ctx.service().test()
      if (!info.ok) return { drafts: null, saved }
      // الفئة المحفوظة قبل بترجع بسعرها، والجديدة فاضية.
      const drafts = info.value.profiles
        .filter((p) => p.toLowerCase() !== 'default')
        .map((p) => {
          const s = saved.find((c) => c.routerProfile === p)
          const d = draftFor(p)
          return { ...d, name: s?.name ?? d.name, wholeAg: s?.wholeAg ?? 0, saleAg: s?.saleAg ?? 0 }
        })
      return { drafts, saved }
    },

    saveSetupCategories: (rows) => {
      const store = ctx.store()
      // الصف بدون سعر جملة ما بينحفظ: يعني صاحب الشبكة ما بيبيع هالفئة.
      const used = rows.filter((r) => r.wholeAg > 0)
      if (!used.length) return { ok: false, error: { code: 'setup_no_category' } }
      for (const r of used) {
        if (!r.name.trim()) return { ok: false, error: { code: 'category_name' } }
        if (!isAgorot(r.wholeAg) || !isAgorot(r.saleAg) || r.saleAg <= 0) return { ok: false, error: { code: 'amount_invalid' } }
        if (r.limitUptime && !(parseUptime(r.limitUptime) > 0)) return { ok: false, error: { code: 'setup_uptime', codes: [r.profile] } as ActionError }
      }
      const existing = store.categories()
      for (const r of used) {
        const e = existing.find((c) => c.routerProfile === r.profile)
        if (e) store.setCategoryPrices(e.id, r.wholeAg, r.saleAg)
        else store.addCategory({ name: r.name.trim(), routerProfile: r.profile, limitUptime: r.limitUptime || null, wholeAg: r.wholeAg, saleAg: r.saleAg })
      }
      store.setSetting(STEP, '3')
      return { ok: true, value: { count: used.length } }
    },

    setSetupStep: (step) => ctx.store().setSetting(STEP, String(step)),

    setupTestCard: async () => {
      const store = ctx.store()
      const prev = Number(store.getSetting(TEST_BATCH) ?? 0)
      let batchId = prev && store.batch(prev) ? prev : 0
      if (!batchId) {
        const cat = store.categories()[0]
        const router = store.routers()[0]
        if (!cat || !router) return { ok: false, error: { code: 'setup_incomplete' } }
        const b = store.createBatch({ categoryId: cat.id, routerId: router.id, distributorId: null, count: 1 }, `setup-test-${Date.now()}`)
        if (!b.ok) return { ok: false, error: b.error as ActionError }
        batchId = b.value.batch.id
        store.setSetting(TEST_BATCH, String(batchId))
      }
      const sent = await ctx.service().sendBatch(batchId)
      const code = store.batchCodes(batchId)[0]!
      if (!sent.ok) return { ok: true, value: { code, confirmed: false } }
      return { ok: true, value: { code, confirmed: sent.value.confirmed > 0 } }
    },

    finishSetup: () => {
      const store = ctx.store()
      store.setSetting(DONE, '1')
      store.setSetting(STEP, '1')
    }
  }
}
