// صيغ النصوص العربية اللي بتتكرر. المال من @shared/money.

export { formatBalance, formatMoney, formatSigned } from '@shared/money'

/** من النموذج: يوم، يومين، 3 أيام … 10 أيام، 11 يوم. */
export function daysText(n: number): string {
  return n === 1 ? 'يوم' : n === 2 ? 'يومين' : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوم`
}

/** كرت واحد، كرتين، 6 كروت، 12 كرت. */
export function cardsText(n: number): string {
  return n === 1 ? 'كرت واحد' : n === 2 ? 'كرتين' : n >= 3 && n <= 10 ? `${n} كروت` : `${n.toLocaleString('en-US')} كرت`
}

const longDate = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
export const todayText = (d = new Date()): string => longDate.format(d)

function hoursText(h: number): string {
  return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h >= 3 && h <= 10 ? `${h} ساعات` : `${h} ساعة`
}

function durationText(s: number): string {
  if (s >= 86_400) return daysText(Math.floor(s / 86_400))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${Math.max(m, 1)} دقيقة`
  return m ? `${hoursText(h)} و${m} دقيقة` : hoursText(h)
}

/** الوقت الباقي على الكرت بكلام: «3 ساعات كاملة»، «يوم كامل»، «ساعتين و50 دقيقة». */
export function leftText(left: number | null, limit: number | null): string {
  if (left === null) return '—'
  if (left === 0) return 'صفر'
  if (limit !== null && left >= limit) {
    const d = durationText(limit)
    // المذكر المفرد (يوم) بياخذ «كامل»، والباقي «كاملة».
    return d === 'يوم' ? 'يوم كامل' : `${d} كاملة`
  }
  return durationText(left)
}
