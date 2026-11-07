// دفتر الموزع. HANDOFF القسم 5 هو المرجع، وكل قاعدة هون معلّم رقمها.
//
// الدفتر إضافة بس (القاعدة 1): كل دالة هون بترجع حركة جديدة، وما في دالة بتعدل أو بتحذف.
// التصحيح حركة عكسية مربوطة بالأصلية. قاعدة البيانات بتمنع UPDATE وDELETE بـtrigger (الخطوة 3).
//
// الدوال صافية: ما بتعرف شي عن الوقت ولا قاعدة البيانات ولا الراوتر. المتصل بيعطيها الحركات الموجودة،
// وبتعطيه الحركة الجديدة أو خطأ.

import { isAgorot, multiply, type Agorot } from './money'

export type EntryType =
  | 'opening'
  | 'delivery'
  | 'usage'
  | 'settlement'
  | 'return'
  | 'correction'
  | 'dispute_open'
  | 'dispute_close'

/**
 * متى بينشأ الدين على الموزع (القاعدة 3، مؤقت).
 * on_use: عند استخدام الكرت. هذا سلوك النموذج.
 * on_delivery: عند التسليم.
 * السياسة بتنحفظ على حركة التسليم نفسها، فتغيير سياسة الموزع ما بيغير كروت انسلمت قبل.
 */
export type DebtPolicy = 'on_use' | 'on_delivery'

export interface LedgerEntry {
  id: string
  distributorId: string
  type: EntryType
  /** موجب للتسليم، سالب للاستخدام والمرتجع. */
  cardsDelta: number
  /** بالأغورة. موجب بيزيد اللي عليه. */
  chargeAg: Agorot
  /** بالأغورة. موجب بينقص اللي عليه. التصحيح ممكن يكون سالب. */
  paidAg: Agorot
  /** للتصحيح: الحركة الأصلية. لسكر الخلاف: حركة فتحه. */
  refId: string | null
  batchId: string | null
  /** سياسة الدين وقت التسليم. للتسليم بس. */
  policy: DebtPolicy | null
  note: string
  /** مفتاح العملية. نفس المفتاح مرتين بيعني نفس الطلب، وما بينسجل مرة ثانية (القاعدة 9). */
  opKey: string
  createdAt: string
  createdBy: string
}

/** الحركة قبل ما تنحفظ: الدفتر بيعطيها رقم ووقت. */
export type NewEntry = Omit<LedgerEntry, 'id' | 'createdAt' | 'createdBy'>

/** سعر الدفعة، ثابت من لحظة توليدها (القاعدة 7). */
export interface BatchPrice {
  id: string
  wholeAg: Agorot
}

export type LedgerError =
  | { code: 'amount_invalid' }
  | { code: 'count_invalid' }
  | { code: 'return_over'; held: number }
  | { code: 'usage_over'; held: number }
  | { code: 'batch_not_delivered' }
  | { code: 'target_missing' }
  | { code: 'not_correctable' }
  | { code: 'already_corrected' }
  | { code: 'reason_required' }
  | { code: 'dispute_already_open' }
  | { code: 'no_open_dispute' }

export type Result<T> = { ok: true; value: T } | { ok: false; error: LedgerError }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: LedgerError): Result<T> => ({ ok: false, error })

function blank(distributorId: string, type: EntryType, opKey: string): NewEntry {
  return { distributorId, type, cardsDelta: 0, chargeAg: 0, paidAg: 0, refId: null, batchId: null, policy: null, note: '', opKey }
}

const isCount = (n: number): boolean => Number.isSafeInteger(n) && n > 0

// ───────────────────────── القراءة

export interface Summary {
  /** مستحق = مجموع المستحقات − مجموع المدفوع. الموجب عليه، والسالب رصيد له (القاعدة 2). */
  owedAg: Agorot
  chargedAg: Agorot
  paidAg: Agorot
  /** قيمة المستخدم، بدون الرصيد الافتتاحي (القاعدة 5). */
  usedValueAg: Agorot
  delivered: number
  used: number
  returned: number
  /** كروت عنده = المسلّم − المستخدم − المرتجع (القاعدة 4). */
  held: number
  openDisputeId: string | null
}

