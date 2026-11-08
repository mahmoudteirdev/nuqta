import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shekels } from '@shared/money'
import { openDatabase, type Db } from '../db/db'
import { Store } from '../db/store'
import { clientFromConfig, connectRouter, NoRouter, readRouterConfig, type SecretBox } from '../router/connect'
import type { ConnectionOptions } from '../router/connection'
import { MockRouter } from '../router/mock'
import { RouterService } from '../router/service'
import { RouterError, type RouterClient } from '../router/types'
import { networkData } from './network'

let db: Db
let store: Store
let router: MockRouter
let svc: RouterService
let codes: string[]

/** تشفير وهمي للاختبار: بيقلب النص، فبنعرف إنه ما انحفظ كما هو. */
const secrets: SecretBox = { available: () => true, encrypt: (s) => 'enc:' + [...s].reverse().join(''), decrypt: (s) => [...s.slice(4)].reverse().join('') }

beforeEach(async () => {
  const r = openDatabase(':memory:')
  if (!r.ok) throw new Error(r.detail)
  db = r.db
  store = new Store(db)
  router = new MockRouter({ firstSendRate: 1 })
  svc = new RouterService(store, router)
  const rt = store.addRouter({ name: 'الراوتر الرئيسي', host: '192.168.88.1' })
  const cat = store.addCategory({ name: '3 ساعات', routerProfile: '3h', limitUptime: '3h', wholeAg: shekels(2), saleAg: shekels(3) })
  const d = store.addDistributor({ name: 'محل يوسف', creditLimitAg: 0 }, 'd')
  if (!d.ok) throw new Error()
  const b = store.createBatch({ categoryId: cat, routerId: rt, distributorId: d.value.id, count: 5 }, 'b')
  if (!b.ok) throw new Error()
  codes = b.value.codes
  await svc.sendBatch(b.value.batch.id)
  store.printBatch(b.value.batch.id, 'a4-12')
  store.deliverBatch(b.value.batch.id, 'dv')
})
afterEach(() => db.close())

const data = (up = true) => networkData({ db, store, service: svc, router: { up, lastSeenAt: '2026-11-07T08:00:00Z' }, mock: true, configured: false })

describe('network data', () => {
  it('lists sessions with their category and the time left on the card', async () => {
    router.use(codes[0]!, 3600, '4F:A2:11:22:33:44')
    router.use(codes[1]!, 600)
    const d = await data()
    expect(d.routers).toEqual([{ id: 1, name: 'الراوتر الرئيسي', host: '192.168.88.1', up: true, lastSeenAt: '2026-11-07T08:00:00Z', sessions: 2 }])
    expect(d.sessions!.map((s) => [s.code, s.categoryName, s.secondsLeft])).toEqual([[codes[0], '3 ساعات', 7200], [codes[1], '3 ساعات', 10200]])
    expect(d.queued).toBe(0)
  })

  it('router down: no sessions, the router shows down, queued work is counted', async () => {
    router.up = false
    store.returnCards('1', [codes[2]!], 'ret')
    const d = await data(false)
    expect(d.sessions).toBeNull()
    expect(d.routers[0]).toMatchObject({ up: false, sessions: null })
    expect(d.queued).toBe(1)
  })

  it('reports ip pools with active session counts, total ips, and mapped server', async () => {
    router.use(codes[0]!, 3600, '4F:A2:11:22:33:44') // MockRouter assigns 192.168.88.10 (pool-wifi: 192.168.88.10-192.168.88.254)
    const d = await data()
    expect(d.pools.length).toBeGreaterThan(0)
    const wifiPool = d.pools.find((p) => p.name === 'pool-wifi')
    expect(wifiPool).toBeDefined()
    expect(wifiPool?.activeCount).toBe(1)
    expect(wifiPool?.totalIps).toBe(241)
    expect(wifiPool?.serverName).toBe('hotspot-wifi')
    expect(d.sessions?.[0]?.poolName).toBe('pool-wifi')
  })

  it('manages ip pools: add, update, delete', async () => {
    await svc.addPool('pool-guest', '10.10.10.2-10.10.10.50')
    const p1 = await svc.pools()
    expect(p1.ok && p1.value.some((p) => p.name === 'pool-guest')).toBe(true)

    await svc.updatePool('pool-guest', '10.10.10.2-10.10.10.100')
    const p2 = await svc.pools()
    const updated = p2.ok ? p2.value.find((p) => p.name === 'pool-guest') : null
    expect(updated?.ranges).toBe('10.10.10.2-10.10.10.100')
    expect(updated?.totalIps).toBe(99)

    await svc.deletePool('pool-guest')
    const p3 = await svc.pools()
    expect(p3.ok && p3.value.some((p) => p.name === 'pool-guest')).toBe(false)
  })
})

