// كل القراءة والكتابة على قاعدة البيانات. القواعد المالية نفسها في @shared/ledger،
// وهون بنطبقها جوا معاملة وحدة عشان ما يصير سباق بين طلبين.

import type { BatchStatus, CardStatus } from '@shared/cards'
import { generateCodes, type RandomBytes } from '@shared/codes'
import {
  correction, delivery, disputeClose, disputeOpen, opening, returnCards, settlement, summarize, usage,
  type DebtPolicy, type LedgerEntry, type LedgerError, type NewEntry, type Result, type SettlementPlan, type Summary
} from '@shared/ledger'
import type { Agorot } from '@shared/money'
import type { Db } from './db'

export type StoreError =
  | LedgerError
  | { code: 'not_found'; what: string }
  | { code: 'nothing_to_print' }
  | { code: 'nothing_to_deliver' }
  | { code: 'not_held'; codes: string[] }
  | { code: 'batch_not_editable'; status: BatchStatus }

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError }

const ok = <T>(value: T): StoreResult<T> => ({ ok: true, value })
const fail = <T>(error: StoreError): StoreResult<T> => ({ ok: false, error })

interface LedgerRow {
  id: number
  distributor_id: number
  type: LedgerEntry['type']
  cards_delta: number
  charge_ag: number
  paid_ag: number
  ref_ledger_id: number | null
  batch_id: number | null
  policy: DebtPolicy | null
  note: string
  op_key: string
  created_at: string
  created_by: string
}

const toEntry = (r: LedgerRow): LedgerEntry => ({
  id: String(r.id),
  distributorId: String(r.distributor_id),
  type: r.type,
  cardsDelta: r.cards_delta,
  chargeAg: r.charge_ag,
  paidAg: r.paid_ag,
  refId: r.ref_ledger_id === null ? null : String(r.ref_ledger_id),
  batchId: r.batch_id === null ? null : String(r.batch_id),
  policy: r.policy,
  note: r.note,
  opKey: r.op_key,
  createdAt: r.created_at,
  createdBy: r.created_by
})

const idOrNull = (s: string | null): number | null => (s === null ? null : Number(s))

export interface Distributor {
  id: string
  name: string
  area: string
  creditLimitAg: Agorot
  debtPolicy: DebtPolicy
  openedAt: string
}

export interface Category {
  id: number
  name: string
  routerProfile: string
  limitUptime: string | null
  wholeAg: Agorot
  saleAg: Agorot
}

export interface Batch {
  id: number
  no: number
  categoryId: number
  routerId: number
  distributorId: number | null
  count: number
  wholeAg: Agorot
  saleAg: Agorot
  status: BatchStatus
  createdAt: string
}

export interface CardInfo {
  code: string
  status: CardStatus
  printedTimes: number
  confirmedAt: string | null
  deliveredAt: string | null
  firstUsedAt: string | null
  returnedAt: string | null
  batchNo: number
  batchId: number
  categoryName: string
  distributorId: number | null
  distributorName: string | null
}

const FIRST_BATCH_NO = 1001

export type PrintScope = 'new' | 'again' | 'all'
const PRINT_SCOPE: Record<PrintScope, readonly CardStatus[]> = {
  new: ['confirmed'],
  again: ['printed'],
  all: ['confirmed', 'printed', 'delivered']
}

export class Store {
  /** مين بيكتب هلأ: u:<id> للمستخدم الداخل. الدخول بيغيره. */
  actor = 'owner'

  constructor(
    private readonly db: Db,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly random?: RandomBytes
  ) {}

  /** معاملة بترجع نتيجة. خطأ قاعدة بنص الطريق (RollbackWith) بيلغي كل اللي انكتب وبيرجع fail. */
  private atomic<T>(fn: () => StoreResult<T>): StoreResult<T> {
    try {
      return this.db.tx(fn)
    } catch (e) {
      if (e instanceof RollbackWith) return fail(e.error)
      throw e
    }
  }

