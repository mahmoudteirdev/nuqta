// استيراد الكروت من برنامج ثاني (HANDOFF القسم 7):
// المكرر بيتجاوز وبيتعد الباقي، والكروت القديمة بدون بائع بتنسجل بيع مباشر لحين ربطها.
// الكروت موجودة على الراوتر أصلا، فما بنبعتها. بس بنعلّمها nuqta: عشان مزامنة الاستخدام تشوفها.

import { parseCsv } from '@shared/csv'
import { delivery } from '@shared/ledger'
import type { Db } from './db/db'
import type { Store } from './db/store'
import { parseUptime } from './router/types'

/** أسماء الأعمدة اللي بنعرفها، من MikroTik ومن برامج الكروت الشائعة، بالعربي والإنجليزي. */
const HEADERS = {
  code: ['name', 'username', 'user', 'code', 'voucher', 'login', 'كود', 'الكود', 'الكرت', 'اسم المستخدم'],
  profile: ['profile', 'plan', 'category', 'package', 'الفئة', 'البروفايل', 'الباقة'],
  uptime: ['uptime', 'used', 'used-time', 'usage', 'الاستخدام', 'الوقت المستخدم', 'مستخدم']
}

const CODE = /^[A-Za-z0-9-]{4,32}$/

export interface ImportRow {
  code: string
  profile: string | null
  used: boolean
}

export interface ParsedImport {
  rows: ImportRow[]
  /** صفوف ما فيها كود مقروء. */
  invalid: number
  hasProfile: boolean
}

const norm = (h: string) => h.trim().toLowerCase().replace(/^"|"$/g, '')

function isUsed(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase()
  if (!s || s === '0' || s === '0s' || s === 'no' || s === 'لا' || s === '00:00:00') return false
  if (['yes', 'true', 'نعم', 'مستخدم'].includes(s)) return true
  if (/^\d+$/.test(s)) return Number(s) > 0
  return parseUptime(s) > 0
}

export function parseImport(text: string): ParsedImport {
  const table = parseCsv(text)
  if (!table.length) return { rows: [], invalid: 0, hasProfile: false }
  const head = table[0]!.map(norm)
  const find = (names: string[]) => head.findIndex((h) => names.includes(h))
  let codeCol = find(HEADERS.code)
  const profileCol = find(HEADERS.profile)
  const uptimeCol = find(HEADERS.uptime)
  // ملف بدون عناوين: عمود الكود هو الأول.
  const hasHeader = codeCol !== -1 || profileCol !== -1
  if (codeCol === -1) codeCol = 0
  const body = hasHeader ? table.slice(1) : table

  let invalid = 0
  const rows: ImportRow[] = []
  for (const r of body) {
    const code = (r[codeCol] ?? '').trim()
    if (!CODE.test(code)) { invalid++; continue }
    rows.push({ code, profile: profileCol >= 0 ? (r[profileCol] ?? '').trim() || null : null, used: uptimeCol >= 0 && isUsed(r[uptimeCol]) })
  }
  return { rows, invalid, hasProfile: profileCol >= 0 }
}

export interface ImportPlan {
  /** صالحة وجديدة. */
  fresh: ImportRow[]
  /** موجودة عندنا أو مكررة بالملف (بدون حالة الأحرف). */
  duplicates: number
  invalid: number
  /** الفئة حسب ملف الراوتر. profile = null يعني الملف ما فيه فئة. */
  groups: { profile: string | null; categoryId: number | null; categoryName: string | null; count: number; used: number }[]
}

export function planImport(db: Db, store: Store, parsed: ParsedImport): ImportPlan {
  const seen = new Set<string>()
  const exists = db.raw.prepare('SELECT 1 FROM cards WHERE code = ?')
  const fresh: ImportRow[] = []
  let duplicates = 0
  for (const r of parsed.rows) {
    const k = r.code.toUpperCase()
    if (seen.has(k) || exists.get(r.code)) { duplicates++; continue }
    seen.add(k)
    fresh.push(r)
  }
  const cats = store.categories()
  const byProfile = new Map<string | null, ImportPlan['groups'][number]>()
  for (const r of fresh) {
    const key = r.profile
    let g = byProfile.get(key)
    if (!g) {
      const c = key ? cats.find((x) => x.routerProfile.toLowerCase() === key.toLowerCase() || x.name === key) : undefined
      g = { profile: key, categoryId: c?.id ?? null, categoryName: c?.name ?? null, count: 0, used: 0 }
      byProfile.set(key, g)
    }
    g.count++
    if (r.used) g.used++
  }
  return { fresh, duplicates, invalid: parsed.invalid, groups: [...byProfile.values()].sort((a, b) => b.count - a.count) }
}

