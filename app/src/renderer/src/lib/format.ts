// صيغ النصوص بحسب اللغة. المال من @shared/money.
import { getLang } from './i18n'

export { formatBalance, formatMoney, formatSigned } from '@shared/money'

/** يوم، يومين، 3 أيام … 10 أيام، 11 يوم / 1 day, 2 days... */
export function daysText(n: number, lang = getLang()): string {
  if (lang === 'en') return n === 1 ? '1 day' : `${n} days`
  return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوم`
}

/** كرت واحد، كرتين، 6 كروت، 12 كرت / 1 card, 2 cards... */
export function cardsText(n: number, lang = getLang()): string {
  if (lang === 'en') return n === 1 ? '1 card' : `${n.toLocaleString('en-US')} cards`
  return n === 1 ? 'كرت واحد' : n === 2 ? 'كرتين' : n >= 3 && n <= 10 ? `${n} كروت` : `${n.toLocaleString('en-US')} كرت`
}

export function todayText(d = new Date(), lang = getLang()): string {
  const loc = lang === 'en' ? 'en-US' : 'ar-u-nu-latn'
  return new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
}

function hoursText(h: number, lang = getLang()): string {
  if (lang === 'en') return h === 1 ? '1 hour' : `${h} hours`
  return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h >= 3 && h <= 10 ? `${h} ساعات` : `${h} ساعة`
}

function durationText(s: number, lang = getLang()): string {
  if (s >= 86_400) return daysText(Math.floor(s / 86_400), lang)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (lang === 'en') {
    if (h === 0) return `${Math.max(m, 1)}m`
    return m ? `${h}h ${m}m` : hoursText(h, 'en')
  }
  if (h === 0) return `${Math.max(m, 1)} دقيقة`
  return m ? `${hoursText(h, 'ar')} و${m} دقيقة` : hoursText(h, 'ar')
}

/** الوقت الباقي على الكرت: «3 ساعات كاملة»، «يوم كامل» / "Full 3 hours", "2h 30m" */
export function leftText(left: number | null, limit: number | null, lang = getLang()): string {
  if (left === null) return '—'
  if (left === 0) return lang === 'en' ? '0' : 'صفر'
  if (limit !== null && left >= limit) {
    const d = durationText(limit, lang)
    if (lang === 'en') return `Full ${d}`
    return d === 'يوم' ? 'يوم كامل' : `${d} كاملة`
  }
  return durationText(left, lang)
}