export function summarize(entries: readonly LedgerEntry[]): Summary {
  const s: Summary = { owedAg: 0, chargedAg: 0, paidAg: 0, usedValueAg: 0, delivered: 0, used: 0, returned: 0, held: 0, openDisputeId: null }
  const typeOf = new Map<string, EntryType>()
  for (const e of entries) {
    typeOf.set(e.id, e.type)
    s.chargedAg += e.chargeAg
    s.paidAg += e.paidAg
    s.held += e.cardsDelta
    // التصحيح بينحسب مع نوع الحركة الأصلية.
    const kind = e.type === 'correction' && e.refId !== null ? (typeOf.get(e.refId) ?? e.type) : e.type
    if (kind !== 'opening') s.usedValueAg += e.chargeAg
    if (kind === 'delivery') s.delivered += e.cardsDelta
    if (kind === 'usage') s.used -= e.cardsDelta
    if (kind === 'return') s.returned -= e.cardsDelta
    if (e.type === 'dispute_open') s.openDisputeId = e.id
    if (e.type === 'dispute_close') s.openDisputeId = null
  }
  s.owedAg = s.chargedAg - s.paidAg
  return s
}

/** الرصيد بعد كل حركة، للكشف. */
export function runningBalances(entries: readonly LedgerEntry[]): Agorot[] {
  let run = 0
  return entries.map((e) => (run += e.chargeAg - e.paidAg))
}

interface BatchState {
  held: number
  /** الدين انحسب عند التسليم، فالاستخدام ما بينحسب مرة ثانية والمرتجع بيرجع قيمته. */
  chargedOnDelivery: boolean
}

function batchState(entries: readonly LedgerEntry[], batchId: string): BatchState | null {
  let found = false
  let held = 0
  let chargedOnDelivery = false
  for (const e of entries) {
    if (e.batchId !== batchId) continue
    if (e.type === 'delivery') {
      found = true
      chargedOnDelivery = e.policy === 'on_delivery'
    }
    held += e.cardsDelta
  }
  return found ? { held, chargedOnDelivery } : null
}

// ───────────────────────── الحركات

export function opening(distributorId: string, amountAg: Agorot, opKey: string): Result<NewEntry> {
  if (!isAgorot(amountAg) || amountAg < 0) return fail({ code: 'amount_invalid' })
  return ok({ ...blank(distributorId, 'opening', opKey), chargeAg: amountAg, note: 'رصيد افتتاحي' })
}

export function delivery(distributorId: string, batch: BatchPrice, count: number, policy: DebtPolicy, opKey: string): Result<NewEntry> {
  if (!isCount(count)) return fail({ code: 'count_invalid' })
  return ok({
    ...blank(distributorId, 'delivery', opKey),
    cardsDelta: count,
    chargeAg: policy === 'on_delivery' ? multiply(batch.wholeAg, count) : 0,
    batchId: batch.id,
    policy
  })
}

/** الاستخدام بيوصل من الراوتر. السعر من الدفعة، مش من الفئة اليوم (القاعدة 7). */
export function usage(entries: readonly LedgerEntry[], distributorId: string, batch: BatchPrice, count: number, opKey: string): Result<NewEntry> {
  if (!isCount(count)) return fail({ code: 'count_invalid' })
  const b = batchState(entries, batch.id)
  if (!b) return fail({ code: 'batch_not_delivered' })
  if (count > b.held) return fail({ code: 'usage_over', held: b.held })
  return ok({
    ...blank(distributorId, 'usage', opKey),
    cardsDelta: -count,
    chargeAg: b.chargedOnDelivery ? 0 : multiply(batch.wholeAg, count),
    batchId: batch.id
  })
}

export function returnCards(entries: readonly LedgerEntry[], distributorId: string, batch: BatchPrice, count: number, opKey: string): Result<NewEntry> {
  if (!isCount(count)) return fail({ code: 'count_invalid' })
  const b = batchState(entries, batch.id)
  if (!b) return fail({ code: 'batch_not_delivered' })
  if (count > b.held) return fail({ code: 'return_over', held: b.held })
  return ok({
    ...blank(distributorId, 'return', opKey),
    cardsDelta: -count,
    chargeAg: b.chargedOnDelivery ? -multiply(batch.wholeAg, count) : 0,
    batchId: batch.id
  })
}

export interface SettlementPlan {
  entry: NewEntry
  /** المستحق قبل التسوية، وما بينزل تحت صفر. */
  dueAg: Agorot
  /** الزيادة اللي بتصير رصيد له. إذا أكبر من صفر، الواجهة لازم تسأل قبل (حوار dlg.overpay). */
  extraAg: Agorot
  /** الباقي عليه بعد التسوية. */
  remainingAg: Agorot
}

export function settlement(entries: readonly LedgerEntry[], distributorId: string, paidAg: Agorot, opKey: string): Result<SettlementPlan> {
  if (!isAgorot(paidAg) || paidAg <= 0) return fail({ code: 'amount_invalid' })
  const dueAg = Math.max(summarize(entries).owedAg, 0)
  return ok({
    entry: { ...blank(distributorId, 'settlement', opKey), paidAg },
    dueAg,
    extraAg: Math.max(paidAg - dueAg, 0),
    remainingAg: Math.max(dueAg - paidAg, 0)
  })
}