describe('connecting a real router', () => {
  const clientFor = (impl: Partial<RouterClient>) => (o: ConnectionOptions) => {
    seen.push(o)
    return Object.assign(new MockRouter(), impl)
  }
  let seen: ConnectionOptions[] = []
  beforeEach(() => { seen = [] })

  it('tests the connection over TLS, stores the password sealed, and updates the existing router', async () => {
    const r = await connectRouter(store, { host: ' 10.0.0.1 ', user: 'nuqta', password: 'سر123' }, { makeClient: clientFor({}), secrets })
    expect(r.ok).toBe(true)
    expect(seen[0]).toMatchObject({ host: '10.0.0.1', port: 8729, tls: true, fingerprint: null })
    expect(store.getSetting('router_secret')).not.toContain('سر123')
    expect(store.routers()).toEqual([expect.objectContaining({ id: 1, name: 'MikroTik', host: '10.0.0.1', port: 8729 })])

    const cfg = readRouterConfig(store)!
    expect(cfg).toMatchObject({ routerId: 1, host: '10.0.0.1', user: 'nuqta' })
    clientFromConfig(cfg, { makeClient: clientFor({}), secrets })
    expect(seen[1]).toMatchObject({ password: 'سر123', tls: true })
  })

  it('pins the certificate fingerprint from the first connection', async () => {
    const info = async () => ({ identity: 'R1', version: '7.16', board: 'x', profiles: [], fingerprint: 'AB:CD' })
    await connectRouter(store, { host: 'r', user: 'u', password: 'p' }, { makeClient: clientFor({ info }), secrets })
    expect(readRouterConfig(store)!.fingerprint).toBe('AB:CD')
  })

  it.each([
    ['wrong password', new RouterError('auth', 'invalid user name or password'), 'router_auth'],
    ['nothing answers', new RouterError('unreachable', 'ECONNREFUSED'), 'router_unreachable'],
    ['certificate changed', new RouterError('tls_mismatch'), 'router_tls_mismatch']
  ])('%s → %s, and nothing is saved', async (_n, err, code) => {
    const r = await connectRouter(store, { host: 'r', user: 'u', password: 'p' }, { makeClient: clientFor({ info: () => Promise.reject(err) }), secrets })
    expect(r).toEqual({ ok: false, error: { code } })
    expect(readRouterConfig(store)).toBeNull()
  })

  it('refuses missing fields, and refuses to store a password the OS cannot seal', async () => {
    const make = clientFor({})
    expect(await connectRouter(store, { host: ' ', user: 'u', password: 'p' }, { makeClient: make, secrets })).toEqual({ ok: false, error: { code: 'router_ip' } })
    expect(await connectRouter(store, { host: 'r', user: '', password: 'p' }, { makeClient: make, secrets })).toEqual({ ok: false, error: { code: 'router_creds' } })
    const noSeal = { ...secrets, available: () => false }
    expect(await connectRouter(store, { host: 'r', user: 'u', password: 'p' }, { makeClient: make, secrets: noSeal })).toEqual({ ok: false, error: { code: 'secret_unavailable' } })
    expect(seen).toHaveLength(0)
  })

  it('with no router configured, everything reports the router as down instead of crashing', async () => {
    const none = new RouterService(store, new NoRouter())
    expect(await none.test()).toMatchObject({ ok: false, error: { code: 'unreachable' } })
    const b = store.createBatch({ categoryId: 1, routerId: 1, distributorId: null, count: 3 }, 'nb')
    if (!b.ok) throw new Error()
    expect(await none.sendBatch(b.value.batch.id)).toMatchObject({ ok: true, value: { confirmed: 0, pending: 3, routerDown: true } })
  })
})
