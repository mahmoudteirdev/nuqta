// عمليات شاشة الموزعين والكشف. كل وحدة بتاخذ opKey من الواجهة، فالضغط المزدوج بيسجل مرة وحدة.

import type { ActionError, ActionResult, Backend } from '@shared/api'
import { settlement, summarize } from '@shared/ledger'
import { isAgorot } from '@shared/money'
import type { Db } from '../db/db'
import { accountData, usageCards } from '../db/queries'
import type { Store, StoreResult } from '../db/store'
import { readRules } from '../rules'


function result<T, U>(r: StoreResult<T>, map: (v: T) => U): ActionResult<U> {
  return r.ok ? { ok: true, value: map(r.value) } : { ok: false, error: r.error as ActionError }
}

type AccountBackend = Pick<Backend,
  'account' | 'usageCards' | 'addDistributor' | 'settle' | 'correctSettlement' | 'returnCards' | 'openDispute' | 'closeDispute' | 'setCreditLimit'>

export function accountActions(ctx: {
  db: () => Db
  store: () => Store
  routerUp: () => boolean
  /** بعد مرتجع: بينفذ الطابور فورا إذا الراوتر راد. */
  afterChange: () => void
  now?: () => string
}): AccountBackend {
  const now = ctx.now ?? (() => new Date().toISOString())
  return {
    account: (id) => accountData(ctx.db(), ctx.store(), id, now()),

    usageCards: (entryId) => usageCards(ctx.db(), entryId),

    addDistributor: (d, opKey) => {
      if (!d.name.trim()) return { ok: false, error: { code: 'name_required' } }
      const limit = readRules(ctx.store()).defaultCreditLimitAg
      return result(ctx.store().addDistributor({ name: d.name, area: d.area.trim(), creditLimitAg: limit, openingAg: d.openingAg }, opKey), (v) => ({ id: v.id }))
    },

    settle: (id, paidAg, allowExtra, opKey) => {
      const store = ctx.store()
      // الطلب المكرر بعد ما انحفظ ما بيرجع يسأل: بيرجع نفس النتيجة.
      if (!allowExtra && !store.hasOp(opKey)) {
        const plan = settlement(store.entries(id), id, paidAg, opKey)
        if (!plan.ok) return { ok: false, error: plan.error }
        if (plan.value.extraAg > 0) return { ok: true, value: { kind: 'confirm', paidAg, dueAg: plan.value.dueAg, extraAg: plan.value.extraAg } }
      }
      const r = store.settle(id, paidAg, opKey)
      if (!r.ok) return { ok: false, error: r.error }
      // من الرصيد بعد الحفظ، فالطلب المكرر بيرجع نفس الأرقام.
      const paid = r.value.entry.paidAg
      const after = summarize(store.entries(id)).owedAg
      return {
        ok: true,
        value: { kind: 'saved', entryId: r.value.entry.id, paidAg: paid, extraAg: after < 0 ? Math.min(paid, -after) : 0, remainingAg: Math.max(after, 0) }
      }
    },

    correctSettlement: (id, entryId, opKey) => result(ctx.store().correct(id, entryId, '', opKey), (v) => ({ entryId: v.entry.id })),

    returnCards: (id, codes, opKey) => {
      const r = ctx.store().returnCards(id, codes, opKey)
      if (r.ok) ctx.afterChange()
      return result(r, (v) => ({ count: -v.entries.reduce((a, e) => a + e.cardsDelta, 0), routerUp: ctx.routerUp() }))
    },

    openDispute: (id, note, opKey) => result(ctx.store().openDispute(id, note, opKey), (v) => ({ entryId: v.entry.id })),

    closeDispute: (id, opKey) => result(ctx.store().closeDispute(id, '', opKey), (v) => ({ entryId: v.entry.id })),

    setCreditLimit: (id, limitAg) => {
      if (!isAgorot(limitAg) || limitAg <= 0) return { ok: false, error: { code: 'amount_invalid' } }
      return ctx.store().setCreditLimit(id, limitAg) ? { ok: true, value: undefined } : { ok: false, error: { code: 'not_found' } }
    }
  }
}
