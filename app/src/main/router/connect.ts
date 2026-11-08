// ربط الراوتر الحقيقي: فحص الاتصال، تخزين كلمة المرور مشفرة عبر مخزن النظام، وتثبيت بصمة الشهادة.
// كلمة المرور ما بتنحفظ أبدا كنص. بتنشفر بـsafeStorage (DPAPI على Windows) وبتنحفظ بالإعدادات مشفرة.

import type { ActionResult } from '@shared/api'
import type { Store } from '../db/store'
import type { ConnectionOptions } from './connection'
import { RouterError, type RouterClient, type RouterInfo } from './types'

export interface SecretBox {
  available(): boolean
  encrypt(plain: string): string
  decrypt(sealed: string): string
}

export interface RouterConfig {
  routerId: number
  host: string
  port: number
  user: string
  sealedPassword: string
  fingerprint: string | null
}

const K = { id: 'router_id', host: 'router_host', port: 'router_port', user: 'router_user', secret: 'router_secret', fp: 'router_fingerprint' } as const

export function readRouterConfig(store: Store): RouterConfig | null {
  const host = store.getSetting(K.host)
  const user = store.getSetting(K.user)
  const sealed = store.getSetting(K.secret)
  const id = store.getSetting(K.id)
  if (!host || !user || !sealed || !id) return null
  return { routerId: Number(id), host, port: Number(store.getSetting(K.port) ?? 8729), user, sealedPassword: sealed, fingerprint: store.getSetting(K.fp) }
}

export type MakeClient = (o: ConnectionOptions) => RouterClient

/**
 * بيجرب الاتصال، وإذا نجح بيحفظ الإعدادات وبيرجع الكلاينت جاهز.
 * إذا في راوتر بقاعدة البيانات، بيتحدث عنوانه (البرنامج لسا بيدعم راوتر واحد فعّال).
 */
export async function connectRouter(
  store: Store,
  input: { host: string; port?: number; user: string; password: string },
  deps: { makeClient: MakeClient; secrets: SecretBox }
): Promise<ActionResult<{ client: RouterClient; info: RouterInfo; routerId: number }>> {
  let host = input.host.trim()
  const user = input.user.trim()
  if (!host) return { ok: false, error: { code: 'router_ip' } }
  if (!user || input.password === undefined) return { ok: false, error: { code: 'router_creds' } }
  if (!deps.secrets.available()) return { ok: false, error: { code: 'secret_unavailable' } }

  let port = input.port
  if (host.includes(':')) {
    const [h, p] = host.split(':')
    if (h) host = h.trim()
    const parsedPort = Number(p)
    if (!Number.isNaN(parsedPort) && parsedPort > 0) port = parsedPort
  }

  const portsToTry: { port: number; tls: boolean }[] =
    port !== undefined
      ? [{ port, tls: port !== 8728 }]
      : [
          { port: 8729, tls: true },
          { port: 8728, tls: false }
        ]

  let client: RouterClient | null = null
  let info: RouterInfo | null = null
  let lastError: unknown = null
  let successfulPort = port ?? 8729

  for (const target of portsToTry) {
    const c = deps.makeClient({
      host,
      port: target.port,
      user,
      password: input.password,
      tls: target.tls,
      fingerprint: null
    })
    try {
      info = await c.info()
      client = c
      successfulPort = target.port
      break
    } catch (e) {
      c.close()
      lastError = e
      if (e instanceof RouterError && e.code === 'auth') break
    }
  }

  if (!client || !info) {
    if (lastError instanceof RouterError) {
      return {
        ok: false,
        error: { code: lastError.code === 'auth' ? 'router_auth' : lastError.isDown ? 'router_unreachable' : `router_${lastError.code}` }
      }
    }
    throw lastError
  }

  const name = info.identity.trim() || host
  const existing = store.routers()[0]
  const routerId = existing ? existing.id : store.addRouter({ name, host, port: successfulPort })
  if (existing) store.updateRouter(existing.id, { name, host, port: successfulPort })
  store.setSetting(K.id, String(routerId))
  store.setSetting(K.host, host)
  store.setSetting(K.port, String(successfulPort))
  store.setSetting(K.user, user)
  store.setSetting(K.secret, deps.secrets.encrypt(input.password))
  if (info.fingerprint) store.setSetting(K.fp, info.fingerprint)
  return { ok: true, value: { client, info, routerId } }
}

/** الكلاينت من الإعدادات المحفوظة، مع البصمة المثبتة. */
export function clientFromConfig(c: RouterConfig, deps: { makeClient: MakeClient; secrets: SecretBox }): RouterClient {
  return deps.makeClient({
    host: c.host,
    port: c.port,
    user: c.user,
    password: deps.secrets.decrypt(c.sealedPassword),
    tls: c.port !== 8728,
    fingerprint: c.fingerprint
  })
}

/** ما في راوتر مربوط: كل طلب بيرجع «مش راد»، والبرنامج بيشتغل عادي على الحسابات. */
export class NoRouter implements RouterClient {
  readonly #down = () => Promise.reject(new RouterError('unreachable', 'no router configured'))
  info = this.#down
  addUsers = this.#down
  users = this.#down
  sessions = this.#down
  kick = this.#down
  disableUsers = this.#down
  tagUsers = this.#down
  addProfile = this.#down
  extendUserUptime = this.#down
  close(): void {}
}
