// نص سطور الكشف: نفسه بالشاشة والكشف المطبوع بحسب اللغة.
import type { StatementEntry } from '@shared/api'
import { cardsText, formatMoney } from './format'
import { getLang } from './i18n'

export function getTimeFormat(lang = getLang()): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
}

export const time = getTimeFormat('ar')

export const dateText = (iso: string, lang = getLang()): string => {
  const d = new Date(iso)
  const loc = lang === 'en' ? 'en-US' : 'ar-u-nu-latn'
  const isThisYear = d.getFullYear() === new Date().getFullYear()
  const fmt = new Intl.DateTimeFormat(loc, isThisYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
  return fmt.format(d)
}

export function actionText(e: StatementEntry, lang = getLang()): string {
  if (lang === 'en') {
    switch (e.type) {
      case 'opening': return 'Opening balance'
      case 'delivery': return e.batchNo ? `Delivered batch B-${e.batchNo}` : 'Delivery'
      case 'usage': return `Usage: ${cardsText(-e.cardsDelta, 'en')}`
      case 'settlement': return 'Settlement'
      case 'return': return `Return: ${cardsText(-e.cardsDelta, 'en')}`
      case 'correction':
        return e.refType === 'settlement' ? `Correction: voided ${formatMoney(-e.paidAg)}` : e.refType === 'opening' ? 'Correction: opening balance' : 'Correction'
      case 'dispute_open': return e.note ? `Dispute opened: ${e.note}` : 'Dispute opened'
      case 'dispute_close': return 'Dispute resolved'
    }
  }
  switch (e.type) {
    case 'opening': return 'رصيد افتتاحي'
    case 'delivery': return e.batchNo ? `تسليم دفعة B-${e.batchNo}` : 'تسليم'
    case 'usage': return `استخدام ${cardsText(-e.cardsDelta, 'ar')}`
    case 'settlement': return 'تسوية'
    case 'return': return `مرتجع ${cardsText(-e.cardsDelta, 'ar')}`
    case 'correction':
      return e.refType === 'settlement' ? `تصحيح: إلغاء تسوية ${formatMoney(-e.paidAg)}` : e.refType === 'opening' ? 'تصحيح: الرصيد الافتتاحي' : 'تصحيح'
    case 'dispute_open': return e.note ? `خلاف مفتوح: ${e.note}` : 'خلاف مفتوح'
    case 'dispute_close': return 'انسكر الخلاف'
  }
}

export const cardsCell = (n: number) => (n ? `${n > 0 ? '+' : '-'}${Math.abs(n).toLocaleString('en-US')}` : '—')
