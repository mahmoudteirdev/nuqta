// عمليات النسخ والاسترجاع. ما بتعتمد على إن قاعدة البيانات فاتحة: إذا كانت تالفة، الاسترجاع هو الحل.

import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ActionResult, BackupInfo, Backend } from '@shared/api'
import { ensureDir, exportBackup, listBackups, makeBackup, pruneAuto, replaceDatabase, safeName, verifyBackup, type BackupItem } from '../backup'
import type { Db } from '../db/db'
import { MIGRATIONS } from '../db/schema'

const DAY_MS = 86_400_000

type BackupBackend = Pick<Backend, 'backups' | 'backupNow' | 'saveBackupAs' | 'restoreBackup' | 'restoreFromFile'>

export interface BackupCtx {
  dir: string
  dbPath: string
  /** null إذا قاعدة البيانات ما فتحت. */
  db: () => Db | null
  /** بيسكر قاعدة البيانات قبل ما الملف يتبدل. */
  closeDb: () => void
  /** بعد الاسترجاع: البرنامج بيرجع يفتح على النسخة. */
  relaunch: () => void
  pickSave: (defaultName: string) => Promise<string | null>
  pickOpen: () => Promise<string | null>
  now?: () => string
}

/** نسخة تلقائية إذا آخر نسخة أقدم من يوم. بترجع النسخة الجديدة أو null. */
export function autoBackupIfDue(db: Db, dir: string, now = new Date().toISOString()): BackupItem | null {
  const last = listBackups(dir)[0]
  if (last && Date.parse(now) - Date.parse(last.at) < DAY_MS) return null
  const b = makeBackup(db, dir, 'auto', now)
  pruneAuto(dir)
  return b
}

export function backupActions(ctx: BackupCtx): BackupBackend {
  const now = ctx.now ?? (() => new Date().toISOString())

  /** قلب الاسترجاع: فحص، نسخة من الحالي، تبديل، إعادة تشغيل. */
  const restorePath = (path: string): ActionResult => {
    const v = verifyBackup(path, MIGRATIONS.length)
    if (!v.ok) return { ok: false, error: { code: `backup_${v.reason}` } }
    const db = ctx.db()
    let aside: string | null = null
    if (db) makeBackup(db, ctx.dir, 'before-restore', now())
    // قاعدة بيانات ما فتحت (تالفة): الملف بينقل على جنب، ما بينمسح.
    else aside = ctx.dbPath.replace(/\.db$/, '') + `-corrupt-${now().replace(/[:.]/g, '-')}.db`
    ctx.closeDb()
    replaceDatabase(ctx.dbPath, path, aside)
    ctx.relaunch()
    return { ok: true, value: undefined }
  }

  return {
    backups: () => ({ dir: ctx.dir, items: listBackups(ctx.dir) as BackupInfo[] }),

    backupNow: () => {
      const db = ctx.db()
      if (!db) return { ok: false, error: { code: 'backup_no_db' } }
      return { ok: true, value: makeBackup(db, ctx.dir, 'manual', now()) }
    },

    saveBackupAs: async () => {
      const db = ctx.db()
      if (!db) return { ok: false, error: { code: 'backup_no_db' } }
      const path = await ctx.pickSave(`نقطة-نسخة-${now().slice(0, 10)}.db`)
      if (!path) return { ok: true, value: { cancelled: true } }
      exportBackup(db, path)
      return { ok: true, value: { path } }
    },

    restoreBackup: (file) => {
      const name = safeName(file)
      if (!name) return { ok: false, error: { code: 'backup_missing' } }
      return restorePath(join(ctx.dir, name))
    },

    restoreFromFile: async () => {
      const path = await ctx.pickOpen()
      if (!path) return { ok: true, value: { cancelled: true } }
      const v = verifyBackup(path, MIGRATIONS.length)
      if (!v.ok) return { ok: false, error: { code: `backup_${v.reason}` } }
      // نسخة من الملف جوا مجلد النسخ، عشان يضل موجود حتى لو الفلاشة انشالت.
      // المجلد ممكن ما يكون موجود: جهاز جديد وأول شي بيعمله استرجاع من فلاشة.
      const kept = join(ensureDir(ctx.dir), `nuqta-${now().replace(/:/g, '-').replace('.', '-')}-imported.db`)
      copyFileSync(path, kept)
      const r = restorePath(kept)
      return r.ok ? { ok: true, value: { restarting: true } } : r
    }
  }
}
