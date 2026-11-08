// العقد بين الواجهة والعملية الرئيسية. أنواع بس، بدون كود، عشان الطرفين يقرأوها.
// الواجهة بتنادي api.home() وبتوصل لـBackend.home() بالعملية الرئيسية عبر قناة IPC وحدة.
// المال بالأغورة، والنصوص بتتركب بالواجهة من messages.ar.json.

import type { DebtPolicy, EntryType } from './ledger'
import type { PrintJob } from './print'
import type { Agorot } from './money'

export type DbStatus =
  | { ok: true; path: string; version: number; distributors: number }
  /** قاعدة البيانات ما فتحت. ما انمسح شي: الواجهة بتعرض الخطأ وخيار الاسترجاع. */
  | { ok: false; path: string; reason: 'corrupt' | 'too_new' | 'unreadable'; detail: string }

/** التحديث التلقائي. off: بوضع التطوير. */
export interface UpdateView {
  current: string
  state: 'off' | 'idle' | 'checking' | 'downloading' | 'ready' | 'failed'
  version: string | null
  percent: number
  reason: 'network' | 'signature' | null
  checkedAt: string | null
}

export interface AppStatus {
  db: DbStatus
  /** configured: في راوتر حقيقي مربوط. mock: البرنامج على الراوتر الوهمي (وضع التطوير). */
  router: { up: boolean; lastSeenAt: string | null; mock: boolean; configured: boolean }
  networkName: string
  /** وضع التطوير: بيظهر شريط المطور وبيقدر يقطع الراوتر الوهمي. */
  dev: boolean
  /** أول تشغيل: لسا ما خلص، وعلى أي خطوة. */
  setup: { needed: boolean; step: SetupStep }
  /** آخر نسخة على الجهاز. null = ما في نسخ. */
  lastBackupAt: string | null
  license: LicenseInfo
  session: SessionInfo
  update: UpdateView
  installerLang?: 'ar' | 'en' | null
  installerLangMtime?: number | null
}

/** مين فاتح البرنامج هلأ. */
export interface SessionInfo {
  user: { id: number; name: string; role: UserRole } | null
  /** ما في ولا مستخدم إله رمز: لازم صاحب الشبكة يعمل رمزه أول (نسخة قديمة أو تثبيت جديد). */
  needsOwnerPin: boolean
  /** للشاشة: أسماء اللي بيقدروا يدخلوا. */
  users: { id: number; name: string; role: UserRole }[]
  /** البرنامج بيقفل حاله بعد هالدقائق بدون استخدام. 0 = ما بيقفل. */
  lockAfterMinutes: number
}

export type LicenseInfo =
  | { state: 'licensed'; deviceCode: string; plan: string; expires: string | null }
  | { state: 'trial'; deviceCode: string; daysLeft: number }
  /** انتهت التجربة: توليد كروت جديدة بس اللي بيوقف. الحسابات والتقارير والنسخ شغالة. */
  | { state: 'expired'; deviceCode: string }

export interface BackupInfo {
  file: string
  at: string
  size: number
  kind: 'auto' | 'manual' | 'before-restore' | 'before-update' | 'imported'
}

export type SetupStep = 1 | 2 | 3 | 4

export interface SetupCategoryDraft {
  name: string
  profile: string
  /** وقت الكرت بصيغة الراوتر: 1h، 3h، 1d، 7d. */
  limitUptime: string
  wholeAg: Agorot
  saleAg: Agorot
}

/** مهام شغل اليوم بترتيب الأولوية. أول وحدة بتنعرض بزر أساسي. */
export type HomeTask =
  | { kind: 'router' }
  | { kind: 'pending'; batchId: number; batchNo: number; pending: number }
  | { kind: 'collect'; distributorId: string; name: string; owedAg: Agorot; days: number }
  | { kind: 'stock'; distributorId: string; name: string; held: number; categoryName: string }
  | { kind: 'dispute'; distributorId: string; name: string; days: number }

export interface HomeData {
  /** قيمة الكروت اللي انستخدمت أول مرة اليوم: بسعر الجملة للموزع، وبسعر البيع للبيع المباشر. */
  usedTodayAg: Agorot
  collectedTodayAg: Agorot
  /** مجموع المستحق على الموزعين. الرصيد اللي للموزع ما بينطرح منه. */
  owedTotalAg: Agorot
  tasks: HomeTask[]
  /** null للبيع المباشر. مرتبة من الأكبر. */
  usageToday: { distributorId: string | null; name: string | null; valueAg: Agorot }[]
  /** للفني: بدون أرقام المال. */
  limited?: boolean
}

