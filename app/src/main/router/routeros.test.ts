// RouterOsClient مقابل سيرفر وهمي بيحكي بروتوكول RouterOS API الحقيقي على socket.
// هذا بيفحص الترميز والوسوم والأخطاء، بس مش بديل عن راوتر حقيقي (HANDOFF القسم 8).

import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeSentence, parseAttributes, SentenceReader } from './protocol'
import { RouterOsClient } from './routeros'
import { RouterError } from './types'

interface FakeUser { id: string; name: string; profile: string; comment: string; uptime: string; disabled: boolean; 'limit-uptime'?: string }

class FakeRouterOs {
  server: Server
  port = 0
  users: FakeUser[] = [{ id: '*1', name: 'admin-made', profile: '1h', comment: '', uptime: '5m', disabled: false }]
  sessions = [{ '.id': '*A', user: 'admin-made', 'mac-address': '4F:A2:11:22:33:44', address: '10.5.50.9', uptime: '5m' }]
  commands: string[] = []
  sockets = new Set<Socket>()
  /** بيسكّر الاتصال لما يوصل هالأمر، كأنه الراوتر طفى بالنص. */
  dieOn: string | null = null

  constructor() {
    this.server = createServer((sock) => {
      this.sockets.add(sock)
      let authed = false
      const reader = new SentenceReader()
      const send = (...words: string[]) => sock.write(encodeSentence(words))
      sock.on('data', (chunk: Buffer) => {
        for (const [cmd, ...rest] of reader.push(chunk)) {
          this.commands.push(cmd!)
          const a = parseAttributes(rest)
          const tag = rest.find((w) => w.startsWith('.tag='))!
          const done = (...w: string[]) => send('!done', ...w, tag)
          const trap = (m: string) => { send('!trap', `=message=${m}`, tag); send('!done', tag) }
          if (this.dieOn === cmd) { sock.destroy(); return }
          if (cmd === '/login') {
            if (a['name'] === 'nuqta' && a['password'] === 'سر123') { authed = true; done() } else trap('invalid user name or password (6)')
            continue
          }
          if (!authed) { send('!fatal', 'not logged in'); sock.destroy(); return }
          switch (cmd) {
            case '/system/resource/print': send('!re', '=version=7.16.2', '=board-name=hAP ax2', tag); done(); break
            case '/system/identity/print': send('!re', '=name=شبكة النور', tag); done(); break
            case '/ip/hotspot/user/profile/print': for (const p of ['1h', '3h']) send('!re', `=name=${p}`, tag); done(); break
            case '/ip/hotspot/user/add':
              if (!['1h', '3h'].includes(a['profile']!)) trap('input does not match any value of profile')
              else if (this.users.some((u) => u.name === a['name'])) trap('failure: already have user with such name')
              else {
                const id = `*${(this.users.length + 1).toString(16).toUpperCase()}`
                this.users.push({ id, name: a['name']!, profile: a['profile']!, comment: a['comment'] ?? '', uptime: '0s', disabled: false, 'limit-uptime': a['limit-uptime'] })
                // رد متأخر عشوائيا عشان الردود توصل بغير ترتيب الطلبات.
                setTimeout(() => done(`=ret=${id}`), Math.random() * 5)
              }
              break
            case '/ip/hotspot/user/print':
              for (const u of this.users) send('!re', `=.id=${u.id}`, `=name=${u.name}`, `=uptime=${u.uptime}`, `=disabled=${u.disabled}`, ...(u.comment ? [`=comment=${u.comment}`] : []), tag)
              done(); break
            case '/ip/hotspot/user/set': {
              const u = this.users.find((x) => x.name === a['numbers'] || x.id === a['numbers'])
              if (!u) trap('no such item'); else { u.disabled = a['disabled'] === 'yes'; done() }
              break
            }
            case '/ip/hotspot/active/print': for (const s of this.sessions) send('!re', ...Object.entries(s).map(([k, v]) => `=${k}=${v}`), tag); done(); break
            case '/ip/hotspot/active/remove': {
              const i = this.sessions.findIndex((s) => s['.id'] === a['.id'])
              if (i < 0) trap('no such item'); else { this.sessions.splice(i, 1); done() }
              break
            }
            default: trap(`no such command ${cmd}`)
          }
        }
      })
    })
  }

