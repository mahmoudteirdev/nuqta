// الوصول لـSQLite. كل البرنامج بيمر من هون، فلو بدنا نبدل node:sqlite بمكتبة ثانية بنغير هالملف بس.

import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { MIGRATIONS } from './schema'

export type Row = Record<string, SQLInputValue>
export type Params = SQLInputValue[]

export class Db {
  readonly raw: DatabaseSync
  #depth = 0

  constructor(path: string) {
    this.raw = new DatabaseSync(path)
    try {
      this.raw.exec('PRAGMA foreign_keys = ON')
      this.raw.exec('PRAGMA busy_timeout = 5000')
      if (path !== ':memory:') {
        this.raw.exec('PRAGMA journal_mode = WAL')
        // الدفتر مال: الكتابة لازم توصل القرص قبل ما نقول «انسجل».
        this.raw.exec('PRAGMA synchronous = FULL')
      }
    } catch (e) {
      // ملف تالف: لازم نسكره، وإلا بيضل مقفول على Windows وما بنقدر نسترجع فوقه.
      this.raw.close()
      throw e
    }
  }

  all<T = Row>(sql: string, ...params: Params): T[] {
    return this.raw.prepare(sql).all(...params) as T[]
  }

  get<T = Row>(sql: string, ...params: Params): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined
  }

  run(sql: string, ...params: Params): { changes: number; id: number } {
    const r = this.raw.prepare(sql).run(...params)
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }
  }

  /** معاملة وحدة: يا بتنحفظ كلها يا ولا شي. المتداخلة بتصير savepoint. */
  tx<T>(fn: () => T): T {
    const outer = this.#depth === 0
    const sp = `sp${this.#depth}`
    this.raw.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`)
    this.#depth++
    try {
      const out = fn()
      this.#depth--
      this.raw.exec(outer ? 'COMMIT' : `RELEASE ${sp}`)
      return out
    } catch (e) {
      this.#depth--
      this.raw.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
      throw e
    }
  }

  close(): void {
    if (this.raw.isOpen) this.raw.close()
  }
}

/** بينفذ الترحيلات اللي لسا ما انعملت. بيرجع رقم النسخة بعدها. */
export function migrate(db: Db): number {
  const current = Number(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0)
  if (current > MIGRATIONS.length) {
    throw new Error(`database version ${current} is newer than this app (${MIGRATIONS.length})`)
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.tx(() => {
      db.raw.exec(MIGRATIONS[v]!)
      db.raw.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
  return MIGRATIONS.length
}

export type OpenResult =
  | { ok: true; db: Db; version: number }
  /** قاعدة البيانات تالفة أو أحدث من البرنامج. ما بنمسح شي: الواجهة بتعرض خيار الاسترجاع. */
  | { ok: false; reason: 'corrupt' | 'too_new' | 'unreadable'; detail: string }

export function openDatabase(path: string): OpenResult {
  let db: Db | undefined
  try {
    db = new Db(path)
    const check = db.all<{ integrity_check: string }>('PRAGMA integrity_check')
    if (check.length !== 1 || check[0]!.integrity_check !== 'ok') {
      db.close()
      return { ok: false, reason: 'corrupt', detail: check.map((r) => r.integrity_check).join('; ') }
    }
    const version = migrate(db)
    const fk = db.all('PRAGMA foreign_key_check')
    if (fk.length) {
      db.close()
      return { ok: false, reason: 'corrupt', detail: `${fk.length} broken references` }
    }
    return { ok: true, db, version }
  } catch (e) {
    db?.close()
    const detail = e instanceof Error ? e.message : String(e)
    if (/newer than this app/.test(detail)) return { ok: false, reason: 'too_new', detail }
    if (/not a database|malformed|corrupt/i.test(detail)) return { ok: false, reason: 'corrupt', detail }
    return { ok: false, reason: 'unreadable', detail }
  }
}
