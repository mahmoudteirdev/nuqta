// شاشة الشبكة: حالة الراوتر، الطابور، والمتصلين الآن.

import type { NetworkData } from '@shared/api'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import type { RouterService } from '../router/service'
import { parseUptime } from '../router/types'

export async function networkData(ctx: {
  db: Db
  store: Store
  service: RouterService
  router: { up: boolean; lastSeenAt: string | null }
  mock: boolean
  configured: boolean
}): Promise<NetworkData> {
  const snap = await ctx.service.snapshot()
  const routers = ctx.store.routers()
  const active = routers[0]
  const queued = ctx.store.pendingJobs().length

  let sessions: NetworkData['sessions'] = null
  if (snap.ok) {
    const uptime = new Map(snap.value.users.map((u) => [u.name, u.uptimeSeconds]))
    const lookup = ctx.db.raw.prepare(
      'SELECT k.name cat, k.limit_uptime lim FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id WHERE c.code = ?'
    )
    sessions = snap.value.sessions.map((s) => {
      const row = lookup.get(s.user) as { cat: string; lim: string | null } | undefined
      const isNuqta = !!row
      const limit = row?.lim ? parseUptime(row.lim) : 0
      const used = uptime.get(s.user) ?? s.uptimeSeconds
      const catName = row?.cat ?? (s.comment?.trim() ? s.comment.trim() : 'مشترك (راوتر)')
      return {
        id: s.id, code: s.user, categoryName: catName, routerName: active?.name ?? '', address: s.address, mac: s.mac,
        secondsLeft: limit ? Math.max(limit - used, 0) : null,
        isUnlimited: !isNuqta && !limit
      }
    })
  }

  return {
    routers: routers.map((r, i) => ({
      id: r.id, name: r.name, host: r.host,
      // البرنامج لسا بيحكي مع راوتر واحد: الأول.
      up: i === 0 && snap.ok,
      lastSeenAt: i === 0 ? (ctx.router.lastSeenAt ?? r.lastSeenAt) : r.lastSeenAt,
      sessions: i === 0 && sessions ? sessions.length : null
    })),
    queued,
    sessions,
    mock: ctx.mock,
    configured: ctx.configured
  }
}