  listen(): Promise<void> {
    return new Promise((r) => this.server.listen(0, '127.0.0.1', () => { this.port = (this.server.address() as { port: number }).port; r() }))
  }

  close(): Promise<void> {
    for (const s of this.sockets) s.destroy()
    return new Promise((r) => this.server.close(() => r()))
  }
}

let fake: FakeRouterOs
let client: RouterOsClient
const opts = () => ({ host: '127.0.0.1', port: fake.port, user: 'nuqta', password: 'سر123', tls: false, timeoutMs: 2000 })

beforeEach(async () => {
  fake = new FakeRouterOs()
  await fake.listen()
  client = new RouterOsClient(opts())
})
afterEach(async () => {
  client.close()
  await fake.close()
})

describe('RouterOsClient against a fake RouterOS', () => {
  it('reads identity, version and hotspot profiles', async () => {
    expect(await client.info()).toEqual({ identity: 'شبكة النور', version: '7.16.2', board: 'hAP ax2', profiles: ['1h', '3h'], fingerprint: null })
  })

  it('adds 200 users concurrently, with tags matching out-of-order replies', async () => {
    const users = Array.from({ length: 200 }, (_, i) => ({ name: `C${String(i).padStart(3, '0')}A-2345`, profile: '3h', limitUptime: '3h', comment: 'nuqta:B-1001' }))
    expect(await client.addUsers(users)).toEqual({ failed: [] })
    expect(fake.users.filter((u) => u.comment === 'nuqta:B-1001')).toHaveLength(200)
    expect(fake.users.at(-1)!['limit-uptime']).toBe('3h')
  })

  it('resending an existing code is not an error, a bad profile is', async () => {
    await client.addUsers([{ name: 'AAAA-2222', profile: '3h', limitUptime: null, comment: 'nuqta:B-1' }])
    const r = await client.addUsers([
      { name: 'AAAA-2222', profile: '3h', limitUptime: null, comment: 'nuqta:B-1' },
      { name: 'BBBB-3333', profile: 'nope', limitUptime: null, comment: 'nuqta:B-1' }
    ])
    expect(r.failed).toEqual([{ name: 'BBBB-3333', message: 'input does not match any value of profile' }])
  })

  it('lists only our users, with parsed uptime, and never touches users made by hand', async () => {
    await client.addUsers([{ name: 'AAAA-2222', profile: '3h', limitUptime: null, comment: 'nuqta:B-1' }])
    fake.users.find((u) => u.name === 'AAAA-2222')!.uptime = '1h2m3s'
    expect(await client.users()).toEqual([{ name: 'AAAA-2222', uptimeSeconds: 3723, disabled: false, comment: 'nuqta:B-1' }])
  })

  it('disables returned cards and kicks sessions', async () => {
    await client.addUsers([{ name: 'AAAA-2222', profile: '3h', limitUptime: null, comment: 'nuqta:B-1' }])
    await client.disableUsers(['AAAA-2222'])
    expect(fake.users.find((u) => u.name === 'AAAA-2222')!.disabled).toBe(true)
    expect(await client.sessions()).toEqual([{ id: '*A', user: 'admin-made', mac: '4F:A2:11:22:33:44', address: '10.5.50.9', uptimeSeconds: 300 }])
    await client.kick('*A')
    expect(fake.sessions).toEqual([])
    await expect(client.kick('*A')).rejects.toMatchObject({ code: 'trap', message: 'no such item' })
  })

  it('wrong password is an auth error', async () => {
    const bad = new RouterOsClient({ ...opts(), password: 'غلط' })
    await expect(bad.info()).rejects.toMatchObject({ code: 'auth' })
    bad.close()
  })

  it('nothing listening is «unreachable», and counts as router down', async () => {
    await fake.close()
    const e = await client.info().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(RouterError)
    expect((e as RouterError).isDown).toBe(true)
  })

  it('router dying mid-command fails as down, and the next call reconnects', async () => {
    await client.info()
    fake.dieOn = '/ip/hotspot/user/print'
    await expect(client.users()).rejects.toMatchObject({ isDown: true })
    fake.dieOn = null
    expect(await client.users()).toEqual([])
    expect(fake.commands.filter((c) => c === '/login')).toHaveLength(2)
  })
})
