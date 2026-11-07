import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { summarize } from '@shared/ledger'
import { shekels } from '@shared/money'
import { Db, migrate, openDatabase } from './db'
import { MIGRATIONS } from './schema'
import { Store, type StoreResult } from './store'

function must<T>(r: StoreResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`)
  return r.value
}

let db: Db
let store: Store
let tick = 0
let op = 0
const key = () => `op-${++op}`

beforeEach(() => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  tick = 0
  store = new Store(db, () => new Date(Date.UTC(2026, 10, 6, 9, 0, tick++)).toISOString())
})
afterEach(() => db.close())

function world(policy: 'on_use' | 'on_delivery' = 'on_use') {
  const router = store.addRouter({ name: 'الرئيسي', host: '192.168.88.1' })
  const h3 = store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) })
  const dist = must(store.addDistributor({ name: 'محل يوسف', creditLimitAg: shekels(1000), debtPolicy: policy, openingAg: shekels(100) }, key())).id
  return { router, h3, dist }
}

/** دفعة كاملة لحد التسليم، والراوتر أكد confirmed منها. */
function deliveredBatch(w: ReturnType<typeof world>, count: number, confirmed = count, distributorId: string | null = w.dist) {
  const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId, count }, key()))
  must(store.applySendResult(batch.id, codes.slice(0, confirmed)))
  must(store.printBatch(batch.id, 'a4-24'))
  must(store.deliverBatch(batch.id, key()))
  return { batch, codes }
}

describe('opening the database', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nuqta-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('migrates once and keeps data across restarts', () => {
    const path = join(dir, 'nuqta.db')
    const a = openDatabase(path)
    if (!a.ok) throw new Error(a.detail)
    expect(a.version).toBe(MIGRATIONS.length)
    new Store(a.db).setSetting('network_name', 'شبكة النور')
    a.db.close()
    const b = openDatabase(path)
    if (!b.ok) throw new Error(b.detail)
    expect(new Store(b.db).getSetting('network_name')).toBe('شبكة النور')
    expect(b.db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode).toBe('wal')
    b.db.close()
  })

  it('upgrades a v1 database in place without losing its ledger', () => {
    const path = join(dir, 'old.db')
    const raw = new Db(path)
    raw.tx(() => { raw.raw.exec(MIGRATIONS[0]!); raw.raw.exec('PRAGMA user_version = 1') })
    const old = new Store(raw)
    const d = must(old.addDistributor({ name: 'قديم', creditLimitAg: 0, openingAg: shekels(70) }, 'v1-op'))
    raw.close()
    const r = openDatabase(path)
    if (!r.ok) throw new Error(r.detail)
    expect(r.version).toBe(MIGRATIONS.length)
    expect(summarize(new Store(r.db).entries(d.id)).owedAg).toBe(shekels(70))
    expect(migrate(r.db)).toBe(MIGRATIONS.length)
    r.db.close()
  })

  it('a damaged file reports corrupt and is never wiped (section 7)', () => {
    const path = join(dir, 'nuqta.db')
    const junk = 'SQLite format 3\0' + 'x'.repeat(5000)
    writeFileSync(path, junk)
    const r = openDatabase(path)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('corrupt')
    expect(readFileSync(path, 'utf8')).toBe(junk)
  })

  it('a database from a newer app version is refused, not downgraded', () => {
    const path = join(dir, 'nuqta.db')
    const raw = new Db(path)
    raw.raw.exec('PRAGMA user_version = 99')
    raw.close()
    const r = openDatabase(path)
    expect(r.ok ? 'ok' : r.reason).toBe('too_new')
  })
})

describe('the ledger table is append-only (acceptance test 3)', () => {
  it('UPDATE and DELETE are rejected by the database itself', () => {
    world()
    expect(() => db.run('UPDATE ledger SET paid_ag = 999')).toThrow(/append-only/)
    expect(() => db.run('DELETE FROM ledger')).toThrow(/append-only/)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM ledger')!.n).toBe(1)
  })

  it('money must be an integer in agorot', () => {
    const { dist } = world()
    const insert = (charge: unknown) =>
      db.raw.prepare("INSERT INTO ledger(distributor_id, type, cards_delta, charge_ag, paid_ag, op_key, created_at, created_by) VALUES (?, 'opening', 0, ?, 0, ?, 'now', 'x')")
        .run(Number(dist), charge as number, key())
    expect(() => insert(1.5)).toThrow()
    expect(() => insert('12.5')).toThrow()
    expect(() => insert('abc')).toThrow()
    expect(() => insert(150)).not.toThrow()
  })

  it('the same entry cannot be corrected twice, even bypassing the app', () => {
    const { dist } = world()
    const s = must(store.settle(dist, shekels(50), key())).entry
    must(store.correct(dist, s.id, '', key()))
    expect(() =>
      db.run("INSERT INTO ledger(distributor_id, type, cards_delta, charge_ag, paid_ag, ref_ledger_id, op_key, created_at, created_by) VALUES (?, 'correction', 0, 0, 5000, ?, 'x1', 'now', 'x')", Number(dist), Number(s.id))
    ).toThrow(/UNIQUE/)
  })
})

describe('distributors and settlement', () => {
  it('adding a distributor writes the opening balance in the same transaction', () => {
    const { dist } = world()
    expect(summarize(store.entries(dist))).toMatchObject({ owedAg: shekels(100), usedValueAg: 0 })
  })

  it('a rejected opening balance leaves no half-created distributor', () => {
    world()
    const r = store.addDistributor({ name: 'غلط', creditLimitAg: 0, openingAg: -5 }, key())
    expect(r).toEqual({ ok: false, error: { code: 'amount_invalid' } })
    expect(store.distributors()).toHaveLength(1)
  })

  it('the same add request twice makes one distributor', () => {
    const k = key()
    const a = must(store.addDistributor({ name: 'كشك الميناء', creditLimitAg: 0 }, k))
    const b = must(store.addDistributor({ name: 'كشك الميناء', creditLimitAg: 0 }, k))
    expect(b).toEqual({ id: a.id, duplicate: true })
    expect(store.distributors()).toHaveLength(1)
  })

  it('pressing «سجّل التسوية» twice fast records once (acceptance test 6)', () => {
    const { dist } = world()
    const k = key()
    const first = must(store.settle(dist, shekels(60), k))
    const second = must(store.settle(dist, shekels(60), k))
    expect(first.plan).toMatchObject({ dueAg: shekels(100), remainingAg: shekels(40) })
    expect(second.duplicate).toBe(true)
    expect(store.entries(dist).filter((e) => e.type === 'settlement')).toHaveLength(1)
  })

  it('overpaying turns the extra into credit', () => {
    const { dist } = world()
    expect(must(store.settle(dist, shekels(130), key())).plan?.extraAg).toBe(shekels(30))
    expect(store.distributors()[0]!.summary.owedAg).toBe(shekels(-30))
  })

  it('disputes are recorded without moving the balance', () => {
    const { dist } = world()
    must(store.openDispute(dist, 'بيقول 20 كرت ما اشتغلوا', key()))
    expect(store.openDispute(dist, '', key())).toEqual({ ok: false, error: { code: 'dispute_already_open' } })
    expect(store.distributors()[0]!.summary).toMatchObject({ owedAg: shekels(100), openDisputeId: expect.any(String) })
    must(store.closeDispute(dist, '', key()))
    expect(store.distributors()[0]!.summary.openDisputeId).toBeNull()
  })
})

describe('batches and cards (section 6)', () => {
  it('numbers batches from 1001 and never repeats a code across batches', () => {
    const w = world()
    const a = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 500 }, key()))
    const b = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: null, count: 500 }, key()))
    expect([a.batch.no, b.batch.no]).toEqual([1001, 1002])
    expect(new Set([...a.codes, ...b.codes]).size).toBe(1000)
  })

  it('the same generate request twice returns the same batch and codes', () => {
    const w = world()
    const k = key()
    const a = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 10 }, k))
    const b = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 10 }, k))
    expect(b.duplicate).toBe(true)
    expect(b.codes).toEqual(a.codes)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM cards')!.n).toBe(10)
  })

  it('price is frozen at generation: a later price change never touches old batches or their usage (acceptance test 2)', () => {
    const w = world()
    const old = deliveredBatch(w, 50)
    must(store.setCategoryPrices(w.h3, shekels(5), shekels(6)))
    expect(() => db.run('UPDATE batches SET whole_ag = 1 WHERE id = ?', old.batch.id)).toThrow(/frozen/)
    const fresh = deliveredBatch(w, 50)
    must(store.recordUsage([...old.codes.slice(0, 10), ...fresh.codes.slice(0, 10)], '2026-11-06T10:00:00Z', key()))
    const usage = store.entries(w.dist).filter((e) => e.type === 'usage').map((e) => e.chargeAg).sort((a, b) => a - b)
    expect(usage).toEqual([shekels(20), shekels(50)])
  })

  it('selling below wholesale is a warning, not a block', () => {
    const w = world()
    expect(must(store.setCategoryPrices(w.h3, shekels(3), shekels(2)))).toEqual({ saleBelowWhole: true })
  })

  it('router confirmed part of the batch: print only the confirmed, keep the rest pending (section 7)', () => {
    const w = world()
    const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 100 }, key()))
    expect(must(store.applySendResult(batch.id, codes.slice(0, 88)))).toEqual({ confirmed: 88, pending: 12 })
    expect(must(store.printBatch(batch.id, 'a4-24')).codes).toEqual(codes.slice(0, 88))
    expect(store.batch(batch.id)!.status).toBe('sent')
    expect(store.batchCodes(batch.id, 'pending')).toEqual(codes.slice(88))
  })

  it('router down while sending: batch saved, zero confirmed, printing blocked, no code lost (acceptance test 4)', () => {
    const w = world()
    const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 100 }, key()))
    expect(must(store.applySendResult(batch.id, []))).toEqual({ confirmed: 0, pending: 100 })
    expect(store.printBatch(batch.id, 'a4-24')).toEqual({ ok: false, error: { code: 'nothing_to_print' } })
    // الراوتر رجع: إعادة الإرسال بنفس الأكواد.
    expect(must(store.applySendResult(batch.id, codes))).toEqual({ confirmed: 100, pending: 0 })
    expect(must(store.printBatch(batch.id, 'a4-24')).codes).toEqual(codes)
  })

  it('the database itself refuses printing an unconfirmed card or skipping a state', () => {
    const w = world()
    const { codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 2 }, key()))
    expect(() => db.run('UPDATE cards SET printed_times = 1 WHERE code = ?', codes[0]!)).toThrow(/confirmed/)
    expect(() => db.run("UPDATE cards SET status = 'delivered' WHERE code = ?", codes[0]!)).toThrow(/not allowed/)
    expect(() => db.run("UPDATE cards SET code = 'AAAA-AAAA' WHERE code = ?", codes[0]!)).toThrow(/fixed/)
  })

  it('a reprint uses the same codes and is logged every time', () => {
    const w = world()
    const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 5 }, key()))
    must(store.applySendResult(batch.id, codes))
    const first = must(store.printBatch(batch.id, 'a4-24')).codes
    const again = must(store.printBatch(batch.id, 'thermal-80')).codes
    expect(again).toEqual(first)
    expect(db.get<{ n: number }>('SELECT count(*) n FROM print_log WHERE batch_id = ?', batch.id)!.n).toBe(2)
    expect(store.card(codes[0]!)!.printedTimes).toBe(2)
  })
})

describe('delivery, usage and returns', () => {
  it('on_use: delivery adds cards but no debt; usage adds debt at the frozen price', () => {
    const w = world('on_use')
    const { codes } = deliveredBatch(w, 100)
    expect(store.distributors()[0]!.summary).toMatchObject({ held: 100, owedAg: shekels(100) })
    const r = must(store.recordUsage(codes.slice(0, 30), '2026-11-06T10:00:00Z', key()))
    expect(r.skipped).toEqual([])
    expect(store.distributors()[0]!.summary).toMatchObject({ held: 70, used: 30, owedAg: shekels(100 + 60) })
    expect(store.card(codes[0]!)).toMatchObject({ status: 'active', firstUsedAt: '2026-11-06T10:00:00Z', distributorName: 'محل يوسف' })
  })

  it('on_delivery: debt at delivery, usage adds none', () => {
    const w = world('on_delivery')
    const { codes } = deliveredBatch(w, 100)
    expect(store.distributors()[0]!.summary.owedAg).toBe(shekels(100 + 200))
    must(store.recordUsage(codes.slice(0, 30), '2026-11-06T10:00:00Z', key()))
    expect(store.distributors()[0]!.summary.owedAg).toBe(shekels(300))
  })

  it('replaying the same router sync, or seeing a card twice, never charges twice (acceptance test 5)', () => {
    const w = world()
    const { codes } = deliveredBatch(w, 100)
    const k = key()
    must(store.recordUsage(codes.slice(0, 10), '2026-11-06T10:00:00Z', k))
    must(store.recordUsage(codes.slice(0, 10), '2026-11-06T10:00:00Z', k))
    const later = must(store.recordUsage(codes.slice(0, 12), '2026-11-06T11:00:00Z', key()))
    expect(later.skipped).toEqual(codes.slice(0, 10))
    expect(store.distributors()[0]!.summary).toMatchObject({ used: 12, owedAg: shekels(100 + 24) })
  })

  it('unknown or undelivered codes are reported, not charged', () => {
    const w = world()
    const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 3 }, key()))
    must(store.applySendResult(batch.id, codes))
    const r = must(store.recordUsage(['ZZZZ-ZZZZ', codes[0]!], 'now', key()))
    expect(r).toEqual({ entries: [], skipped: ['ZZZZ-ZZZZ', codes[0]] })
  })

  it('direct sale: delivered with no custody and no debt (rule 8)', () => {
    const w = world()
    const { codes } = deliveredBatch(w, 20, 20, null)
    must(store.recordUsage(codes.slice(0, 5), 'now', key()))
    expect(store.distributors()[0]!.summary.owedAg).toBe(shekels(100))
    expect(store.card(codes[0]!)).toMatchObject({ status: 'active', distributorName: null })
  })

  it('returns by code: cards stop, router disable is queued, and the same request twice records once', () => {
    const w = world()
    const { codes } = deliveredBatch(w, 50)
    const k = key()
    must(store.returnCards(w.dist, codes.slice(0, 5), k))
    expect(must(store.returnCards(w.dist, codes.slice(0, 5), k)).duplicate).toBe(true)
    expect(store.distributors()[0]!.summary).toMatchObject({ held: 45, returned: 5 })
    expect(store.card(codes[0]!)!.status).toBe('returned')
    expect(store.pendingJobs('router.disable')).toEqual([{ id: 1, kind: 'router.disable', payload: { codes: codes.slice(0, 5) }, attempts: 0 }])
  })

  it('returning a card he does not hold is rejected and changes nothing', () => {
    const w = world()
    const { codes } = deliveredBatch(w, 10)
    must(store.recordUsage([codes[0]!], 'now', key()))
    const r = store.returnCards(w.dist, [codes[0]!, codes[1]!, 'ZZZZ-ZZZZ'], key())
    expect(r).toEqual({ ok: false, error: { code: 'not_held', codes: [codes[0], 'ZZZZ-ZZZZ'] } })
    expect(store.card(codes[1]!)!.status).toBe('delivered')
    expect(store.pendingJobs()).toEqual([])
  })

  it('partial delivery, then the pending cards: a second delivery on the same batch number', () => {
    const w = world()
    const { batch, codes } = must(store.createBatch({ categoryId: w.h3, routerId: w.router, distributorId: w.dist, count: 10 }, key()))
    must(store.applySendResult(batch.id, codes.slice(0, 8)))
    must(store.printBatch(batch.id, 'a4-24'))
    expect(must(store.deliverBatch(batch.id, key())).delivered).toBe(8)
    expect(store.batch(batch.id)!.status).toBe('sent')
    must(store.applySendResult(batch.id, codes.slice(8)))
    must(store.printBatch(batch.id, 'a4-24'))
    expect(must(store.deliverBatch(batch.id, key())).delivered).toBe(2)
    expect(store.batch(batch.id)!.status).toBe('done')
    expect(store.distributors()[0]!.summary.delivered).toBe(10)
  })
})

describe('random operations against the real database', () => {
  it('the summary always equals a plain SQL sum of the ledger', () => {
    const w = world()
    let seed = 42
    const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    const dists = [w.dist, must(store.addDistributor({ name: 'ب', creditLimitAg: 0, debtPolicy: 'on_delivery' }, key())).id]
    const live: { dist: string; codes: string[] }[] = []
    for (let i = 0; i < 300; i++) {
      const dist = dists[Math.floor(r() * 2)]!
      const k = r()
      if (k < 0.2) live.push({ dist, codes: deliveredBatch(w, 1 + Math.floor(r() * 40), undefined, dist).codes })
      else if (k < 0.5) {
        const mine = live.filter((b) => b.dist === dist)
        const b = mine[Math.floor(r() * mine.length)]
        if (b) store.recordUsage(b.codes.splice(0, Math.floor(r() * 8)), 'now', key())
      } else if (k < 0.6) {
        const b = live.find((x) => x.dist === dist && x.codes.length)
        if (b) store.returnCards(dist, b.codes.splice(0, 1 + Math.floor(r() * 3)), key())
      } else if (k < 0.9) store.settle(dist, 1 + Math.floor(r() * 30000), key())
      else {
        const es = store.entries(dist)
        const t = es[Math.floor(r() * es.length)]
        if (t) store.correct(dist, t.id, 'سبب', key())
      }
    }
    for (const d of dists) {
      const sql = db.get<{ owed: number; held: number }>('SELECT sum(charge_ag - paid_ag) owed, sum(cards_delta) held FROM ledger WHERE distributor_id = ?', Number(d))!
      const s = summarize(store.entries(d))
      expect(s.owedAg).toBe(sql.owed)
      expect(s.held).toBe(sql.held)
      const cards = db.get<{ n: number }>("SELECT count(*) n FROM cards c JOIN batches b ON b.id = c.batch_id WHERE b.distributor_id = ? AND c.status = 'delivered'", Number(d))!.n
      expect(s.held).toBe(cards)
    }
  })
})
