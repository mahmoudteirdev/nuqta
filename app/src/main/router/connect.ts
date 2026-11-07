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
  const host = input.host.trim()
  const user = input.user.trim()
  if (!host) return { ok: false, error: { code: 'router_ip' } }
  if (!user || !input.password) return { ok: false, error: { code: 'router_creds' } }
  if (!deps.secrets.available()) return { ok: false, error: { code: 'secret_unavailable' } }
  const port = input.port ?? 8729

  const client = deps.makeClient({ host, port, user, password: input.password, tls: true, fingerprint: null })
  let info: RouterInfo
  try {
    info = await client.info()
  } catch (e) {
    client.close()
    if (e instanceof RouterError) return { ok: false, error: { code: e.code === 'auth' ? 'router_auth' : e.isDown ? 'router_unreachable' : `router_${e.code}` } }
    throw e
  }

  const name = info.identity.trim() || host
  const existing = store.routers()[0]
  const routerId = existing ? existing.id : store.addRouter({ name, host, port })
  if (existing) store.updateRouter(existing.id, { name, host, port })
  store.setSetting(K.id, String(routerId))
  store.setSetting(K.host, host)
  store.setSetting(K.port, String(port))
  store.setSetting(K.user, user)
  store.setSetting(K.secret, deps.secrets.encrypt(input.password))
  if (info.fingerprint) store.setSetting(K.fp, info.fingerprint)
  return { ok: true, value: { client, info, routerId } }
}

/** الكلاينت من الإعدادات المحفوظة، مع البصمة المثبتة. */
export function clientFromConfig(c: RouterConfig, deps: { makeClient: MakeClient; secrets: SecretBox }): RouterClient {
  return deps.makeClient({ host: c.host, port: c.port, user: c.user, password: deps.secrets.decrypt(c.sealedPassword), tls: true, fingerprint: c.fingerprint })
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
  close(): void {}
}
