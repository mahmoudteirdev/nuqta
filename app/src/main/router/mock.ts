// راوتر وهمي بنفس الواجهة، للتطوير والاختبار. بيقلد سلوك النموذج:
// أول إرسال بيأكد جزء بس (88% افتراضيا)، والراوتر ممكن ينقطع، والكروت بتنستخدم.

import {
  COMMENT_PREFIX, formatUptime, RouterError,
  type ActiveSession, type HotspotUser, type NewHotspotUser, type RouterClient, type RouterInfo
} from './types'

export interface MockOptions {
  /** نسبة الكروت اللي بتثبت بأول محاولة. الباقي بيثبت بإعادة الإرسال. */
  firstSendRate?: number
  profiles?: string[]
  delayMs?: number
}

export class MockRouter implements RouterClient {
  up = true
  readonly #users = new Map<string, HotspotUser & { profile: string }>()
  readonly #sessions = new Map<string, ActiveSession>()
  readonly #attempted = new Set<string>()
  #sessionSeq = 0
  readonly #rate: number
  readonly #profiles: string[]
  readonly #delay: number

  constructor(o: MockOptions = {}) {
    this.#rate = o.firstSendRate ?? 0.88
    this.#profiles = o.profiles ?? ['1h', '3h', 'day', 'week']
    this.#delay = o.delayMs ?? 0
  }

  async #ready(): Promise<void> {
    if (this.#delay) await new Promise((r) => setTimeout(r, this.#delay))
    if (!this.up) throw new RouterError('unreachable', 'mock router is down')
  }

  async info(): Promise<RouterInfo> {
    await this.#ready()
    return { identity: 'MikroTik', version: '7.16 (mock)', board: 'hAP ax2', profiles: [...this.#profiles], fingerprint: null }
  }

  async addUsers(users: readonly NewHotspotUser[]) {
    await this.#ready()
    const failed: { name: string; message: string }[] = []
    // أول مرة كل كود بيتجرب، جزء منه بيضيع. ثابت حسب الترتيب عشان الاختبار يتكرر.
    const fresh = users.filter((u) => !this.#attempted.has(u.name))
    const keep = Math.round(fresh.length * this.#rate)
    for (const u of users) {
      if (!this.#profiles.includes(u.profile)) {
        failed.push({ name: u.name, message: `input does not match any value of profile` })
        continue
      }
      const first = !this.#attempted.has(u.name)
      this.#attempted.add(u.name)
      if (first && fresh.indexOf(u) >= keep) continue
      if (!this.#users.has(u.name)) this.#users.set(u.name, { name: u.name, profile: u.profile, uptimeSeconds: 0, disabled: false, comment: u.comment })
    }
    return { failed }
  }

  async users(): Promise<HotspotUser[]> {
    await this.#ready()
    return [...this.#users.values()].filter((u) => u.comment.startsWith(COMMENT_PREFIX)).map(({ profile: _p, ...u }) => ({ ...u }))
  }

  async sessions(): Promise<ActiveSession[]> {
    await this.#ready()
    return [...this.#sessions.values()].map((s) => ({ ...s }))
  }

  async kick(sessionId: string): Promise<void> {
    await this.#ready()
    if (!this.#sessions.delete(sessionId)) throw new RouterError('trap', 'no such item')
  }

  async disableUsers(names: readonly string[]): Promise<void> {
    await this.#ready()
    for (const n of names) {
      const u = this.#users.get(n)
      if (!u) throw new RouterError('trap', 'no such item')
      u.disabled = true
      for (const [id, s] of this.#sessions) if (s.user === n) this.#sessions.delete(id)
    }
  }

  async addProfile(p: { name: string; rateLimit?: string; sharedUsers?: number }): Promise<void> {
    const n = p.name.trim()
    if (!this.profiles.includes(n)) this.profiles.push(n)
  }

  async tagUsers(names: readonly string[], comment: string): Promise<number> {
    await this.#ready()
    let n = 0
    for (const name of names) {
      const u = this.#users.get(name)
      if (u) { u.comment = comment; n++ }
    }
    return n
  }

  async extendUserUptime(name: string, extraSeconds: number): Promise<{ oldLimit: string | null; newLimit: string }> {
    await this.#ready()
    const u = this.#users.get(name)
    if (!u) throw new RouterError('trap', `user ${name} not found on router`)
    const curSec = u.limitUptimeSeconds ?? 3600
    const newSec = curSec + extraSeconds
    u.limitUptimeSeconds = newSec
    return { oldLimit: formatUptime(curSec), newLimit: formatUptime(newSec) }
  }

  close(): void {}

  // ───── للاختبار والمحاكاة

  /** بيعبي الراوتر بكروت موجودة أصلا، مثلا من قاعدة البيانات بعد إعادة تشغيل البرنامج. */
  load(users: readonly (HotspotUser & { profile: string })[]): void {
    for (const u of users) {
      this.#users.set(u.name, { ...u })
      this.#attempted.add(u.name)
    }
  }

  /** حدا دخل بالكرت: بيصير عنده وقت مستخدم وجلسة. */
  use(code: string, seconds = 60, mac = '4F:A2:00:00:00:01'): string {
    const u = this.#users.get(code)
    if (!u || u.disabled) throw new Error(`cannot use ${code}`)
    u.uptimeSeconds += seconds
    const id = `*${(++this.#sessionSeq).toString(16).toUpperCase()}`
    this.#sessions.set(id, { id, user: code, mac, address: `10.5.50.${this.#sessionSeq + 1}`, uptimeSeconds: seconds })
    return id
  }

  /** الراوتر انعمله reset وضاعت المستخدمين. */
  wipe(): void {
    this.#users.clear()
    this.#sessions.clear()
  }

  user(code: string): HotspotUser | undefined {
    const u = this.#users.get(code)
    return u && { name: u.name, uptimeSeconds: u.uptimeSeconds, disabled: u.disabled, comment: u.comment }
  }
}
