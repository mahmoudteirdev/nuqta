// الواجهة الثابتة بين البرنامج والراوتر (HANDOFF القسم 8). في نسختين منها:
// RouterOsClient للراوتر الحقيقي عبر api-ssl، وMockRouter للتطوير والاختبار.
// باقي البرنامج ما بيعرف أي وحدة شغالة.

export interface NewHotspotUser {
  /** كود الكرت، XXXX-XXXX. هو اسم المستخدم على الراوتر. */
  name: string
  profile: string
  limitUptime: string | null
  /** بنعلّم كروتنا بـ«nuqta:B-1001» عشان ما نلمس مستخدمين انعملوا بإيد. */
  comment: string
  limitUptimeSeconds?: number | null
  /** سيرفر الهوتسبوت المخصص، مثل hotspot-wifi أو hotspot-lan. null أو all للجميع. */
  server?: string | null
}

export interface HotspotUser {
  name: string
  /** الوقت المستخدم بالثواني. أكبر من صفر يعني الكرت انستخدم. لازم يتأكد على راوتر حقيقي. */
  uptimeSeconds: number
  disabled: boolean
  comment: string
}

export interface ActiveSession {
  id: string
  user: string
  mac: string
  address: string
  uptimeSeconds: number
  comment?: string
}

export interface IpPool {
  id: string
  name: string
  ranges: string
  totalIps: number
}

export interface HotspotServer {
  id: string
  name: string
  interface: string
  profile: string
  addressPool: string
}

export interface RouterInfo {
  identity: string
  version: string
  board: string
  /** فئات الهوتسبوت على الراوتر، لأول تشغيل. */
  profiles: string[]
  /** بصمة شهادة api-ssl. بتنحفظ أول مرة، وأي تغيير بعدها بيوقف الاتصال. */
  fingerprint: string | null
}

export type RouterErrorCode =
  /** ما في رد: الراوتر طافي أو الجهاز مش على نفس الشبكة أو api-ssl مش مفعلة. */
  | 'unreachable'
  | 'timeout'
  /** اسم المستخدم أو كلمة المرور غلط. */
  | 'auth'
  /** الشهادة تغيرت عن اللي انحفظت. ممكن جهاز ثاني بينتحل الراوتر. */
  | 'tls_mismatch'
  /** الراوتر رفض الأمر نفسه. message فيها سببه. */
  | 'trap'
  | 'closed'

export class RouterError extends Error {
  constructor(
    readonly code: RouterErrorCode,
    message: string = code
  ) {
    super(message)
    this.name = 'RouterError'
  }

  /** الراوتر مش راد: الشغل بيستنى بالطابور، وما في داعي نعرض تفاصيل. */
  get isDown(): boolean {
    return this.code === 'unreachable' || this.code === 'timeout' || this.code === 'closed'
  }
}

export interface RouterClient {
  info(): Promise<RouterInfo>
  /** بيضيف المستخدمين. الكود الموجود أصلا مش خطأ: هيك إعادة الإرسال آمنة. */
  addUsers(users: readonly NewHotspotUser[]): Promise<{ failed: { name: string; message: string }[] }>
  /** مستخدمين البرنامج بس (تعليقهم بيبدأ بـnuqta:). */
  users(): Promise<HotspotUser[]>
  sessions(): Promise<ActiveSession[]>
  pools(): Promise<IpPool[]>
  hotspotServers(): Promise<HotspotServer[]>
  addPool(name: string, ranges: string): Promise<void>
  updatePool(nameOrId: string, ranges: string): Promise<void>
  deletePool(nameOrId: string): Promise<void>
  kick(sessionId: string): Promise<void>
  disableUsers(names: readonly string[]): Promise<void>
  /** بيعلّم مستخدمين موجودين (كروت مستوردة) بتعليق البرنامج. اللي مش موجود بيتجاوز. بيرجع عدد اللي انعلّموا. */
  tagUsers(names: readonly string[], comment: string): Promise<number>
  addProfile(p: { name: string; rateLimit?: string; sharedUsers?: number }): Promise<void>
  extendUserUptime(name: string, extraSeconds: number): Promise<{ oldLimit: string | null; newLimit: string }>
  close(): void
}

export const COMMENT_PREFIX = 'nuqta:'

/** تحويل عنوان IP لنظام رقمي لتحديد المجال */
function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0)
}

/** فحص إذا كان الآي بي يقع ضمن مدى البوول */
export function ipInRange(ip: string, rangeStr: string): boolean {
  try {
    const num = ipToInt(ip.trim())
    const parts = rangeStr.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-')
        if (num >= ipToInt(start!) && num <= ipToInt(end!)) return true
      } else if (trimmed.includes('/')) {
        const [base, cidr] = trimmed.split('/')
        const mask = cidr ? (~((1 << (32 - Number(cidr))) - 1)) >>> 0 : 0xFFFFFFFF
        const baseNum = ipToInt(base!)
        if ((num & mask) === (baseNum & mask)) return true
      } else if (trimmed) {
        if (num === ipToInt(trimmed)) return true
      }
    }
  } catch {}
  return false
}

/** حساب العدد التقريبي للآيبيات في المدى */
export function countIpsInRange(rangeStr: string): number {
  try {
    let count = 0
    const parts = rangeStr.split(',')
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-')
        const diff = ipToInt(end!) - ipToInt(start!) + 1
        if (diff > 0 && diff < 1_000_000) count += diff
      } else if (trimmed.includes('/')) {
        const [, cidr] = trimmed.split('/')
        if (cidr) {
          const c = Number(cidr)
          if (c >= 0 && c <= 32) count += Math.pow(2, 32 - c)
        }
      } else if (trimmed) {
        count += 1
      }
    }
    return count
  } catch {
    return 0
  }
}

/** «1w2d3h4m5s» أو «01:02:03» ← ثواني. */
export function parseUptime(s: string | undefined): number {
  if (!s) return 0
  const clock = /^(?:(\d+)d\s*)?(\d+):(\d{2}):(\d{2})$/.exec(s)
  if (clock) return Number(clock[1] ?? 0) * 86400 + Number(clock[2]) * 3600 + Number(clock[3]) * 60 + Number(clock[4])
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 }
  let total = 0
  for (const [, n, u] of s.matchAll(/(\d+)(ms|[wdhms])/g)) if (u !== 'ms') total += Number(n) * units[u!]!
  return total
}

export function formatUptime(seconds: number): string {
  if (seconds <= 0) return '0s'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (sec > 0) parts.push(`${sec}s`)
  return parts.join('') || '0s'
}
