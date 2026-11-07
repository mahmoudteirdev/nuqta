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
  kick(sessionId: string): Promise<void>
  disableUsers(names: readonly string[]): Promise<void>
  /** بيعلّم مستخدمين موجودين (كروت مستوردة) بتعليق البرنامج. اللي مش موجود بيتجاوز. بيرجع عدد اللي انعلّموا. */
  tagUsers(names: readonly string[], comment: string): Promise<number>
  close(): void
}

export const COMMENT_PREFIX = 'nuqta:'

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