export interface DistributorRow {
  id: string
  name: string
  owedAg: Agorot
}

/** سطر بالكشف. الأحدث أول. */
export interface StatementEntry {
  id: string
  at: string
  type: EntryType
  /** للتصحيح: نوع الحركة الأصلية. */
  refType: EntryType | null
  cardsDelta: number
  chargeAg: Agorot
  paidAg: Agorot
  /** الرصيد بعد هالحركة. */
  balanceAg: Agorot
  batchNo: number | null
  note: string
  corrected: boolean
  /** مين سجّل الحركة: اسم المستخدم، أو «الراوتر» للاستخدام. */
  byName: string
}

export interface AccountDetail {
  id: string
  name: string
  area: string
  creditLimitAg: Agorot
  debtPolicy: DebtPolicy
  /** null إذا ما في تسوية لسا. */
  daysSinceSettlement: number | null
  held: number
  usedValueAg: Agorot
  paidAg: Agorot
  owedAg: Agorot
  openDispute: boolean
  entries: StatementEntry[]
  /** آخر حركة إذا كانت تسوية ما انصححت، عشان زر «صحّح آخر تسوية». */
  correctable: { id: string; paidAg: Agorot } | null
}

export interface AccountData {
  /** مرتبين من الأكثر مستحق. */
  distributors: DistributorRow[]
  current: AccountDetail | null
}

export interface UsedCard {
  code: string
  usedAt: string
  mac: string | null
}

/** خطأ من عملية: الكود بيتحول لرسالة بالواجهة. */
export interface ActionError {
  code: string
  held?: number
  codes?: string[]
  /** للقيم اللي إلها حدود: أصغر وأكبر قيمة مسموحة. */
  range?: [number, number]
}

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: ActionError }

export type SettleResult =
  /** المبلغ أكبر من المستحق، وما انسجل لسا: الواجهة لازم تسأل (dlg.overpay). */
  | { kind: 'confirm'; paidAg: Agorot; dueAg: Agorot; extraAg: Agorot }
  | { kind: 'saved'; entryId: string; paidAg: Agorot; extraAg: Agorot; remainingAg: Agorot }

export interface BatchForm {
  routers: { id: number; name: string }[]
  categories: { id: number; name: string; wholeAg: Agorot; saleAg: Agorot; hotspotServer?: string | null }[]
  distributors: { id: string; name: string; owedAg: Agorot; creditLimitAg: Agorot; debtPolicy: DebtPolicy }[]
  /** أكبر دفعة مسموحة. حد مؤقت لحد ما نجرب ألف كرت على راوتر حقيقي (HANDOFF القسم 8). */
  maxCount: number
  template: PrintTemplate
  hotspotServers: string[]
}

export type BatchStage = 'form' | 'sending' | 'sent' | 'done'

export interface BatchView {
  id: number
  no: number
  stage: BatchStage
  routerId: number
  categoryId: number
  routerName: string
  categoryName: string
  /** null للبيع المباشر. */
  distributorId: string | null
  distributorName: string | null
  debtPolicy: DebtPolicy | null
  count: number
  wholeAg: Agorot
  saleAg: Agorot
  /** أكدها الراوتر ولسا ما انطبعت. */
  toPrint: number
  /** انطبعت ولسا ما انسلمت. */
  toDeliver: number
  delivered: number
  pending: number
  printedTimes: number
  /** أول 6 كروت للمعاينة. */
  preview: { code: string; ready: boolean }[]
}

export interface SendOutcomeView {
  view: BatchView
  routerDown: boolean
  rejected: number
}

export interface BatchLogRow {
  id: number
  no: number
  categoryName: string
  /** null للبيع المباشر. */
  distributorName: string | null
  count: number
  used: number
  /** بالانتظار عند الراوتر. */
  pending: number
  printedTimes: number
  /** في كروت مؤكدة ممكن تنطبع. */
  printable: boolean
  stage: BatchStage
  createdAt: string
}

export type PrintTemplate = 'a4-12' | 'a4-24' | 'thermal'

export interface TemplateSettings {
  template: PrintTemplate
  networkName: string
  showPrice: boolean
  /** رقم الدعم على الكرت، من بيانات الشبكة. للقراءة بس هون. */
  phone: string
  bgImage?: string | null
}

