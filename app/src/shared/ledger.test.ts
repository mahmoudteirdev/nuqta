import { describe, expect, it } from 'vitest'
import { shekels } from './money'
import {
  correction, delivery, disputeClose, disputeOpen, isOverLimit, MemoryLedger, opening, returnCards,
  runningBalances, settlement, summarize, usage,
  type BatchPrice, type DebtPolicy, type LedgerEntry, type NewEntry, type Result
} from './ledger'

const D = 'yousef'
let op = 0
const key = () => `op-${++op}`

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`)
  return r.value
}

function setup() {
  const ledger = new MemoryLedger(() => '2026-11-06T09:00:00.000Z')
  const add = (e: NewEntry) => ledger.append(e).entry
  const list = () => ledger.of(D)
  return { ledger, add, list }
}

const B1: BatchPrice = { id: 'B-1030', wholeAg: shekels(2) }

describe('summary rules', () => {
  it('owed = charges − paid, positive is on him, negative is credit (rule 2)', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(500), key())))
    add(must(delivery(D, B1, 700, 'on_use', key())))
    add(must(usage(list(), D, B1, 560, key())))
    add(must(settlement(list(), D, shekels(1000), key())).entry)
    expect(summarize(list()).owedAg).toBe(shekels(500 + 1120 - 1000))
    add(must(settlement(list(), D, shekels(1000), key())).entry)
    expect(summarize(list()).owedAg).toBe(shekels(-380))
  })

  it('held = delivered − used − returned (rule 4)', () => {
    const { add, list } = setup()
    add(must(delivery(D, B1, 900, 'on_use', key())))
    add(must(usage(list(), D, B1, 870, key())))
    add(must(returnCards(list(), D, B1, 20, key())))
    const s = summarize(list())
    expect([s.delivered, s.used, s.returned, s.held]).toEqual([900, 870, 20, 10])
  })

  it('used value excludes the opening balance, owed includes it (rule 5)', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(400), key())))
    add(must(delivery(D, B1, 100, 'on_use', key())))
    add(must(usage(list(), D, B1, 50, key())))
    const s = summarize(list())
    expect(s.usedValueAg).toBe(shekels(100))
    expect(s.owedAg).toBe(shekels(500))
  })

  it('running balance in the statement ends at the owed amount', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(200), key())))
    add(must(settlement(list(), D, shekels(50), key())).entry)
    expect(runningBalances(list())).toEqual([shekels(200), shekels(150)])
  })
})

describe('debt policy (rule 3)', () => {
  it('on_use: debt starts when the card is used', () => {
    const { add, list } = setup()
    add(must(delivery(D, B1, 100, 'on_use', key())))
    expect(summarize(list()).owedAg).toBe(0)
    add(must(usage(list(), D, B1, 30, key())))
    expect(summarize(list()).owedAg).toBe(shekels(60))
  })

  it('on_delivery: debt at delivery, usage adds nothing, return credits back', () => {
    const { add, list } = setup()
    add(must(delivery(D, B1, 100, 'on_delivery', key())))
    expect(summarize(list()).owedAg).toBe(shekels(200))
    add(must(usage(list(), D, B1, 30, key())))
    expect(summarize(list()).owedAg).toBe(shekels(200))
    add(must(returnCards(list(), D, B1, 10, key())))
    expect(summarize(list()).owedAg).toBe(shekels(180))
  })

  it('the policy is frozen per delivery, so switching it later never double-charges', () => {
    const { add, list } = setup()
    add(must(delivery(D, B1, 100, 'on_delivery', key())))
    const B2: BatchPrice = { id: 'B-1031', wholeAg: shekels(2) }
    add(must(delivery(D, B2, 100, 'on_use', key())))
    add(must(usage(list(), D, B1, 100, key())))
    add(must(usage(list(), D, B2, 40, key())))
    expect(summarize(list()).owedAg).toBe(shekels(200 + 80))
  })
})

describe('frozen prices (rule 7, acceptance test 2)', () => {
  it('changing a category price never changes an old amount or a later usage of an old batch', () => {
    const { add, list } = setup()
    const category = { wholeAg: shekels(2) }
    const oldBatch: BatchPrice = { id: 'B-1', wholeAg: category.wholeAg }
    add(must(delivery(D, oldBatch, 100, 'on_use', key())))
    add(must(usage(list(), D, oldBatch, 10, key())))
    const before = list().map((e) => e.chargeAg)

    category.wholeAg = shekels(3)
    const newBatch: BatchPrice = { id: 'B-2', wholeAg: category.wholeAg }
    add(must(delivery(D, newBatch, 100, 'on_use', key())))
    add(must(usage(list(), D, oldBatch, 10, key())))
    add(must(usage(list(), D, newBatch, 10, key())))

    expect(list().slice(0, 2).map((e) => e.chargeAg)).toEqual(before)
    expect(list().filter((e) => e.type === 'usage').map((e) => e.chargeAg)).toEqual([shekels(20), shekels(20), shekels(30)])
  })
})

describe('settlement', () => {
  it('less than owed: recorded, the rest stays on him', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(1320), key())))
    const p = must(settlement(list(), D, shekels(1000), key()))
    expect([p.dueAg, p.extraAg, p.remainingAg]).toEqual([shekels(1320), 0, shekels(320)])
  })

  it('more than owed: flags the extra so the UI asks first, and it becomes credit', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(100), key())))
    const p = must(settlement(list(), D, shekels(150), key()))
    expect(p.extraAg).toBe(shekels(50))
    add(p.entry)
    expect(summarize(list()).owedAg).toBe(shekels(-50))
  })

  it('when he already has credit, the whole payment is extra', () => {
    const { add, list } = setup()
    add(must(settlement([], D, shekels(30), key())).entry)
    const p = must(settlement(list(), D, shekels(20), key()))
    expect([p.dueAg, p.extraAg]).toEqual([0, shekels(20)])
  })

  it.each([0, -100, 12.5, NaN])('rejects %s', (amount) => {
    expect(settlement([], D, amount, key())).toEqual({ ok: false, error: { code: 'amount_invalid' } })
  })

  it('pressing «سجّل التسوية» twice fast records once (acceptance test 6)', () => {
    const { ledger, list } = setup()
    const k = key()
    const first = ledger.append(must(settlement(list(), D, shekels(500), k)).entry)
    const second = ledger.append(must(settlement(list(), D, shekels(500), k)).entry)
    expect(second.duplicate).toBe(true)
    expect(second.entry.id).toBe(first.entry.id)
    expect(list()).toHaveLength(1)
  })
})

describe('returns', () => {
  it('returning more than he holds is an error with the real count', () => {
    const { add, list } = setup()
    add(must(delivery(D, B1, 50, 'on_use', key())))
    add(must(usage(list(), D, B1, 45, key())))
    expect(returnCards(list(), D, B1, 6, key())).toEqual({ ok: false, error: { code: 'return_over', held: 5 } })
  })

  it.each([0, -1, 2.5])('rejects count %s', (n) => {
    expect(returnCards([], D, B1, n, key())).toEqual({ ok: false, error: { code: 'count_invalid' } })
  })

  it('a batch never delivered to him cannot be returned or used', () => {
    expect(returnCards([], D, B1, 1, key())).toEqual({ ok: false, error: { code: 'batch_not_delivered' } })
    expect(usage([], D, B1, 1, key())).toEqual({ ok: false, error: { code: 'batch_not_delivered' } })
  })
})

describe('corrections (rule 1)', () => {
  it('reverses the last settlement with a linked entry, without touching the original', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(800), key())))
    const s = add(must(settlement(list(), D, shekels(500), key())).entry)
    const c = add(must(correction(list(), s.id, '', key())))
    expect(c).toMatchObject({ type: 'correction', refId: s.id, paidAg: shekels(-500) })
    expect(list()[1]).toEqual(s)
    expect(summarize(list()).owedAg).toBe(shekels(800))
  })

  it('an entry cannot be corrected twice', () => {
    const { add, list } = setup()
    const s = add(must(settlement([], D, shekels(10), key())).entry)
    add(must(correction(list(), s.id, '', key())))
    expect(correction(list(), s.id, 'again', key())).toEqual({ ok: false, error: { code: 'already_corrected' } })
  })

  it('an older entry needs a reason, the last one does not', () => {
    const { add, list } = setup()
    const s1 = add(must(settlement([], D, shekels(10), key())).entry)
    const s2 = add(must(settlement(list(), D, shekels(20), key())).entry)
    expect(correction(list(), s1.id, '  ', key())).toEqual({ ok: false, error: { code: 'reason_required' } })
    expect(correction(list(), s1.id, 'المبلغ انكتب غلط', key()).ok).toBe(true)
    add(must(correction(list(), s2.id, '', key())))
    // بعد تصحيح s2 صارت آخر حركة هي التصحيح، فـs1 لسا بدها سبب.
    expect(correction(list(), s1.id, '', key())).toEqual({ ok: false, error: { code: 'reason_required' } })
  })

  it('corrections and disputes themselves are not correctable', () => {
    const { add, list } = setup()
    const s = add(must(settlement([], D, shekels(10), key())).entry)
    const c = add(must(correction(list(), s.id, '', key())))
    const d = add(must(disputeOpen(list(), D, '', key())))
    expect(correction(list(), c.id, 'x', key())).toEqual({ ok: false, error: { code: 'not_correctable' } })
    expect(correction(list(), d.id, 'x', key())).toEqual({ ok: false, error: { code: 'not_correctable' } })
    expect(correction(list(), 'nope', 'x', key())).toEqual({ ok: false, error: { code: 'target_missing' } })
  })

  it('card movements are not reversed in the ledger alone, so it never drifts from the cards', () => {
    const { add, list } = setup()
    const d = add(must(delivery(D, B1, 10, 'on_use', key())))
    const u = add(must(usage(list(), D, B1, 4, key())))
    const r = add(must(returnCards(list(), D, B1, 1, key())))
    for (const t of [d, u, r]) expect(correction(list(), t.id, 'غلط', key())).toEqual({ ok: false, error: { code: 'not_correctable' } })
  })

  it('correcting the opening balance stays out of the used value', () => {
    const { add, list } = setup()
    const o = add(must(opening(D, shekels(300), key())))
    add(must(correction(list(), o.id, '', key())))
    expect(summarize(list()).usedValueAg).toBe(0)
  })
})

describe('disputes', () => {
  it('open and close never change the balance, and stay in the statement', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(100), key())))
    const o = add(must(disputeOpen(list(), D, 'بيقول الكروت ما اشتغلت', key())))
    expect(summarize(list())).toMatchObject({ owedAg: shekels(100), openDisputeId: o.id })
    expect(disputeOpen(list(), D, '', key())).toEqual({ ok: false, error: { code: 'dispute_already_open' } })
    const c = add(must(disputeClose(list(), D, '', key())))
    expect(c.refId).toBe(o.id)
    expect(summarize(list())).toMatchObject({ owedAg: shekels(100), openDisputeId: null })
    expect(disputeClose(list(), D, '', key())).toEqual({ ok: false, error: { code: 'no_open_dispute' } })
    expect(list()).toHaveLength(3)
  })
})

describe('credit limit', () => {
  it('warns only above the limit', () => {
    const { add, list } = setup()
    add(must(opening(D, shekels(1000), key())))
    expect(isOverLimit(list(), shekels(1000))).toBe(false)
    expect(isOverLimit(list(), shekels(999))).toBe(true)
  })
})

describe('append-only (acceptance test 3)', () => {
  it('stored entries and lists cannot be changed in place', () => {
    const { add, ledger } = setup()
    const e = add(must(opening(D, shekels(10), key())))
    expect(() => { (e as { paidAg: number }).paidAg = 999 }).toThrow(TypeError)
    expect(() => { (ledger.all() as LedgerEntry[]).pop() }).toThrow(TypeError)
    expect(ledger.all()[0]!.paidAg).toBe(0)
  })

  it('rejects non-integer money and a missing opKey', () => {
    const { ledger } = setup()
    const e = must(opening(D, 0, key()))
    expect(() => ledger.append({ ...e, chargeAg: 0.1 })).toThrow(TypeError)
    expect(() => ledger.append({ ...e, opKey: '' })).toThrow()
  })
})

describe('1,000 random operations (acceptance test 1)', () => {
  function rng(seed: number) {
    return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
  }

  it.each([1, 2, 3, 4, 5])('owed always equals the ledger sum and an independent model, all integers (seed %i)', (seed) => {
    const r = rng(seed)
    const pick = (n: number) => Math.floor(r() * n)
    const ledger = new MemoryLedger()
    const dists = ['a', 'b', 'c']
    const model = new Map(dists.map((d) => [d, { owed: 0, held: 0 }]))
    const batches: { b: BatchPrice; policy: DebtPolicy; dist: string }[] = []
    let accepted = 0
    let rejected = 0
    let duplicates = 0

    for (let i = 0; i < 1000; i++) {
      const dist = dists[pick(3)]!
      const m = model.get(dist)!
      const entries = ledger.of(dist)
      const mine = batches.filter((x) => x.dist === dist)
      const kind = pick(9)
      let res: Result<NewEntry>
      let dOwed = 0
      let dHeld = 0

      if (kind === 0) {
        const amount = pick(50000)
        res = opening(dist, amount, `k${i}`)
        dOwed = amount
      } else if (kind <= 2 || !mine.length) {
        const b = { id: `B${i}`, wholeAg: 50 + pick(500) }
        const policy: DebtPolicy = r() < 0.5 ? 'on_use' : 'on_delivery'
        const count = 1 + pick(300)
        res = delivery(dist, b, count, policy, `k${i}`)
        batches.push({ b, policy, dist })
        dOwed = policy === 'on_delivery' ? b.wholeAg * count : 0
        dHeld = count
      } else if (kind <= 4) {
        const x = mine[pick(mine.length)]!
        const count = 1 + pick(120)
        res = usage(entries, dist, x.b, count, `k${i}`)
        dOwed = x.policy === 'on_use' ? x.b.wholeAg * count : 0
        dHeld = -count
      } else if (kind === 5) {
        const x = mine[pick(mine.length)]!
        const count = 1 + pick(60)
        res = returnCards(entries, dist, x.b, count, `k${i}`)
        dOwed = x.policy === 'on_delivery' ? -x.b.wholeAg * count : 0
        dHeld = -count
      } else if (kind <= 7) {
        // مبالغ بالأغورة، منها كسور زي 0.29 اللي بتخرّب الـfloat.
        const amount = 1 + pick(200000)
        const plan = settlement(entries, dist, amount, `k${i}`)
        res = plan.ok ? { ok: true, value: plan.value.entry } : plan
        dOwed = -amount
      } else {
        const target = entries[pick(Math.max(entries.length, 1))]
        res = target ? correction(entries, target.id, 'سبب', `k${i}`) : { ok: false, error: { code: 'target_missing' } }
        if (target) {
          dOwed = -(target.chargeAg - target.paidAg)
          dHeld = -target.cardsDelta
        }
      }

      if (!res.ok) {
        rejected++
        continue
      }
      expect(ledger.append(res.value).duplicate).toBe(false)
      // إعادة نفس الطلب أحيانا، زي الضغط المزدوج أو إعادة المزامنة.
      if (r() < 0.1) duplicates += ledger.append(res.value).duplicate ? 1 : 0
      accepted++
      m.owed += dOwed
      m.held += dHeld

      const s = summarize(ledger.of(dist))
      expect(s.owedAg).toBe(m.owed)
      expect(s.held).toBe(m.held)
      expect(s.held).toBeGreaterThanOrEqual(0)
    }

    for (const d of dists) {
      const entries = ledger.of(d)
      const sum = entries.reduce((a, e) => a + e.chargeAg - e.paidAg, 0)
      expect(summarize(entries).owedAg).toBe(sum)
      expect(runningBalances(entries).at(-1) ?? 0).toBe(sum)
      for (const e of entries) for (const v of [e.chargeAg, e.paidAg, e.cardsDelta]) expect(Number.isSafeInteger(v)).toBe(true)
    }
    expect(accepted).toBeGreaterThan(600)
    expect(rejected).toBeGreaterThan(0)
    expect(duplicates).toBeGreaterThan(0)
    expect(ledger.all()).toHaveLength(accepted)
  })
})