export interface ImportChoice {
  /** null = بيع مباشر. */
  distributorId: string | null
  /** للكروت اللي فئتها مش معروفة أو الملف ما فيه فئة. null = ما بتنستورد. */
  fallbackCategoryId: number | null
}

export type ImportOutcome = { imported: number; skipped: number; batches: number[]; tagged: string[] }

/**
 * بيسجل الكروت. كل فئة بدفعة لحالها بسعر الفئة اليوم، حالتها done.
 * المستخدم من قبل: active بدون دين (قبل البرنامج). غير المستخدم: delivered، وللموزع حركة تسليم بعددهم.
 */
export function commitImport(db: Db, store: Store, plan: ImportPlan, choice: ImportChoice, opKey: string, now: string): ImportOutcome {
  const router = store.routers()[0]
  if (!router) throw new ImportError('import_no_router')
  const dist = choice.distributorId ? store.distributor(choice.distributorId) : null
  if (choice.distributorId && !dist) throw new ImportError('not_found')

  // نفس الطلب مرتين (ضغط مزدوج): بيرجع اللي انعمل أول مرة.
  const prefix = `${opKey}:`
  const prev = db.all<{ no: number; count: number }>('SELECT no, count FROM batches WHERE substr(op_key, 1, ?) = ? ORDER BY no', prefix.length, prefix)
  if (prev.length) return { imported: prev.reduce((a, b) => a + b.count, 0), skipped: 0, batches: prev.map((b) => b.no), tagged: [] }

  return db.tx(() => {
    const groups = new Map<number, ImportRow[]>()
    let skipped = 0
    for (const r of plan.fresh) {
      const g = plan.groups.find((x) => x.profile === r.profile)
      const cat = g?.categoryId ?? choice.fallbackCategoryId
      if (!cat) { skipped++; continue }
      groups.set(cat, [...(groups.get(cat) ?? []), r])
    }
    const batches: number[] = []
    const tagged: string[] = []
    let imported = 0
    for (const [catId, rows] of groups) {
      const cat = store.categories().find((c) => c.id === catId)!
      const no = Number(db.get<{ n: number | null }>('SELECT max(no) n FROM batches')?.n ?? 1000) + 1
      const batchId = db.run(
        `INSERT INTO batches(no, category_id, router_id, distributor_id, count, whole_ag, sale_ag, status, op_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'done', ?, ?)`,
        no, catId, router.id, dist ? Number(dist.id) : null, rows.length, cat.wholeAg, cat.saleAg, `${opKey}:${catId}`, now
      ).id
      const insert = db.raw.prepare(
        'INSERT INTO cards(code, batch_id, status, confirmed_at, delivered_at, first_used_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const r of rows) insert.run(r.code, batchId, r.used ? 'active' : 'delivered', now, now, r.used ? now : null)
      const fresh = rows.filter((r) => !r.used).length
      if (dist && fresh > 0) {
        const e = delivery(dist.id, { id: String(batchId), wholeAg: cat.wholeAg }, fresh, dist.debtPolicy, `${opKey}:${catId}:delivery`)
        if (!e.ok) throw new ImportError(e.error.code)
        const rec = store.record(dist.id, e.value.opKey, () => e)
        if (!rec.ok) throw new ImportError(rec.error.code)
      }
      store.enqueue('router.tag', { codes: rows.map((r) => r.code), comment: `nuqta:B-${no}` }, `${opKey}:${catId}:tag`)
      tagged.push(...rows.map((r) => r.code))
      batches.push(no)
      imported += rows.length
    }
    return { imported, skipped, batches, tagged }
  })
}

export class ImportError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