/**
 * التصحيح للمال بس. حركات الكروت (تسليم، استخدام، مرتجع) مربوطة بأكواد وحالتها على الراوتر،
 * وعكسها بالدفتر لحاله بيخلي الدفتر يختلف عن الكروت. تصليحها بيصير بعملية على الأكواد نفسها.
 */
const CORRECTABLE: ReadonlySet<EntryType> = new Set(['opening', 'settlement'])

/**
 * حركة عكسية للحركة target، مربوطة بالأصلية.
 * آخر حركة مالية بتتصحح بدون سبب، زي النموذج. الأقدم منها لازم سبب (مقترح في HANDOFF القسم 7).
 * الحركة ما بتتصحح مرتين.
 */
export function correction(entries: readonly LedgerEntry[], targetId: string, reason: string, opKey: string): Result<NewEntry> {
  const target = entries.find((e) => e.id === targetId)
  if (!target) return fail({ code: 'target_missing' })
  if (!CORRECTABLE.has(target.type)) return fail({ code: 'not_correctable' })
  if (entries.some((e) => e.type === 'correction' && e.refId === targetId)) return fail({ code: 'already_corrected' })

  // آخر حركة بتأثر على الرصيد أو الكروت، والتصحيح منها. بعد تصحيح آخر تسوية، اللي قبلها صارت قديمة.
  const last = [...entries].reverse().find((e) => e.type !== 'dispute_open' && e.type !== 'dispute_close')
  const note = reason.trim()
  if (last?.id !== targetId && !note) return fail({ code: 'reason_required' })

  return ok({
    ...blank(target.distributorId, 'correction', opKey),
    chargeAg: -target.chargeAg,
    paidAg: -target.paidAg,
    refId: target.id,
    note
  })
}

/** الخلاف ما بيغير الرصيد. بيتسجل بالكشف، وبيظهر مهمة لحين حله. */
export function disputeOpen(entries: readonly LedgerEntry[], distributorId: string, note: string, opKey: string): Result<NewEntry> {
  if (summarize(entries).openDisputeId) return fail({ code: 'dispute_already_open' })
  return ok({ ...blank(distributorId, 'dispute_open', opKey), note: note.trim() })
}

export function disputeClose(entries: readonly LedgerEntry[], distributorId: string, note: string, opKey: string): Result<NewEntry> {
  const openId = summarize(entries).openDisputeId
  if (!openId) return fail({ code: 'no_open_dispute' })
  return ok({ ...blank(distributorId, 'dispute_close', opKey), refId: openId, note: note.trim() })
}

/** الموزع فوق السقف: تحذير بس، وصاحب الشبكة بيقرر (HANDOFF القسم 7). */
export function isOverLimit(entries: readonly LedgerEntry[], creditLimitAg: Agorot): boolean {
  return summarize(entries).owedAg > creditLimitAg
}

// ───────────────────────── دفتر بالذاكرة

/**
 * دفتر بالذاكرة بنفس قواعد قاعدة البيانات: إضافة بس، وidempotent بمفتاح العملية.
 * للاختبارات وللواجهة لحين ما تنبني قاعدة البيانات.
 */
export class MemoryLedger {
  #entries: LedgerEntry[] = []
  #byOpKey = new Map<string, LedgerEntry>()
  #seq = 0

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  /** بيضيف الحركة. إذا نفس opKey انسجل قبل، بيرجع الحركة القديمة وما بيضيف شي. */
  append(entry: NewEntry, createdBy = 'owner'): { entry: LedgerEntry; duplicate: boolean } {
    if (!entry.opKey) throw new Error('opKey is required')
    const prev = this.#byOpKey.get(entry.opKey)
    if (prev) return { entry: prev, duplicate: true }
    for (const k of ['cardsDelta', 'chargeAg', 'paidAg'] as const) {
      if (!Number.isSafeInteger(entry[k])) throw new TypeError(`${k} must be an integer, got ${entry[k]}`)
    }
    const full: LedgerEntry = Object.freeze({ ...entry, id: String(++this.#seq), createdAt: this.clock(), createdBy })
    this.#entries.push(full)
    this.#byOpKey.set(full.opKey, full)
    return { entry: full, duplicate: false }
  }

  /** حركات موزع واحد، بالترتيب. نسخة للقراءة بس. */
  of(distributorId: string): readonly LedgerEntry[] {
    return Object.freeze(this.#entries.filter((e) => e.distributorId === distributorId))
  }

  all(): readonly LedgerEntry[] {
    return Object.freeze([...this.#entries])
  }
}
