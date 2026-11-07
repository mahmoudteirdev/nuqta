// شاشة الاستيراد: معاينة الملف أول، وبعدين التسجيل بخيارات المستخدم.

import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { Backend } from '@shared/api'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import { commitImport, ImportError, parseImport, planImport, type ImportPlan } from '../importer'

/** UTF-8 أول. Excel العربي على Windows كثير بيحفظ CSV بـWindows-1256. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1256').decode(bytes)
  }
}

export function importActions(ctx: {
  db: () => Db
  store: () => Store
  pickFile: () => Promise<{ name: string; bytes: Uint8Array } | null>
  /** بعد التسجيل: الطابور بيعلّم الكروت على الراوتر. */
  afterImport: () => void
  now?: () => string
}): Pick<Backend, 'importPreview' | 'importCommit'> {
  const now = ctx.now ?? (() => new Date().toISOString())
  // المعاينة بتضل بالذاكرة لحد التسجيل. الملف ما بينقرا مرتين.
  const plans = new Map<string, ImportPlan>()

  return {
    importPreview: async () => {
      const file = await ctx.pickFile()
      if (!file) return { ok: true, value: { cancelled: true } }
      const parsed = parseImport(decodeCsv(file.bytes))
      if (!parsed.rows.length) return { ok: false, error: { code: 'import_empty' } }
      const plan = planImport(ctx.db(), ctx.store(), parsed)
      const token = randomUUID()
      plans.clear()
      plans.set(token, plan)
      return {
        ok: true,
        value: {
          token, fileName: basename(file.name), total: parsed.rows.length, fresh: plan.fresh.length,
          duplicates: plan.duplicates, invalid: plan.invalid, groups: plan.groups
        }
      }
    },

    importCommit: (token, choice, opKey) => {
      const plan = plans.get(token)
      if (!plan) return { ok: false, error: { code: 'import_expired' } }
      try {
        const r = commitImport(ctx.db(), ctx.store(), plan, choice, opKey, now())
        if (r.imported) ctx.afterImport()
        return { ok: true, value: { imported: r.imported, skipped: r.skipped, batches: r.batches } }
      } catch (e) {
        if (e instanceof ImportError) return { ok: false, error: { code: e.code } }
        throw e
      }
    }
  }
}
