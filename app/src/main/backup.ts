// النسخ والاسترجاع. نسخة كاملة متسقة بـVACUUM INTO، حتى والبرنامج شغال ويكتب.
// ما في أي مسح: النسخة التالفة أو القديمة بتنحط على جنب، والاسترجاع بياخذ نسخة من الوضع الحالي قبله.

import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Db } from './db/db'

export type BackupKind = 'auto' | 'manual' | 'before-restore' | 'imported'

export interface BackupItem {
  file: string
  at: string
  size: number
  kind: BackupKind
}

const NAME = /^nuqta-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z)-(auto|manual|before-restore|imported)\.db$/

/** النسخ التلقائية بتضل آخر هالعدد. اليدوية واللي قبل الاسترجاع ما بتنحذف أبدا. */
export const KEEP_AUTO = 30

const stamp = (iso: string) => iso.replace(/:/g, '-').replace('.', '-')
const unstamp = (s: string) => s.replace(/T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z/, (_m, h, mi, se, ms) => `T${h}:${mi}:${se}${ms ? '.' + ms : ''}Z`)

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

/** نسخة جديدة بالمجلد. VACUUM INTO بيكتب ملف واحد كامل بدون WAL. */
export function makeBackup(db: Db, dir: string, kind: BackupKind, now = new Date().toISOString()): BackupItem {
  ensureDir(dir)
  const file = `nuqta-${stamp(now)}-${kind}.db`
  const path = join(dir, file)
  db.raw.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  return { file, at: now, size: statSync(path).size, kind }
}

/** نسخة لمسار برا مجلد النسخ (فلاشة مثلا). */
export function exportBackup(db: Db, path: string): void {
  if (existsSync(path)) rmSync(path)
  db.raw.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
}

export function listBackups(dir: string): BackupItem[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((file) => {
      const m = NAME.exec(file)
      if (!m) return null
      return { file, at: unstamp(m[1]!), size: statSync(join(dir, file)).size, kind: m[2] as BackupKind }
    })
    .filter((x): x is BackupItem => x !== null)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** بيشيل النسخ التلقائية الزايدة عن KEEP_AUTO، الأقدم أول. */
export function pruneAuto(dir: string, keep = KEEP_AUTO): number {
  const autos = listBackups(dir).filter((b) => b.kind === 'auto')
  for (const b of autos.slice(keep)) rmSync(join(dir, b.file))
  return Math.max(autos.length - keep, 0)
}

export type Verdict = { ok: true; version: number; distributors: number } | { ok: false; reason: 'missing' | 'corrupt' | 'too_new' | 'not_nuqta' }

/** بيفحص النسخة قبل ما نعتمد عليها: سليمة، ومن البرنامج، ومش أحدث منه. */
export function verifyBackup(path: string, maxVersion: number): Verdict {
  if (!existsSync(path)) return { ok: false, reason: 'missing' }
  let d: DatabaseSync | undefined
  try {
    d = new DatabaseSync(path, { readOnly: true })
    const check = d.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    if (check.length !== 1 || check[0]!.integrity_check !== 'ok') return { ok: false, reason: 'corrupt' }
    const version = Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
    if (version > maxVersion) return { ok: false, reason: 'too_new' }
    const tables = new Set((d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name))
    if (!tables.has('ledger') || !tables.has('distributors')) return { ok: false, reason: 'not_nuqta' }
    const n = Number((d.prepare('SELECT count(*) n FROM distributors').get() as { n: number }).n)
    return { ok: true, version, distributors: n }
  } catch {
    return { ok: false, reason: 'corrupt' }
  } finally {
    d?.close()
  }
}

/**
 * بيحط النسخة مكان قاعدة البيانات. لازم تكون قاعدة البيانات مسكرة.
 * الملف الحالي ما بينمسح: بينقل جنبه باسم aside (للتالف) أو بينحذف بس لأنه انأخذ منه نسخة قبل.
 */
export function replaceDatabase(dbPath: string, backupPath: string, aside: string | null): void {
  for (const ext of ['-wal', '-shm']) if (existsSync(dbPath + ext)) {
    if (aside) renameSync(dbPath + ext, aside + ext)
    else rmSync(dbPath + ext)
  }
  if (existsSync(dbPath) && aside) renameSync(dbPath, aside)
  copyFileSync(backupPath, dbPath)
}

/** اسم ملف من الواجهة: بس اسم داخل مجلد النسخ، بدون مسارات. */
export function safeName(file: string): string | null {
  return NAME.test(file) && basename(file) === file ? file : null
}
