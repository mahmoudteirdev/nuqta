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

export const TITLES: Record<ScreenId, string> = {
  home: 'شغل اليوم',
  account: 'الموزعين',
  batch: 'الكروت',
  card: 'فحص كرت',
  network: 'الشبكة',
  reports: 'التقارير',
  settings: 'الإعدادات'
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

export const EMPTY: Record<ScreenId, { title: string; body: string; cta: string; go: ScreenId }> = {
  home: { title: 'ما في شغل اليوم', body: 'كل الحسابات المتأخرة انسوت، وما في دفعات بالانتظار.', cta: 'توليد كروت', go: 'batch' },
  account: { title: 'لسا ما أضفت موزعين', body: 'أضف أول موزع عشان تتابع كروته وحسابه.', cta: 'أضف موزع', go: 'account' },
  batch: { title: 'ما في فئات على الراوتر', body: 'أنشئ فئة بوقت وسرعة وسعر، وبعدها ولّد أول دفعة.', cta: 'أنشئ فئة', go: 'batch' },
  card: { title: 'اكتب كود الكرت', body: 'بتشوف حالته وسجله والخطوة الجاية.', cta: 'ابدأ الفحص', go: 'card' },
  network: { title: 'ما في راوتر مربوط', body: 'اربط أول راوتر عشان تشوف المتصلين وتولّد كروت.', cta: 'اربط راوتر', go: 'network' },
  reports: { title: 'لسا ما في بيانات', body: 'التقرير بيظهر بعد أول استخدام للكروت.', cta: 'توليد كروت', go: 'batch' },
  settings: { title: 'ما في إعدادات محفوظة', body: 'ابدأ باسم الشبكة اللي بيطلع على الكرت.', cta: 'بيانات الشبكة', go: 'settings' }
}