export interface CategoryRow {
  id: number
  name: string
  routerProfile: string
  wholeAg: Agorot
  saleAg: Agorot
  hotspotServer?: string | null
}

/** حكم الفحص: ليش الكرت مش شغال، أو إنه سليم. النص بيتركب بالواجهة. */
export type CardVerdict =
  /** الراوتر لسا ما أكده: الدفعة بالانتظار. */
  | 'not_on_router_yet'
  /** على الراوتر بس لسا ما انسلم لموزع ولا انباع. */
  | 'not_delivered'
  | 'returned'
  /** في جلسة مفتوحة فيه هلأ. */
  | 'in_use'
  | 'expired'
  | 'used_time_left'
  | 'unused'
  /** عندنا مأكد بس مش موجود على الراوتر (غالبا reset). */
  | 'missing_on_router'
  /** موقوف على الراوتر بدون ما يكون مرتجع عندنا. */
  | 'disabled'

export type CardEvent =
  | { kind: 'generated'; at: string }
  | { kind: 'confirmed'; at: string }
  | { kind: 'printed'; at: string; times: number }
  | { kind: 'delivered'; at: string; to: string | null }
  | { kind: 'used'; at: string; mac: string | null }
  | { kind: 'returned'; at: string; from: string | null }
  | { kind: 'expired' }

export interface CardCheck {
  code: string
  verdict: CardVerdict
  /** الراوتر رد وقت الفحص. لو لا، الحكم من سجلنا بس. */
  routerChecked: boolean
  categoryName: string
  batchId: number
  batchNo: number
  /** null للبيع المباشر. */
  distributorName: string | null
  limitSeconds: number | null
  secondsLeft: number | null
  session: { id: string; mac: string; address: string; uptimeSeconds: number } | null
  history: CardEvent[]
}

export interface NetworkPool {
  id: string
  name: string
  ranges: string
  activeCount: number
  totalIps: number
  serverName?: string
}

export interface HotspotServerInfo {
  id: string
  name: string
  interface: string
  profile: string
  addressPool: string
}

export interface NetworkData {
  routers: { id: number; name: string; host: string; up: boolean; lastSeenAt: string | null; sessions: number | null }[]
  /** شغل بيستنى الراوتر، مثل إيقاف المرتجع. */
  queued: number
  /** null إذا الراوتر مش راد. */
  sessions: { id: string; code: string; categoryName: string | null; routerName: string; address: string; mac: string; secondsLeft: number | null; isUnlimited?: boolean; poolName?: string }[] | null
  pools: NetworkPool[]
  servers: HotspotServerInfo[]
  mock: boolean
  configured: boolean
}

export type ReportTab = 'collected' | 'commission' | 'stale'

export interface ReportsData {
  /** null = كل الوقت. */
  days: number | null
  collected: {
    /** قيمة الكروت اللي انستخدمت بالفترة، بسعر الجملة من دفعتها. */
    usedAg: Agorot
    /** المدفوع بالفترة، بعد التصحيحات. */
    paidAg: Agorot
    /** المستحق الحالي، مش للفترة بس. */
    owedAg: Agorot
    rows: { id: string; name: string; usedAg: Agorot; paidAg: Agorot; owedAg: Agorot }[]
  }
  /** فرق سعر البيع عن الجملة لكل كرت انستخدم بالفترة، بسعر دفعته. */
  commission: { id: string; name: string; cards: number; commissionAg: Agorot }[]
  stale: { id: string; name: string; held: number; returned: number; staleCards: number; lastDeliveryAt: string | null }[]
  /** الكرت المسلّم من أكثر من هيك يوم ولسا ما انستخدم بيعتبر راكد. */
  staleAfterDays: number
}

export type UserRole = 'owner' | 'technician'

export interface UserRow {
  id: number
  name: string
  role: UserRole
  hasPin: boolean
  active: boolean
}

export interface NetworkSettings {
  networkName: string
  /** رقم الدعم اللي بيطلع على الكرت. فاضي = ما بيطلع. */
  phone: string
}

/** قيم مؤقتة (HANDOFF القسم 10): الجلسات مع المستخدمين ممكن تغيرها. */
export interface Rules {
  collectAfterDays: number
  stockLowCards: number
  staleAfterDays: number
  defaultCreditLimitAg: Agorot
  maxBatchCount: number
}