  // ───────────────────────── الإعدادات

  getSetting(key: string): string | null {
    return this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.run('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  // ───────────────────────── الراوترات والفئات

  routers(): { id: number; name: string; host: string; port: number; lastSeenAt: string | null }[] {
    return this.db.all<{ id: number; name: string; host: string; port: number; last_seen_at: string | null }>('SELECT * FROM routers ORDER BY id')
      .map((r) => ({ id: r.id, name: r.name, host: r.host, port: r.port, lastSeenAt: r.last_seen_at }))
  }

  updateRouter(id: number, r: { name?: string; host?: string; port?: number; lastSeenAt?: string }): void {
    const cur = this.routers().find((x) => x.id === id)
    if (!cur) return
    this.db.run('UPDATE routers SET name = ?, host = ?, port = ?, last_seen_at = ? WHERE id = ?',
      r.name ?? cur.name, r.host ?? cur.host, r.port ?? cur.port, r.lastSeenAt ?? cur.lastSeenAt, id)
  }

  addRouter(r: { name: string; host: string; port?: number }): number {
    return this.db.run('INSERT INTO routers(name, host, port) VALUES (?, ?, ?)', r.name, r.host, r.port ?? 8729).id
  }

  addCategory(c: Omit<Category, 'id'>): number {
    return this.db.run(
      'INSERT INTO categories(name, router_profile, limit_uptime, whole_ag, sale_ag) VALUES (?, ?, ?, ?, ?)',
      c.name, c.routerProfile, c.limitUptime, c.wholeAg, c.saleAg
    ).id
  }

  /** تغيير السعر ما بيلمس الدفعات القديمة. البيع أقل من الجملة تحذير بدون منع. */
  setCategoryPrices(id: number, wholeAg: Agorot, saleAg: Agorot): StoreResult<{ saleBelowWhole: boolean }> {
    const r = this.db.run('UPDATE categories SET whole_ag = ?, sale_ag = ? WHERE id = ?', wholeAg, saleAg, id)
    if (!r.changes) return fail({ code: 'not_found', what: 'category' })
    return ok({ saleBelowWhole: saleAg < wholeAg })
  }

  categories(): Category[] {
    return this.db.all<{ id: number; name: string; router_profile: string; limit_uptime: string | null; whole_ag: number; sale_ag: number }>(
      'SELECT * FROM categories WHERE archived_at IS NULL ORDER BY id'
    ).map((r) => ({ id: r.id, name: r.name, routerProfile: r.router_profile, limitUptime: r.limit_uptime, wholeAg: r.whole_ag, saleAg: r.sale_ag }))
  }

  /** حذف الفئة إذا ما عليها دفعات، أو أرشفتها لحفظ السجلات والدفعات القديمة. */
  archiveCategory(id: number): StoreResult<void> {
    const hasBatches = this.db.get<{ c: number }>('SELECT count(*) c FROM batches WHERE category_id = ?', id)?.c ?? 0
    if (hasBatches === 0) {
      this.db.run('DELETE FROM categories WHERE id = ?', id)
    } else {
      this.db.run("UPDATE categories SET archived_at = datetime('now') WHERE id = ?", id)
    }
    return ok(undefined)
  }

  /** تعديل اسم الفئة أو ملفها على الراوتر. */
  updateCategory(id: number, c: { name: string; routerProfile?: string }): StoreResult<void> {
    const name = c.name.trim()
    if (!name) return fail({ code: 'category_name' })
    const prev = this.db.get<{ name: string; router_profile: string }>('SELECT name, router_profile FROM categories WHERE id = ? AND archived_at IS NULL', id)
    if (!prev) return fail({ code: 'not_found', what: 'category' })
    const profile = c.routerProfile?.trim() || prev.router_profile
    this.db.run('UPDATE categories SET name = ?, router_profile = ? WHERE id = ?', name, profile, id)
    return ok(undefined)
  }

  // ───────────────────────── الموزعين

  /** بيضيف الموزع مع رصيده الافتتاحي بمعاملة وحدة. نفس opKey مرتين بيرجع نفس الموزع. */
  addDistributor(
    d: { name: string; area?: string; creditLimitAg: Agorot; debtPolicy?: DebtPolicy; openingAg?: Agorot },
    opKey: string,
    by = this.actor
  ): StoreResult<{ id: string; duplicate: boolean }> {
    return this.atomic<{ id: string; duplicate: boolean }>(() => {
      const prev = this.db.get<{ distributor_id: number }>('SELECT distributor_id FROM ledger WHERE op_key = ?', opKey)
      if (prev) return ok({ id: String(prev.distributor_id), duplicate: true })
      const id = this.db.run(
        'INSERT INTO distributors(name, area, credit_limit_ag, debt_policy, opened_at) VALUES (?, ?, ?, ?, ?)',
        d.name.trim(), d.area ?? '', d.creditLimitAg, d.debtPolicy ?? 'on_use', this.clock()
      ).id
      const entry = opening(String(id), d.openingAg ?? 0, opKey)
      if (!entry.ok) throw new RollbackWith(entry.error)
      this.insertEntry(entry.value, by)
      return ok({ id: String(id), duplicate: false })
    })
  }

  distributor(id: string): Distributor | null {
    const r = this.db.get<{ id: number; name: string; area: string; credit_limit_ag: number; debt_policy: DebtPolicy; opened_at: string }>(
      'SELECT * FROM distributors WHERE id = ?', Number(id)
    )
    return r ? { id: String(r.id), name: r.name, area: r.area, creditLimitAg: r.credit_limit_ag, debtPolicy: r.debt_policy, openedAt: r.opened_at } : null
  }

  distributors(): (Distributor & { summary: Summary })[] {
    return this.db.all<{ id: number }>('SELECT id FROM distributors ORDER BY id').map((r) => {
      const d = this.distributor(String(r.id))!
      return { ...d, summary: summarize(this.entries(d.id)) }
    })
  }

  setCreditLimit(id: string, ag: Agorot): boolean {
    return this.db.run('UPDATE distributors SET credit_limit_ag = ? WHERE id = ?', ag, Number(id)).changes === 1
  }

  /** بتأثر على التسليمات الجاية بس. كل تسليم بيحفظ سياسته. */
  setDebtPolicy(id: string, policy: DebtPolicy): boolean {
    return this.db.run('UPDATE distributors SET debt_policy = ? WHERE id = ?', policy, Number(id)).changes === 1
  }

  // ───────────────────────── الدفتر

  entries(distributorId: string): LedgerEntry[] {
    return this.db.all<LedgerRow>('SELECT * FROM ledger WHERE distributor_id = ? ORDER BY id', Number(distributorId)).map(toEntry)
  }

  /** هل الطلب هذا انسجل قبل؟ */
  hasOp(opKey: string): boolean {
    return this.entryByOpKey(opKey) !== null
  }

  private entryByOpKey(opKey: string): LedgerEntry | null {
    const r = this.db.get<LedgerRow>('SELECT * FROM ledger WHERE op_key = ?', opKey)
    return r ? toEntry(r) : null
  }

  private insertEntry(e: NewEntry, by: string): LedgerEntry {
    const id = this.db.run(
      `INSERT INTO ledger(distributor_id, type, cards_delta, charge_ag, paid_ag, ref_ledger_id, batch_id, policy, note, op_key, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Number(e.distributorId), e.type, e.cardsDelta, e.chargeAg, e.paidAg, idOrNull(e.refId), idOrNull(e.batchId), e.policy, e.note, e.opKey, this.clock(), by
    ).id
    return toEntry(this.db.get<LedgerRow>('SELECT * FROM ledger WHERE id = ?', id)!)
  }

  /**
   * بيسجل حركة وحدة بمعاملة: بيقرأ الدفتر، بيطبق القاعدة، وبيضيف.
   * إذا opKey انسجل قبل، بيرجع الحركة القديمة بدون ما يعيد الحساب (القاعدة 9).
   */
  record(
    distributorId: string,
    opKey: string,
    build: (entries: LedgerEntry[]) => Result<NewEntry>,
    by = this.actor
  ): StoreResult<{ entry: LedgerEntry; duplicate: boolean }> {
    return this.db.tx(() => {
      const prev = this.entryByOpKey(opKey)
      if (prev) return ok({ entry: prev, duplicate: true })
      if (!this.distributor(distributorId)) return fail({ code: 'not_found', what: 'distributor' })
      const r = build(this.entries(distributorId))
      if (!r.ok) return fail(r.error)
      return ok({ entry: this.insertEntry(r.value, by), duplicate: false })
    })
  }

  settle(distributorId: string, paidAg: Agorot, opKey: string, by = this.actor): StoreResult<{ entry: LedgerEntry; duplicate: boolean; plan: SettlementPlan | null }> {
    let plan: SettlementPlan | null = null
    const r = this.record(distributorId, opKey, (es) => {
      const p = settlement(es, distributorId, paidAg, opKey)
      if (!p.ok) return p
      plan = p.value
      return { ok: true, value: p.value.entry }
    }, by)
    return r.ok ? ok({ ...r.value, plan }) : r
  }

  correct(distributorId: string, targetId: string, reason: string, opKey: string, by = this.actor) {
    return this.record(distributorId, opKey, (es) => correction(es, targetId, reason, opKey), by)
  }

  openDispute(distributorId: string, note: string, opKey: string, by = this.actor) {
    return this.record(distributorId, opKey, (es) => disputeOpen(es, distributorId, note, opKey), by)
  }

  closeDispute(distributorId: string, note: string, opKey: string, by = this.actor) {
    return this.record(distributorId, opKey, (es) => disputeClose(es, distributorId, note, opKey), by)
  }

  // ───────────────────────── الدفعات والكروت

  /**
   * بيولد دفعة بأكواد جديدة، وبيثبت سعر الفئة عليها (القاعدة 7).
   * distributorId = null يعني بيع مباشر.
   */
  createBatch(
    b: { categoryId: number; routerId: number; distributorId: string | null; count: number },
    opKey: string
  ): StoreResult<{ batch: Batch; codes: string[]; duplicate: boolean }> {
    if (!Number.isSafeInteger(b.count) || b.count <= 0) return fail({ code: 'count_invalid' })
    return this.db.tx(() => {
      const prev = this.db.get<{ id: number }>('SELECT id FROM batches WHERE op_key = ?', opKey)
      if (prev) return ok({ batch: this.batch(prev.id)!, codes: this.batchCodes(prev.id), duplicate: true })

      const cat = this.db.get<{ whole_ag: number; sale_ag: number }>('SELECT whole_ag, sale_ag FROM categories WHERE id = ? AND archived_at IS NULL', b.categoryId)
      if (!cat) return fail({ code: 'not_found', what: 'category' })
      if (b.distributorId !== null && !this.distributor(b.distributorId)) return fail({ code: 'not_found', what: 'distributor' })

      const no = Number(this.db.get<{ n: number | null }>('SELECT max(no) AS n FROM batches')?.n ?? FIRST_BATCH_NO - 1) + 1
      const id = this.db.run(
        `INSERT INTO batches(no, category_id, router_id, distributor_id, count, whole_ag, sale_ag, op_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        no, b.categoryId, b.routerId, idOrNull(b.distributorId), b.count, cat.whole_ag, cat.sale_ag, opKey, this.clock()
      ).id

      const exists = this.db.raw.prepare('SELECT 1 FROM cards WHERE code = ?')
      const codes = generateCodes(b.count, (c) => exists.get(c) !== undefined, this.random)
      const insert = this.db.raw.prepare('INSERT INTO cards(code, batch_id) VALUES (?, ?)')
      for (const c of codes) insert.run(c, id)
      return ok({ batch: this.batch(id)!, codes, duplicate: false })
    })
  }

  batch(id: number): Batch | null {
    const r = this.db.get<{ id: number; no: number; category_id: number; router_id: number; distributor_id: number | null; count: number; whole_ag: number; sale_ag: number; status: BatchStatus; created_at: string }>(
      'SELECT * FROM batches WHERE id = ?', id
    )
    return r
      ? { id: r.id, no: r.no, categoryId: r.category_id, routerId: r.router_id, distributorId: r.distributor_id, count: r.count, wholeAg: r.whole_ag, saleAg: r.sale_ag, status: r.status, createdAt: r.created_at }
      : null
  }

  batchCodes(id: number, status?: CardStatus): string[] {
    const rows = status
      ? this.db.all<{ code: string }>('SELECT code FROM cards WHERE batch_id = ? AND status = ? ORDER BY rowid', id, status)
      : this.db.all<{ code: string }>('SELECT code FROM cards WHERE batch_id = ? ORDER BY rowid', id)
    return rows.map((r) => r.code)
  }

  /** اللي لازم ينبعت للراوتر من الدفعة: الجديد واللي بالانتظار، مع فئة الراوتر. */
  sendList(batchId: number): { no: number; profile: string; limitUptime: string | null; codes: string[] } | null {
    const r = this.db.get<{ no: number; router_profile: string; limit_uptime: string | null }>(
      'SELECT b.no, k.router_profile, k.limit_uptime FROM batches b JOIN categories k ON k.id = b.category_id WHERE b.id = ?', batchId
    )
    if (!r) return null
    const codes = this.db.all<{ code: string }>("SELECT code FROM cards WHERE batch_id = ? AND status IN ('generated', 'pending') ORDER BY rowid", batchId)
    return { no: r.no, profile: r.router_profile, limitUptime: r.limit_uptime, codes: codes.map((c) => c.code) }
  }

  codesWithStatus(statuses: readonly CardStatus[]): string[] {
    if (!statuses.length) return []
    return this.db.all<{ code: string }>(`SELECT code FROM cards WHERE status IN (${statuses.map(() => '?').join(', ')}) ORDER BY rowid`, ...statuses).map((r) => r.code)
  }

  setBatchStatus(id: number, status: BatchStatus): void {
    this.db.run('UPDATE batches SET status = ? WHERE id = ?', status, id)
  }

  /**
   * نتيجة الإرسال للراوتر: المؤكد بيصير confirmed، والباقي pending لإعادة الإرسال بنفس الكود.
   * الدفعة بتصير sent حتى لو المؤكد صفر (الراوتر مقطوع): الدفعة محفوظة والطباعة معطلة.
   */
  applySendResult(batchId: number, confirmedCodes: readonly string[]): StoreResult<{ confirmed: number; pending: number }> {
    return this.db.tx(() => {
      const b = this.batch(batchId)
      if (!b) return fail({ code: 'not_found', what: 'batch' })
      if (b.status === 'done') return fail({ code: 'batch_not_editable', status: b.status })
      if (b.status !== 'sending') this.setBatchStatus(batchId, 'sending')
      const now = this.clock()
      const confirm = this.db.raw.prepare(
        "UPDATE cards SET status = 'confirmed', confirmed_at = ? WHERE code = ? AND batch_id = ? AND status IN ('generated', 'pending')"
      )
      for (const c of confirmedCodes) confirm.run(now, c, batchId)
      this.db.run("UPDATE cards SET status = 'pending' WHERE batch_id = ? AND status = 'generated'", batchId)
      this.setBatchStatus(batchId, 'sent')
      const n = (s: CardStatus) => Number(this.db.get<{ n: number }>('SELECT count(*) AS n FROM cards WHERE batch_id = ? AND status = ?', batchId, s)!.n)
      return ok({ confirmed: n('confirmed'), pending: n('pending') })
    })
  }

  /**
   * بيطبع المؤكد بس. إعادة الطباعة بنفس الأكواد، وبتنسجل كل مرة.
   * scope: new = المؤكد اللي لسا ما انطبع، again = المطبوع اللي لسا ما انسلم (الورقة طلعت غلط)،
   * all = كل الكروت المؤكدة بالدفعة، لإعادة طباعة مقصودة من سجل الدفعات.
   */
  /** الأكواد اللي رح تنطبع، بدون ما تنسجل. للطباعة قبل التسجيل. */
  printableCodes(batchId: number, scope: PrintScope = 'all'): string[] {
    const inList = PRINT_SCOPE[scope].map((x) => `'${x}'`).join(', ')
    return this.db.all<{ code: string }>(`SELECT code FROM cards WHERE batch_id = ? AND status IN (${inList}) ORDER BY rowid`, batchId).map((r) => r.code)
  }

  /** only: الأكواد اللي انطبعت فعلا. بدونها، كل اللي بالنطاق. */
  printBatch(batchId: number, template: string, by = this.actor, scope: PrintScope = 'all', only?: readonly string[]): StoreResult<{ codes: string[] }> {
    const statuses = PRINT_SCOPE[scope]
    const inList = statuses.map((x) => `'${x}'`).join(', ')
    return this.db.tx(() => {
      if (!this.batch(batchId)) return fail({ code: 'not_found', what: 'batch' })
      const keep = only ? new Set(only) : null
      const codes = this.db.all<{ code: string }>(
        `SELECT code FROM cards WHERE batch_id = ? AND status IN (${inList}) ORDER BY rowid`, batchId
      ).map((r) => r.code).filter((c) => !keep || keep.has(c))
      if (!codes.length) return fail({ code: 'nothing_to_print' })
      const mark = this.db.raw.prepare(
        "UPDATE cards SET printed_times = printed_times + 1, status = CASE status WHEN 'confirmed' THEN 'printed' ELSE status END WHERE code = ?"
      )
      for (const c of codes) mark.run(c)
      this.db.run('INSERT INTO print_log(batch_id, cards, template, at, by) VALUES (?, ?, ?, ?, ?)', batchId, codes.length, template, this.clock(), by)
      return ok({ codes })
    })
  }

  /**
   * بيسلم الكروت المطبوعة. للموزع بتنضاف حركة تسليم بسعر الدفعة وسياسته الحالية،
   * وللبيع المباشر ما في دين. الدفعة بتصير done لما ما يضل فيها كروت بالانتظار.
   */
  deliverBatch(batchId: number, opKey: string, by = this.actor): StoreResult<{ delivered: number; entry: LedgerEntry | null; duplicate: boolean }> {
    return this.db.tx(() => {
      const prev = this.entryByOpKey(opKey)
      if (prev) return ok({ delivered: prev.cardsDelta, entry: prev, duplicate: true })
      const prevDirect = this.getSetting(`op:${opKey}`)
      if (prevDirect !== null) return ok({ delivered: Number(prevDirect), entry: null, duplicate: true })

      const b = this.batch(batchId)
      if (!b) return fail({ code: 'not_found', what: 'batch' })
      const codes = this.batchCodes(batchId, 'printed')
      if (!codes.length) return fail({ code: 'nothing_to_deliver' })

      let entry: LedgerEntry | null = null
      if (b.distributorId !== null) {
        const d = this.distributor(String(b.distributorId))!
        const e = delivery(d.id, { id: String(b.id), wholeAg: b.wholeAg }, codes.length, d.debtPolicy, opKey)
        if (!e.ok) return fail(e.error)
        entry = this.insertEntry(e.value, by)
      } else {
        // البيع المباشر ما إله حركة دفتر، فبنحفظ مفتاح العملية لحاله عشان الضغط المزدوج.
        this.setSetting(`op:${opKey}`, String(codes.length))
      }
      this.db.run("UPDATE cards SET status = 'delivered', delivered_at = ? WHERE batch_id = ? AND status = 'printed'", this.clock(), batchId)
      const waiting = this.db.get<{ n: number }>("SELECT count(*) AS n FROM cards WHERE batch_id = ? AND status IN ('generated', 'pending', 'confirmed')", batchId)!.n
      if (Number(waiting) === 0 && b.status === 'sent') this.setBatchStatus(batchId, 'done')
      return ok({ delivered: codes.length, entry, duplicate: false })
    })
  }

  /**
   * استخدام كروت كما قرأناه من الراوتر. الدين بينشأ هون للموزع اللي سياسته on_use.
   * بيرجع الأكواد اللي ما قدر يحسبها (مش مسلمة، أو مستخدمة قبل) عشان تنعرض، بدون ما يلمس الدفتر.
   */
  recordUsage(
    codes: readonly string[],
    usedAt: string,
    opKey: string,
    by = 'router',
    /** عنوان الجهاز اللي استخدم الكرت أول مرة، إذا الراوتر عرفه. إثبات للموزع بالكشف. */
    macs: Readonly<Record<string, string>> = {}
  ): StoreResult<{ entries: LedgerEntry[]; skipped: string[] }> {
    return this.atomic(() => {
      const byBatch = new Map<number, string[]>()
      const skipped: string[] = []
      for (const code of new Set(codes)) {
        const c = this.db.get<{ batch_id: number; status: CardStatus }>('SELECT batch_id, status FROM cards WHERE code = ?', code)
        if (!c || c.status !== 'delivered') {
          skipped.push(code)
          continue
        }
        byBatch.set(c.batch_id, [...(byBatch.get(c.batch_id) ?? []), code])
      }
      const entries: LedgerEntry[] = []
      const mark = this.db.raw.prepare(
        "UPDATE cards SET status = 'active', first_used_at = ?, usage_ledger_id = ?, first_mac = ? WHERE code = ? AND status = 'delivered'"
      )
      for (const [batchId, list] of byBatch) {
        const b = this.batch(batchId)!
        let entryId: number | null = null
        if (b.distributorId !== null) {
          const dist = String(b.distributorId)
          const key = `${opKey}:${batchId}`
          const r = this.record(dist, key, (es) => usage(es, dist, { id: String(batchId), wholeAg: b.wholeAg }, list.length, key), by)
          if (!r.ok) throw new RollbackWith(r.error)
          entries.push(r.value.entry)
          entryId = Number(r.value.entry.id)
        }
        for (const code of list) mark.run(usedAt, entryId, macs[code] ?? null, code)
      }
      return ok({ entries, skipped })
    })
  }

  /**
   * مرتجع من موزع بالأكواد. الكروت بتنوقف، وأمر الإيقاف بيدخل الطابور لحين ما يرد الراوتر.
   */
  returnCards(distributorId: string, codes: readonly string[], opKey: string, by = this.actor): StoreResult<{ entries: LedgerEntry[]; duplicate: boolean }> {
    return this.atomic(() => {
      const prefix = `${opKey}:`
      const done = this.db.all<LedgerRow>('SELECT * FROM ledger WHERE substr(op_key, 1, ?) = ? ORDER BY id', prefix.length, prefix)
      if (done.length) return ok({ entries: done.map(toEntry), duplicate: true })

      const byBatch = new Map<number, string[]>()
      const notHeld: string[] = []
      for (const code of new Set(codes)) {
        const c = this.db.get<{ batch_id: number; status: CardStatus; distributor_id: number | null }>(
          'SELECT c.batch_id, c.status, b.distributor_id FROM cards c JOIN batches b ON b.id = c.batch_id WHERE c.code = ?', code
        )
        if (!c || c.status !== 'delivered' || String(c.distributor_id) !== distributorId) notHeld.push(code)
        else byBatch.set(c.batch_id, [...(byBatch.get(c.batch_id) ?? []), code])
      }
      if (notHeld.length) return fail({ code: 'not_held', codes: notHeld })
      if (!byBatch.size) return fail({ code: 'count_invalid' })

      const entries: LedgerEntry[] = []
      const now = this.clock()
      for (const [batchId, list] of byBatch) {
        const b = this.batch(batchId)!
        const key = `${opKey}:${batchId}`
        const r = this.record(distributorId, key, (es) => returnCards(es, distributorId, { id: String(batchId), wholeAg: b.wholeAg }, list.length, key), by)
        if (!r.ok) throw new RollbackWith(r.error)
        entries.push(r.value.entry)
        const mark = this.db.raw.prepare("UPDATE cards SET status = 'returned', returned_at = ? WHERE code = ?")
        for (const code of list) mark.run(now, code)
      }
      this.enqueue('router.disable', { codes: [...byBatch.values()].flat() }, `${opKey}:disable`)
      return ok({ entries, duplicate: false })
    })
  }

  card(code: string): CardInfo | null {
    const r = this.db.get<{
      code: string; status: CardStatus; printed_times: number; confirmed_at: string | null; delivered_at: string | null
      first_used_at: string | null; returned_at: string | null; no: number; batch_id: number; cat: string; distributor_id: number | null; dist: string | null
    }>(
      `SELECT c.*, b.no, b.distributor_id, k.name AS cat, d.name AS dist
       FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id
       LEFT JOIN distributors d ON d.id = b.distributor_id WHERE c.code = ?`,
      code
    )
    return r
      ? {
          code: r.code, status: r.status, printedTimes: r.printed_times, confirmedAt: r.confirmed_at, deliveredAt: r.delivered_at,
          firstUsedAt: r.first_used_at, returnedAt: r.returned_at, batchNo: r.no, batchId: r.batch_id, categoryName: r.cat,
          distributorId: r.distributor_id, distributorName: r.dist
        }
      : null
  }

  // ───────────────────────── الطابور

  enqueue(kind: string, payload: unknown, opKey: string): number {
    const prev = this.db.get<{ id: number }>('SELECT id FROM outbox WHERE op_key = ?', opKey)
    if (prev) return prev.id
    return this.db.run('INSERT INTO outbox(kind, payload, op_key, created_at) VALUES (?, ?, ?, ?)', kind, JSON.stringify(payload), opKey, this.clock()).id
  }

  pendingJobs(kind?: string): { id: number; kind: string; payload: unknown; attempts: number }[] {
    const rows = kind
      ? this.db.all<{ id: number; kind: string; payload: string; attempts: number }>("SELECT * FROM outbox WHERE status = 'pending' AND kind = ? ORDER BY id", kind)
      : this.db.all<{ id: number; kind: string; payload: string; attempts: number }>("SELECT * FROM outbox WHERE status = 'pending' ORDER BY id")
    return rows.map((r) => ({ id: r.id, kind: r.kind, payload: JSON.parse(r.payload) as unknown, attempts: r.attempts }))
  }

  finishJob(id: number, success: boolean): void {
    if (success) this.db.run("UPDATE outbox SET status = 'done', done_at = ? WHERE id = ?", this.clock(), id)
    else this.db.run('UPDATE outbox SET attempts = attempts + 1 WHERE id = ?', id)
  }
}

/** خطأ قاعدة جوا معاملة: بيلغي المعاملة كلها، وبيرجع كنتيجة عادية مش استثناء. */
class RollbackWith extends Error {
  constructor(readonly error: StoreError) {
    super(error.code)
  }
}
