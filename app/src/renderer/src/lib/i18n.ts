import messagesAr from './messages.ar.json'
import messagesEn from './messages.en.json'

export type Lang = 'ar' | 'en'

export type MessageKey = keyof typeof messagesAr

let currentLang: Lang = (() => {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('nuqta_lang_user_set') === 'true') {
    const saved = localStorage.getItem('nuqta_lang')
    if (saved === 'ar' || saved === 'en') return saved
  }
  return 'ar'
})()

export function getLang(): Lang {
  return currentLang
}

export function setLang(lang: Lang, persist = true): void {
  currentLang = lang
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem('nuqta_lang', lang)
    localStorage.setItem('nuqta_lang_user_set', 'true')
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }
}

/** بيرجع الرسالة مع تعويض المتغيرات {name} باللغة الحالية أو المحددة. */
export function t(key: MessageKey | string, vars: Record<string, string | number> = {}, lang?: Lang): string {
  const active = lang ?? currentLang
  const dict = active === 'en' ? (messagesEn as Record<string, string>) : (messagesAr as Record<string, string>)
  const fallback = messagesAr as Record<string, string>
  const template = dict[key] ?? fallback[key] ?? key
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** بيفصل أول جملة عن الباقي، للعنوان العريض في شريط الحالة. */
export function splitFirstSentence(text: string): [string, string] {
  const i = text.indexOf('. ')
  return i === -1 ? [text, ''] : [text.slice(0, i + 1), text.slice(i + 2)]
}

/** نص وقت آخر نسخة احتياطية بحسب اللغة. */
export function backupText(iso: string | null, lang: Lang = currentLang): string {
  if (!iso) return t('status.backup.none', {}, lang)
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (mins < 1) return t('status.backup.justNow', {}, lang)
  if (lang === 'en') {
    if (mins < 60) return t(mins === 1 ? 'status.backup.min1' : 'status.backup.mins', { m: mins }, 'en')
    const hours = Math.round(mins / 60)
    if (hours < 24) return t(hours === 1 ? 'status.backup.hour1' : 'status.backup.hours', { h: hours }, 'en')
    const days = Math.round(hours / 24)
    return t(days === 1 ? 'status.backup.day1' : 'status.backup.days', { d: days }, 'en')
  }
  if (mins < 60) {
    const key = mins === 1 ? 'status.backup.min1' : mins === 2 ? 'status.backup.min2' : mins <= 10 ? 'status.backup.mins' : 'status.backup.minsMany'
    return t(key, { m: mins }, 'ar')
  }
  const hours = Math.round(mins / 60)
  if (hours < 24) {
    const key = hours === 1 ? 'status.backup.hour1' : hours === 2 ? 'status.backup.hour2' : hours <= 10 ? 'status.backup.hours' : 'status.backup.hoursMany'
    return t(key, { h: hours }, 'ar')
  }
  const days = Math.round(hours / 24)
  const key = days === 1 ? 'status.backup.day1' : days === 2 ? 'status.backup.day2' : days <= 10 ? 'status.backup.days' : 'status.backup.daysMany'
  return t(key, { d: days }, 'ar')
}
