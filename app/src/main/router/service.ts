// الشغل اللي بيحكي مع الراوتر وبيسجل نتيجته. الراوتر ممكن ينقطع بأي لحظة:
// ما في شي هون بيضيع، والدفتر ما بيتأثر إلا بالاستخدام المؤكد.

import type { Store, StoreError } from '../db/store'
import { COMMENT_PREFIX, RouterError, type ActiveSession, type HotspotUser, type RouterClient, type RouterInfo } from './types'

export type RouterResult<T> = { ok: true; value: T } | { ok: false; error: RouterError | StoreError }

const down = (e: unknown): RouterResult<never> => {
  if (e instanceof RouterError) return { ok: false, error: e }
  throw e
}

export interface SendOutcome {
  confirmed: number
  pending: number
  /** الراوتر ما رد: الدفعة محفوظة وكل كروتها بالانتظار. */
  routerDown: boolean
  /** الراوتر رفض بعض الأكواد (فئة مش موجودة مثلا). بيضلوا بالانتظار. */
  rejected: { name: string; message: string }[]
}

export interface SyncOutcome {
  /** كروت أول مرة بتنستخدم، وانحسب دينها. */
  newlyUsed: number
  /** مستخدمة على الراوتر بس مش مسلمة لموزع ولا بيع مباشر. للعرض بس، ما بتلمس الدفتر. */
  usedButNotDelivered: string[]
  /** مأكدة عندنا ومش موجودة على الراوتر: غالبا انعمله reset (HANDOFF القسم 7). تنبيه بس. */
  missingOnRouter: string[]
}

export class RouterService {
  #syncSeq = 0

  constructor(
    private readonly store: Store,
    private readonly router: RouterClient,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  async addProfile(p: { name: string; rateLimit?: string; sharedUsers?: number }): Promise<RouterResult<void>> {
    try {
      await this.router.addProfile(p)
      return { ok: true, value: undefined }
    } catch (e) {
      return down(e)
    }
  }

  async test(): Promise<RouterResult<RouterInfo>> {
    try {
      return { ok: true, value: await this.router.info() }
    } catch (e) {
      return down(e)
    }
  }

  /**
   * بيبعت الجديد والناقص من الدفعة، وبيأكد بالقراءة من الراوتر مش برد الإضافة.
   * نفس الدالة لإعادة الإرسال: بتبعت نفس الأكواد اللي بالانتظار.
   */
  async sendBatch(batchId: number): Promise<RouterResult<SendOutcome>> {
    const list = this.store.sendList(batchId)
    if (!list) return { ok: false, error: { code: 'not_found', what: 'batch' } }
    let confirmed: string[] = []
    let rejected: SendOutcome['rejected'] = []
    let routerDown = false
    try {
      const r = await this.router.addUsers(
        list.codes.map((name) => ({ name, profile: list.profile, limitUptime: list.limitUptime, comment: `${COMMENT_PREFIX}B-${list.no}` }))
      )
      rejected = r.failed
      const present = new Set((await this.router.users()).map((u) => u.name))
      confirmed = list.codes.filter((c) => present.has(c))
    } catch (e) {
      if (!(e instanceof RouterError) || !e.isDown) return down(e)
      // انقطع بالنص: ما بنعرف شو وصل. الكل بيضل بالانتظار، وإعادة الإرسال آمنة لأن الإضافة المكررة مش خطأ.
      routerDown = true
    }
    const r = this.store.applySendResult(batchId, confirmed)
    if (!r.ok) return r
    return { ok: true, value: { ...r.value, routerDown, rejected } }
  }

  /**
   * بيقرأ الاستخدام من الراوتر وبيسجله. وقت أول استخدام من ساعة الجهاز، مش ساعة الراوتر،
   * لأن ساعة الراوتر ممكن تكون غلط (HANDOFF القسم 7). التكرار آمن: الكرت المستخدم ما بينحسب مرتين.
   */
  async syncUsage(): Promise<RouterResult<SyncOutcome>> {
    let users
    try {
      users = await this.router.users()
    } catch (e) {
      return down(e)
    }
    const now = this.clock()
    const used = new Set(users.filter((u) => u.uptimeSeconds > 0).map((u) => u.name))
    const delivered = this.store.codesWithStatus(['delivered']).filter((c) => used.has(c))
    // عنوان الجهاز من الجلسات المفتوحة. إذا ما قدرنا نقرأها، الاستخدام بينسجل بدونه.
    const macs: Record<string, string> = {}
    if (delivered.length) {
      try {
        for (const s of await this.router.sessions()) if (s.mac) macs[s.user] ??= s.mac
      } catch {
        /* بدون عنوان */
      }
    }
    const r = this.store.recordUsage(delivered, now, `usage:${now}`, 'router', macs)
    if (!r.ok) return r

    const present = new Set(users.map((u) => u.name))
    return {
      ok: true,
      value: {
        newlyUsed: delivered.length,
        usedButNotDelivered: this.store.codesWithStatus(['confirmed', 'printed']).filter((c) => used.has(c)),
        missingOnRouter: this.store.codesWithStatus(['confirmed', 'printed', 'delivered', 'active']).filter((c) => !present.has(c))
      }
    }
  }

  /** بينفذ الشغل اللي كان بيستنى الراوتر، بالترتيب. بيوقف عند أول انقطاع. */
  async flushOutbox(): Promise<{ done: number; waiting: number }> {
    let done = 0
    const jobs = this.store.pendingJobs()
    for (const job of jobs) {
      try {
        if (job.kind === 'router.disable') await this.router.disableUsers((job.payload as { codes: string[] }).codes)
        else if (job.kind === 'router.tag') {
          const p = job.payload as { codes: string[]; comment: string }
          await this.router.tagUsers(p.codes, p.comment)
        } else continue
        this.store.finishJob(job.id, true)
        done++
      } catch (e) {
        if (!(e instanceof RouterError)) throw e
        this.store.finishJob(job.id, false)
        if (e.isDown) break
      }
    }
    return { done, waiting: this.store.pendingJobs().length }
  }

  /** كل مستخدمين البرنامج والجلسات المفتوحة، لشاشة الشبكة. */
  async snapshot(): Promise<RouterResult<{ users: HotspotUser[]; sessions: ActiveSession[] }>> {
    try {
      const [users, sessions] = await Promise.all([this.router.users(), this.router.sessions()])
      return { ok: true, value: { users, sessions } }
    } catch (e) {
      return down(e)
    }
  }

  /** حالة كرت واحد على الراوتر: المستخدم والجلسة المفتوحة إن وجدت. */
  async lookup(code: string): Promise<RouterResult<{ user: HotspotUser | null; session: ActiveSession | null }>> {
    try {
      const [users, sessions] = await Promise.all([this.router.users(), this.router.sessions()])
      return { ok: true, value: { user: users.find((u) => u.name === code) ?? null, session: sessions.find((s) => s.user === code) ?? null } }
    } catch (e) {
      return down(e)
    }
  }

  async sessions(): Promise<RouterResult<ActiveSession[]>> {
    try {
      return { ok: true, value: await this.router.sessions() }
    } catch (e) {
      return down(e)
    }
  }

  async kick(sessionId: string): Promise<RouterResult<void>> {
    try {
      await this.router.kick(sessionId)
      return { ok: true, value: undefined }
    } catch (e) {
      return down(e)
    }
  }
}
