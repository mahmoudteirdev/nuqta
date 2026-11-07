// القيم المؤقتة (HANDOFF القسم 10). كلها بمكان واحد، وبتنحفظ بالإعدادات، وبتتغير من شاشة الإعدادات.

import type { Rules } from '@shared/api'
import { shekels } from '@shared/money'
import type { Store } from './db/store'

export const DEFAULT_RULES: Rules = {
  /** مهمة التحصيل بعد كم يوم من آخر تسوية. */
  collectAfterDays: 7,
  /** تنبيه المخزون لما يضل مع الموزع أقل من هيك من فئة. */
  stockLowCards: 10,
  /** الكرت المسلّم من أكثر من هيك يوم ولسا ما انستخدم بيعتبر راكد. */
  staleAfterDays: 30,
  /** سقف الدين للموزع الجديد ("1,000 ثابت" بالنموذج). */
  defaultCreditLimitAg: shekels(1000),
  /** أكبر دفعة، لحد ما نجرب أكثر على راوتر حقيقي. */
  maxBatchCount: 1000
}

const KEYS: Record<keyof Rules, string> = {
  collectAfterDays: 'collect_after_days',
  stockLowCards: 'stock_low_cards',
  staleAfterDays: 'stale_after_days',
  defaultCreditLimitAg: 'default_credit_limit_ag',
  maxBatchCount: 'max_batch_count'
}

/** الحدود المسموحة لكل قيمة. */
export const LIMITS: Record<keyof Rules, [number, number]> = {
  collectAfterDays: [1, 90],
  stockLowCards: [0, 1000],
  staleAfterDays: [7, 365],
  defaultCreditLimitAg: [0, shekels(1_000_000)],
  maxBatchCount: [1, 5000]
}

export function readRules(store: Store): Rules {
  const out = { ...DEFAULT_RULES }
  for (const k of Object.keys(KEYS) as (keyof Rules)[]) {
    const v = Number(store.getSetting(KEYS[k]))
    if (store.getSetting(KEYS[k]) !== null && Number.isSafeInteger(v)) out[k] = v
  }
  return out
}

export function invalidRule(r: Rules): keyof Rules | null {
  for (const k of Object.keys(KEYS) as (keyof Rules)[]) {
    const [lo, hi] = LIMITS[k]
    if (!Number.isSafeInteger(r[k]) || r[k] < lo || r[k] > hi) return k
  }
  return null
}

export function saveRules(store: Store, r: Rules): void {
  for (const k of Object.keys(KEYS) as (keyof Rules)[]) store.setSetting(KEYS[k], String(r[k]))
}
