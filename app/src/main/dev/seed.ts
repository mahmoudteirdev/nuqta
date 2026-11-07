// بيانات تجربة لوضع التطوير، قريبة من بيانات النموذج (نفس الموزعين والفئات والأسعار).
// بتنعمل بعمليات البرنامج نفسها، فهي بتمشي على نفس القواعد. ما بتنعمل أبدا بالنسخة المبنية.

import { shekels } from '@shared/money'
import type { Db } from '../db/db'
import { Store } from '../db/store'

export function seedDemo(db: Db, now = new Date()): void {
  let cur = now.toISOString()
  /** قبل كم يوم، الساعة 10 الصبح. اليوم نفسه: قبل نص ساعة، عشان ما يطلع بالمستقبل. */
  const at = (daysAgo: number): string => {
    if (daysAgo === 0) return new Date(now.getTime() - 30 * 60_000).toISOString()
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 10)
    return d.toISOString()
  }
  const on = (daysAgo: number) => { cur = at(daysAgo) }
  const store = new Store(db, () => cur)
  let op = 0
  const key = () => `seed-${++op}`
  const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
    if (!r.ok) throw new Error(`seed failed: ${JSON.stringify(r.error)}`)
    return r.value
  }

  db.tx(() => {
    on(40)
    store.setSetting('network_name', 'شبكة النور')
    const router = store.addRouter({ name: 'الراوتر الرئيسي', host: '192.168.88.1' })
    const cat = {
      h1: store.addCategory({ name: 'ساعة', routerProfile: '1h', limitUptime: '1h', wholeAg: shekels(1), saleAg: shekels(2) }),
      h3: store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) }),
      d1: store.addCategory({ name: 'يوم كامل', routerProfile: 'day', limitUptime: '1d', wholeAg: shekels(4), saleAg: shekels(5) }),
      w1: store.addCategory({ name: 'أسبوع', routerProfile: 'week', limitUptime: '7d', wholeAg: shekels(15), saleAg: shekels(20) })
    }
    const dist = (name: string, area: string, limit: number) =>
      must(store.addDistributor({ name, area, creditLimitAg: shekels(limit), debtPolicy: 'on_use' }, key())).id
    const yousef = dist('محل يوسف', 'السوق', 1000)
    const khaled = dist('سوبرماركت أبو خالد', 'الشارع الرئيسي', 1500)
    const port = dist('كشك الميناء', 'الميناء', 1000)
    const amal = dist('مكتبة الأمل', 'قرب المدرسة', 1000)

    const deliver = (d: string | null, category: number, count: number, daysAgo: number): string[] => {
      on(daysAgo)
      const { batch, codes } = must(store.createBatch({ categoryId: category, routerId: router, distributorId: d, count }, key()))
      must(store.applySendResult(batch.id, codes))
      must(store.printBatch(batch.id, 'a4-24'))
      must(store.deliverBatch(batch.id, key()))
      return codes
    }
    const use = (codes: string[], n: number, daysAgo: number) => {
      on(daysAgo)
      must(store.recordUsage(codes.splice(0, n), cur, key()))
    }
    const settle = (d: string, amount: number, daysAgo: number) => {
      on(daysAgo)
      must(store.settle(d, shekels(amount), key()))
    }

    const p1 = deliver(port, cat.h3, 700, 35)
    const y1 = deliver(yousef, cat.h3, 600, 34)
    const k1 = deliver(khaled, cat.h3, 1400, 31)
    const a1 = deliver(amal, cat.h3, 900, 30)
    use(y1, 525, 18)
    settle(port, 500, 22)
    settle(yousef, 300, 9)
    const y2 = deliver(yousef, cat.h3, 300, 8)
    use(k1, 1240, 7)
    use(a1, 870, 4)
    settle(khaled, 1500, 3)
    use(p1, 560, 2)
    const direct = deliver(null, cat.h1, 200, 2)
    settle(amal, 1200, 1)
    use(y2, 147, 1)
    use(y2, 138, 0)
    use(a1, 24, 0)
    use(k1, 90, 0)
    use(direct, 50, 0)
  })
}
