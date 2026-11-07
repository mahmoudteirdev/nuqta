import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { autoBackupIfDue, backupActions, type BackupCtx } from './actions/backup'
import { listBackups, makeBackup, pruneAuto, safeName, verifyBackup } from './backup'
import { Db, openDatabase } from './db/db'
import { MIGRATIONS } from './db/schema'
import { Store } from './db/store'

let dir: string
let backups: string
let dbPath: string
let db: Db | null
let relaunched = 0

const open = () => {
  const r = openDatabase(dbPath)
  if (!r.ok) throw new Error(r.detail)
  return r.db
}
const distributors = (d: Db) => new Store(d).distributors().map((x) => x.name)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nuqta-bk-'))
  backups = join(dir, 'backups')
  dbPath = join(dir, 'nuqta.db')
  db = open()
  new Store(db).addDistributor({ name: 'محل يوسف', creditLimitAg: 0, openingAg: shekels(100) }, 'a')
  relaunched = 0
})
afterEach(() => {
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

function actions(now = () => new Date().toISOString()) {
  const ctx: BackupCtx = {
    dir: backups, dbPath, db: () => db, now,
    closeDb: () => { db?.close(); db = null },
    relaunch: () => { relaunched++ },
    pickSave: async () => join(dir, 'usb.db'),
    pickOpen: async () => join(dir, 'usb.db')
  }
  return backupActions(ctx)
}

describe('making and listing backups', () => {
  it('a backup is a complete, readable copy taken while the database is open', () => {
    const b = makeBackup(db!, backups, 'manual', '2026-11-07T10:00:00.000Z')
    expect(b).toMatchObject({ kind: 'manual', at: '2026-11-07T10:00:00.000Z' })
    expect(verifyBackup(join(backups, b.file), MIGRATIONS.length)).toEqual({ ok: true, version: MIGRATIONS.length, distributors: 1 })
    expect(listBackups(backups)).toEqual([b])
  })

  it('newest first; old automatic backups are pruned, manual ones never', () => {
    for (let i = 1; i <= 33; i++) makeBackup(db!, backups, 'auto', `2026-10-${String(i % 31 || 31).padStart(2, '0')}T0${i % 10}:00:00.000Z`)
    makeBackup(db!, backups, 'manual', '2026-09-01T00:00:00.000Z')
    expect(pruneAuto(backups, 30)).toBe(3)
    const list = listBackups(backups)
    expect(list.filter((b) => b.kind === 'auto')).toHaveLength(30)
    expect(list.at(-1)!.kind).toBe('manual')
    expect(list[0]!.at >= list[1]!.at).toBe(true)
  })

  it('daily automatic backup: only when the last one is a day old', () => {
    expect(autoBackupIfDue(db!, backups, '2026-11-07T08:00:00.000Z')).not.toBeNull()
    expect(autoBackupIfDue(db!, backups, '2026-11-07T20:00:00.000Z')).toBeNull()
    expect(autoBackupIfDue(db!, backups, '2026-11-08T08:00:01.000Z')).not.toBeNull()
  })
})

describe('checking a backup before trusting it', () => {
  it.each([
    ['missing', () => join(dir, 'nope.db')],
    ['corrupt', () => { const p = join(dir, 'bad.db'); writeFileSync(p, 'SQLite format 3\0' + 'x'.repeat(4000)); return p }],
    ['not_nuqta', () => { const p = join(dir, 'other.db'); const o = new Db(p); o.raw.exec('CREATE TABLE notes(x)'); o.close(); return p }]
  ])('%s', (reason, make) => {
    expect(verifyBackup(make(), MIGRATIONS.length)).toEqual({ ok: false, reason })
  })

  it('too_new: a backup from a newer app version is refused', () => {
    const b = makeBackup(db!, backups, 'manual')
    const p = join(backups, b.file)
    const o = new Db(p)
    o.raw.exec('PRAGMA user_version = 99')
    o.close()
    expect(verifyBackup(p, MIGRATIONS.length)).toEqual({ ok: false, reason: 'too_new' })
  })

  it('names from the screen cannot point outside the backups folder', () => {
    expect(safeName('nuqta-2026-11-07T10-00-00-000Z-manual.db')).toBe('nuqta-2026-11-07T10-00-00-000Z-manual.db')
    expect(safeName('../nuqta.db')).toBeNull()
    expect(safeName('C:\\Windows\\x.db')).toBeNull()
  })
})

describe('restoring', () => {
  it('goes back to the backup, keeps a copy of the current state first, and restarts', () => {
    const api = actions()
    const before = api.backupNow()
    if (!before.ok) throw new Error()
    new Store(db!).addDistributor({ name: 'بعد النسخة', creditLimitAg: 0 }, 'b')
    expect(api.restoreBackup(before.value.file)).toEqual({ ok: true, value: undefined })
    expect(relaunched).toBe(1)

    db = open()
    expect(distributors(db)).toEqual(['محل يوسف'])
    // الوضع اللي كان قبل الاسترجاع محفوظ كنسخة «قبل استرجاع».
    const kept = listBackups(backups).find((b) => b.kind === 'before-restore')!
    const k = new Db(join(backups, kept.file))
    expect(distributors(k)).toEqual(['محل يوسف', 'بعد النسخة'])
    k.close()
  })

  it('a corrupt database is moved aside, never deleted, and replaced by the backup (section 7)', () => {
    const api = actions()
    const b = api.backupNow()
    if (!b.ok) throw new Error()
    db!.close()
    db = null
    const junk = 'SQLite format 3\0' + 'x'.repeat(5000)
    writeFileSync(dbPath, junk)
    expect(openDatabase(dbPath).ok).toBe(false)

    expect(api.restoreBackup(b.value.file).ok).toBe(true)
    const aside = readdirSync(dir).find((f) => f.includes('-corrupt-'))!
    expect(readFileSync(join(dir, aside), 'utf8')).toBe(junk)
    db = open()
    expect(distributors(db)).toEqual(['محل يوسف'])
  })

  it('refuses a bad backup and leaves everything as it was', () => {
    const api = actions()
    expect(api.restoreBackup('../nuqta.db')).toEqual({ ok: false, error: { code: 'backup_missing' } })
    expect(api.restoreBackup('nuqta-2026-01-01T00-00-00-000Z-manual.db')).toEqual({ ok: false, error: { code: 'backup_missing' } })
    expect(relaunched).toBe(0)
    expect(distributors(db!)).toEqual(['محل يوسف'])
  })

  it('save to a USB stick, then restore from that file', async () => {
    const api = actions()
    expect(await api.saveBackupAs()).toEqual({ ok: true, value: { path: join(dir, 'usb.db') } })
    new Store(db!).addDistributor({ name: 'لاحق', creditLimitAg: 0 }, 'c')
    expect(await api.restoreFromFile()).toEqual({ ok: true, value: { restarting: true } })
    // نسخة من الملف بقت جوا مجلد النسخ.
    expect(listBackups(backups).some((b) => b.kind === 'imported')).toBe(true)
    db = open()
    expect(distributors(db)).toEqual(['محل يوسف'])
    expect(existsSync(join(dir, 'usb.db'))).toBe(true)
  })
})