export interface ImportPreview {
  token: string
  fileName: string
  /** صفوف فيها كود مقروء. */
  total: number
  fresh: number
  duplicates: number
  invalid: number
  /** الكروت حسب فئة الملف. categoryId = null: الفئة مش معروفة عندنا أو الملف ما فيه فئة. */
  groups: { profile: string | null; categoryId: number | null; categoryName: string | null; count: number; used: number }[]
}

export interface ImportChoice {
  /** null = بيع مباشر لحين ربطها (HANDOFF القسم 7). */
  distributorId: string | null
  /** للكروت اللي فئتها مش معروفة. null = ما بتنستورد. */
  fallbackCategoryId: number | null
}

export interface Backend {
  status(): AppStatus
  home(): HomeData
  account(distributorId: string | null): AccountData
  /** الكروت اللي انحسبت بحركة استخدام، أول 50. */
  usageCards(entryId: string): { cards: UsedCard[]; total: number }
  addDistributor(d: { name: string; area: string; openingAg: Agorot }, opKey: string): ActionResult<{ id: string }>
  /** allowExtra = false: إذا المبلغ أكبر من المستحق بيرجع confirm بدون ما يسجل. */
  settle(distributorId: string, paidAg: Agorot, allowExtra: boolean, opKey: string): ActionResult<SettleResult>
  correctSettlement(distributorId: string, entryId: string, opKey: string): ActionResult<{ entryId: string }>
  returnCards(distributorId: string, codes: string[], opKey: string): ActionResult<{ count: number; routerUp: boolean }>
  openDispute(distributorId: string, note: string, opKey: string): ActionResult<{ entryId: string }>
  closeDispute(distributorId: string, opKey: string): ActionResult<{ entryId: string }>
  setCreditLimit(distributorId: string, limitAg: Agorot): ActionResult
  batchForm(): BatchForm
  batchView(batchId: number): BatchView | null
  /** بيولد الدفعة وبيبعتها للراوتر بنفس الطلب. */
  createBatch(b: { routerId: number; categoryId: number; distributorId: string | null; count: number; codeFormat?: 'alphanumeric' | 'numeric' | 'alpha'; codeLength?: number; hotspotServer?: string | null }, opKey: string): Promise<ActionResult<SendOutcomeView>>
  /** إعادة إرسال الناقص بنفس الأكواد. */
  resendBatch(batchId: number): Promise<ActionResult<SendOutcomeView>>
  /**
   * new: المؤكد الجديد، again: نفس المطبوع لأن الورقة طلعت غلط.
   * بيفتح نافذة الطباعة. بينسجل بس لما الطباعة تنجح، والإلغاء (print_cancelled) ما بيغير شي.
   */
  printBatch(batchId: number, scope: 'new' | 'again'): Promise<ActionResult<BatchView>>
  deliverBatch(batchId: number, opKey: string): ActionResult<{ delivered: number; view: BatchView }>
  batchLog(): BatchLogRow[]
  /** إعادة طباعة مقصودة بنفس الأكواد، وبتنسجل. */
  reprintBatch(batchId: number): Promise<ActionResult<{ printedTimes: number }>>
  categories(): CategoryRow[]
  /** السعر الجديد للدفعات الجاية بس. البيع أقل من الجملة تحذير بدون منع. */
  setCategoryPrices(id: number, wholeAg: Agorot, saleAg: Agorot): ActionResult<{ saleBelowWhole: boolean }>
  addCategory(c: { name: string; routerProfile: string; wholeAg: Agorot; hotspotServer?: string | null }): ActionResult<{ id: number }>
  updateCategory(id: number, c: { name: string; routerProfile?: string; hotspotServer?: string | null }): ActionResult<void>
  deleteCategory(id: number): ActionResult<void>
  hotspotServers(): Promise<string[]>
  savePool(p: { id?: string; name: string; ranges: string }): Promise<ActionResult<void>>
  deletePool(nameOrId: string): Promise<ActionResult<void>>
  /** ملفات Hotspot على الراوتر. null إذا الراوتر مش راد. */
  addRouterProfile(p: { name: string; rateLimit?: string; sharedUsers?: number }): Promise<ActionResult<{ name: string }>>
  routerProfiles(): Promise<string[] | null>
  templateSettings(): TemplateSettings
  saveTemplateSettings(t: TemplateSettings): ActionResult
  /** null إذا الكود مش موجود. */
  checkCard(code: string): Promise<CardCheck | null>
  kickSession(sessionId: string): Promise<ActionResult>
  extendCard(code: string, minutes: number): Promise<ActionResult<{ newLimit: string }>>
  network(): Promise<NetworkData>
  /** بيجرب الاتصال عبر api-ssl، وإذا نجح بيحفظه وبيبدّل البرنامج عليه. */
  connectRouter(r: { host: string; port?: number; user: string; password: string }): Promise<ActionResult<{ name: string; profiles: string[] }>>
  reports(days: number | null): ReportsData
  /** ملف CSV بيفتح بـExcel. المستخدم بيختار وين ينحفظ. */
  exportReport(tab: ReportTab, days: number | null): Promise<ActionResult<{ path: string } | { cancelled: true }>>
  networkSettings(): NetworkSettings
  saveNetworkSettings(s: NetworkSettings): ActionResult
  users(): UserRow[]
  addUser(u: { name: string; role: UserRole; pin: string }): ActionResult<{ id: number }>
  rules(): Rules
  saveRules(r: Rules): ActionResult
  /** ملفات الراوتر مع اقتراح اسم ووقت لكل واحد، والفئات اللي انحفظت قبل. */
  setupCategories(): Promise<{ drafts: SetupCategoryDraft[] | null; saved: CategoryRow[] }>
  saveSetupCategories(rows: SetupCategoryDraft[]): ActionResult<{ count: number }>
  setSetupStep(step: SetupStep): void
  setupDistributors(): string[]
  /** بيولد كرت تجربة واحد بيع مباشر وبيبعته للراوتر. نفس الكرت إذا انطلب مرة ثانية. */
  setupTestCard(): Promise<ActionResult<{ code: string; confirmed: boolean }>>
  finishSetup(): void
  /** كشف الموزع للطباعة على A4. */
  printStatement(distributorId: string): Promise<ActionResult>
  /** التقرير كـPDF. المستخدم بيختار وين ينحفظ. */
  exportReportPdf(tab: ReportTab, days: number | null): Promise<ActionResult<{ path: string } | { cancelled: true }>>
  /** صفحة الطباعة بتطلب شغلها بالرقم، وبتبلغ لما تخلص رسم. */
  printJob(id: string): PrintJob | null
  printReady(id: string): void
  /** النسخ على الجهاز، الأحدث أول. بتشتغل حتى لو قاعدة البيانات ما فتحت. */
  backups(): { dir: string; items: BackupInfo[] }
  backupNow(): ActionResult<BackupInfo>
  /** نسخة بمكان بيختاره المستخدم (فلاشة مثلا). */
  saveBackupAs(): Promise<ActionResult<{ path: string } | { cancelled: true }>>
  /** بيفحص النسخة، بياخذ نسخة من الوضع الحالي، بيرجع للنسخة، وبيعيد تشغيل البرنامج. */
  restoreBackup(file: string): ActionResult
  /** نفس الاسترجاع، من ملف بيختاره المستخدم. */
  restoreFromFile(): Promise<ActionResult<{ cancelled: true } | { restarting: true }>>
  /** بيقرأ ملف CSV وبيرجع شو فيه، بدون ما يسجل شي. */
  importPreview(): Promise<ActionResult<ImportPreview | { cancelled: true }>>
  importCommit(token: string, choice: ImportChoice, opKey: string): ActionResult<{ imported: number; skipped: number; batches: number[] }>
  license(): LicenseInfo
  activateLicense(key: string): ActionResult<LicenseInfo>
  checkForUpdate(): Promise<UpdateView>
  installUpdate(): ActionResult
  /** أول رمز لصاحب الشبكة، لما ما في ولا رمز. بيدخل فيه مباشرة. */
  createOwnerPin(pin: string): ActionResult
  login(userId: number, pin: string): ActionResult
  /** نسيان رمز المدير: كود الجهاز ورمز الطلب اللي بينبعتوا للدعم. */
  pinResetRequest(): { deviceCode: string; requestCode: string }
  pinResetApply(key: string, pin: string): ActionResult
  logout(): void
  setUserPin(userId: number, pin: string): ActionResult
  setUserActive(userId: number, active: boolean): ActionResult
  setLockAfter(minutes: number): ActionResult
  /** وضع التطوير بس. */
  devSetRouter(up: boolean): void
}

export type BackendMethod = keyof Backend
