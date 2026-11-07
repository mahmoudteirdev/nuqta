// نص سطور الكشف: نفسه بالشاشة والكشف المطبوع.

import type { StatementEntry } from '@shared/api'
import { cardsText, formatMoney } from './format'

const dayMonth = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long' })
const dayMonthYear = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })
export const time = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' })
export const dateText = (iso: string) => {
  const d = new Date(iso)
  return (d.getFullYear() === new Date().getFullYear() ? dayMonth : dayMonthYear).format(d)
}

export function actionText(e: StatementEntry): string {
  switch (e.type) {
    case 'opening': return 'رصيد افتتاحي'
    case 'delivery': return e.batchNo ? `تسليم دفعة B-${e.batchNo}` : 'تسليم'
    case 'usage': return `استخدام ${cardsText(-e.cardsDelta)}`
    case 'settlement': return 'تسوية'
    case 'return': return `مرتجع ${cardsText(-e.cardsDelta)}`
    case 'correction':
      return e.refType === 'settlement' ? `تصحيح: إلغاء تسوية ${formatMoney(-e.paidAg)}` : e.refType === 'opening' ? 'تصحيح: الرصيد الافتتاحي' : 'تصحيح'
    case 'dispute_open': return e.note ? `خلاف مفتوح: ${e.note}` : 'خلاف مفتوح'
    case 'dispute_close': return 'انسكر الخلاف'
  }
}

export const cardsCell = (n: number) => (n ? `${n > 0 ? '+' : '-'}${Math.abs(n).toLocaleString('en-US')}` : '—')
