import { getLang, type Lang } from './i18n'

export type ScreenId = 'home' | 'account' | 'batch' | 'card' | 'network' | 'reports' | 'settings'
export type NavId = Exclude<ScreenId, 'card'>
export type StateMode = 'normal' | 'loading' | 'error' | 'empty'

export const NAV: { id: NavId; label: string }[] = [
  { id: 'home', label: 'الرئيسية' },
  { id: 'account', label: 'الموزعين' },
  { id: 'batch', label: 'الكروت' },
  { id: 'network', label: 'الشبكة' },
  { id: 'reports', label: 'التقارير' },
  { id: 'settings', label: 'الإعدادات' }
]

export function getNav(lang: Lang = getLang()): { id: NavId; label: string }[] {
  if (lang === 'en') {
    return [
      { id: 'home', label: 'Dashboard' },
      { id: 'account', label: 'Distributors' },
      { id: 'batch', label: 'Cards' },
      { id: 'network', label: 'Network' },
      { id: 'reports', label: 'Reports' },
      { id: 'settings', label: 'Settings' }
    ]
  }
  return NAV
}

export const TITLES: Record<ScreenId, string> = {
  home: 'شغل اليوم',
  account: 'الموزعين',
  batch: 'الكروت',
  card: 'فحص كرت',
  network: 'الشبكة',
  reports: 'التقارير',
  settings: 'الإعدادات'
}

export function getTitle(id: ScreenId, lang: Lang = getLang()): string {
  if (lang === 'en') {
    const titles: Record<ScreenId, string> = {
      home: "Today's Work",
      account: 'Distributors',
      batch: 'Cards',
      card: 'Check Card',
      network: 'Network',
      reports: 'Reports',
      settings: 'Settings'
    }
    return titles[id] ?? id
  }
  return TITLES[id] ?? id
}

// نصوص الخطأ والفاضي لكل قسم، من النموذج.
export const ERROR_TITLES: Record<ScreenId, string> = {
  home: 'ما قدرنا نفتح شغل اليوم',
  account: 'ما قدرنا نفتح حسابات الموزعين',
  batch: 'ما قدرنا نجيب الكروت والفئات',
  card: 'ما قدرنا نفحص الكرت',
  network: 'ما قدرنا نقرأ حالة الشبكة',
  reports: 'ما قدرنا نجهز التقرير',
  settings: 'ما قدرنا نفتح الإعدادات'
}

export function getErrorTitle(id: ScreenId, lang: Lang = getLang()): string {
  if (lang === 'en') {
    const errs: Record<ScreenId, string> = {
      home: "Unable to load today's tasks",
      account: 'Unable to load distributor accounts',
      batch: 'Unable to load cards and categories',
      card: 'Unable to check card',
      network: 'Unable to read network status',
      reports: 'Unable to prepare report',
      settings: 'Unable to open settings'
    }
    return errs[id] ?? id
  }
  return ERROR_TITLES[id] ?? id
}

export const EMPTY: Record<ScreenId, { title: string; body: string; cta: string; go: ScreenId }> = {
  home: { title: 'ما في شغل اليوم', body: 'كل الحسابات المتأخرة انسوت، وما في دفعات بالانتظار.', cta: 'توليد كروت', go: 'batch' },
  account: { title: 'لسا ما أضفت موزعين', body: 'أضف أول موزع عشان تتابع كروته وحسابه.', cta: 'أضف موزع', go: 'account' },
  batch: { title: 'ما في فئات على الراوتر', body: 'أنشئ فئة بوقت وسرعة وسعر، وبعدها ولّد أول دفعة.', cta: 'أنشئ فئة', go: 'batch' },
  card: { title: 'اكتب كود الكرت', body: 'بتشوف حالته وسجله والخطوة الجاية.', cta: 'ابدأ الفحص', go: 'card' },
  network: { title: 'ما في راوتر مربوط', body: 'اربط أول راوتر عشان تشوف المتصلين وتولّد كروت.', cta: 'اربط راوتر', go: 'network' },
  reports: { title: 'لسا ما في بيانات', body: 'التقرير بيظهر بعد أول استخدام للكروت.', cta: 'توليد كروت', go: 'batch' },
  settings: { title: 'ما في إعدادات محفوظة', body: 'ابدأ باسم الشبكة اللي بيطلع على الكرت.', cta: 'بيانات الشبكة', go: 'settings' }
}

export function getEmpty(id: ScreenId, lang: Lang = getLang()): { title: string; body: string; cta: string; go: ScreenId } {
  if (lang === 'en') {
    const empty: Record<ScreenId, { title: string; body: string; cta: string; go: ScreenId }> = {
      home: { title: 'No tasks today', body: 'All pending settlements are done, no batches waiting.', cta: 'Generate Cards', go: 'batch' },
      account: { title: 'No distributors yet', body: 'Add your first distributor to track cards and balance.', cta: 'Add Distributor', go: 'account' },
      batch: { title: 'No categories on router', body: 'Create a category with time, profile and price, then generate your first batch.', cta: 'Create Category', go: 'batch' },
      card: { title: 'Enter card code', body: 'View status, history, and remaining uptime.', cta: 'Check Now', go: 'card' },
      network: { title: 'No router connected', body: 'Connect your first router to see active users and generate cards.', cta: 'Connect Router', go: 'network' },
      reports: { title: 'No data yet', body: 'Reports appear after cards are first used.', cta: 'Generate Cards', go: 'batch' },
      settings: { title: 'No settings saved', body: 'Start by setting the network name printed on cards.', cta: 'Network Details', go: 'settings' }
    }
    return empty[id] ?? EMPTY[id]
  }
  return EMPTY[id]
}
