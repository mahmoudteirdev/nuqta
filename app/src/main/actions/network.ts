// شاشة الشبكة: حالة الراوتر، الطابور، والمتصلين الآن والـ Pools.

import type { HotspotServerInfo, NetworkData, NetworkPool } from '@shared/api'
import type { Db } from '../db/db'
import type { Store } from '../db/store'
import type { RouterService } from '../router/service'
import { ipInRange, parseUptime } from '../router/types'

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
  let pools: NetworkPool[] = []
  let servers: HotspotServerInfo[] = []

  if (snap.ok) {
    const uptime = new Map(snap.value.users.map((u) => [u.name, u.uptimeSeconds]))
    const lookup = ctx.db.raw.prepare(
      'SELECT k.name cat, k.limit_uptime lim FROM cards c JOIN batches b ON b.id = c.batch_id JOIN categories k ON k.id = b.category_id WHERE c.code = ?'
    )
    const rawSessions = snap.value.sessions

    servers = snap.value.servers.map((srv) => ({
      id: srv.id,
      name: srv.name,
      interface: srv.interface,
      profile: srv.profile,
      addressPool: srv.addressPool
    }))

    const poolServerMap = new Map<string, string>()
    for (const srv of snap.value.servers) {
      if (srv.addressPool) {
        poolServerMap.set(srv.addressPool, srv.name)
      }
    }

    pools = snap.value.pools.map((p) => {
      const activeCount = rawSessions.filter((s) => ipInRange(s.address, p.ranges)).length
      return {
        id: p.id,
        name: p.name,
        ranges: p.ranges,
        activeCount,
        totalIps: p.totalIps,
        serverName: poolServerMap.get(p.name)
      }
    })

    sessions = rawSessions
      .map((s) => {
        const row = lookup.get(s.user) as { cat: string; lim: string | null } | undefined
        if (!row) return null
        const limit = row.lim ? parseUptime(row.lim) : 0
        const used = uptime.get(s.user) ?? s.uptimeSeconds
        const matchedPool = snap.value.pools.find((p) => ipInRange(s.address, p.ranges))
        return {
          id: s.id,
          code: s.user,
          categoryName: row.cat,
          routerName: active?.name ?? '',
          address: s.address,
          mac: s.mac,
          secondsLeft: limit ? Math.max(limit - used, 0) : null,
          poolName: matchedPool?.name
        }
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
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
    pools,
    servers,
    mock: ctx.mock,
    configured: ctx.configured
  }
}
