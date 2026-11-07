// الراوتر الحقيقي. الأوامر من HANDOFF القسم 8.
// تنبيه: هذا مش مجرّب على راوتر حقيقي لسا. مفحوص بس مقابل سيرفر وهمي بيحكي نفس البروتوكول (routeros.test.ts).
// قبل الإنتاج لازم يتأكد على راوتر تجربة: تحديد الاستخدام الأول من uptime، وإضافة ألف كرت، وأقل نسخة RouterOS.

import { ApiConnection, type ConnectionOptions } from './connection'
import {
  COMMENT_PREFIX, parseUptime, RouterError,
  type ActiveSession, type HotspotUser, type NewHotspotUser, type RouterClient, type RouterInfo
} from './types'

/** كم أمر بيمشوا مع بعض. الراوتر بيرد على كل واحد بوسمه. */
const IN_FLIGHT = 16

export class RouterOsClient implements RouterClient {
  #conn: ApiConnection | null = null

  constructor(private readonly options: ConnectionOptions) {}

  async #c(): Promise<ApiConnection> {
    this.#conn ??= await ApiConnection.open(this.options)
    return this.#conn
  }

  /** إذا الاتصال انقطع، المرة الجاية بيفتح واحد جديد. */
  async #run<T>(fn: (c: ApiConnection) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.#c())
    } catch (e) {
      if (e instanceof RouterError && e.isDown) {
        this.#conn?.close()
        this.#conn = null
      }
      throw e
    }
  }

  info(): Promise<RouterInfo> {
    return this.#run(async (c) => {
      const [res, id, profiles] = await Promise.all([
        c.command(['/system/resource/print', '=.proplist=version,board-name']),
        c.command(['/system/identity/print']),
        c.command(['/ip/hotspot/user/profile/print', '=.proplist=name'])
      ])
      return {
        identity: id.rows[0]?.['name'] ?? '',
        version: res.rows[0]?.['version'] ?? '',
        board: res.rows[0]?.['board-name'] ?? '',
        profiles: profiles.rows.map((r) => r['name'] ?? '').filter(Boolean),
        fingerprint: c.fingerprint
      }
    })
  }

  addUsers(users: readonly NewHotspotUser[]): Promise<{ failed: { name: string; message: string }[] }> {
    return this.#run(async (c) => {
      const failed: { name: string; message: string }[] = []
      let next = 0
      const worker = async (): Promise<void> => {
        while (next < users.length) {
          const u = users[next++]!
          const words = ['/ip/hotspot/user/add', `=name=${u.name}`, `=profile=${u.profile}`, `=comment=${u.comment}`]
          if (u.limitUptime) words.push(`=limit-uptime=${u.limitUptime}`)
          try {
            await c.command(words)
          } catch (e) {
            if (!(e instanceof RouterError) || e.code !== 'trap') throw e
            // إعادة إرسال كود موجود مش خطأ: التأكيد بيصير بالقراءة بعدين.
            if (!/already (have|exists)/i.test(e.message)) failed.push({ name: u.name, message: e.message })
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, users.length) }, worker))
      return { failed }
    })
  }

  users(): Promise<HotspotUser[]> {
    return this.#run(async (c) => {
      const r = await c.command(['/ip/hotspot/user/print', '=.proplist=name,uptime,disabled,comment'])
      return r.rows
        .filter((u) => (u['comment'] ?? '').startsWith(COMMENT_PREFIX))
        .map((u) => ({ name: u['name'] ?? '', uptimeSeconds: parseUptime(u['uptime']), disabled: u['disabled'] === 'true', comment: u['comment'] ?? '' }))
    })
  }

  sessions(): Promise<ActiveSession[]> {
    return this.#run(async (c) => {
      const r = await c.command(['/ip/hotspot/active/print', '=.proplist=.id,user,mac-address,address,uptime'])
      return r.rows.map((s) => ({
        id: s['.id'] ?? '', user: s['user'] ?? '', mac: s['mac-address'] ?? '', address: s['address'] ?? '', uptimeSeconds: parseUptime(s['uptime'])
      }))
    })
  }

  kick(sessionId: string): Promise<void> {
    return this.#run(async (c) => {
      await c.command(['/ip/hotspot/active/remove', `=.id=${sessionId}`])
    })
  }

  disableUsers(names: readonly string[]): Promise<void> {
    return this.#run(async (c) => {
      for (const n of names) await c.command(['/ip/hotspot/user/set', `=numbers=${n}`, '=disabled=yes'])
    })
  }

  tagUsers(names: readonly string[], comment: string): Promise<number> {
    return this.#run(async (c) => {
      let n = 0
      for (const name of names) {
        try {
          await c.command(['/ip/hotspot/user/set', `=numbers=${name}`, `=comment=${comment}`])
          n++
        } catch (e) {
          // كرت بالملف بس مش على الراوتر: ما بيوقف الباقي.
          if (!(e instanceof RouterError) || e.code !== 'trap') throw e
        }
      }
      return n
    })
  }

  close(): void {
    this.#conn?.close()
    this.#conn = null
  }
}
