// حالات الكرت والدفعة (HANDOFF القسم 6). نفس الجدول بيولّد trigger في قاعدة البيانات،
// فالانتقال الممنوع بينرفض من الواجهة ومن قاعدة البيانات مع بعض.
//
// generated → confirmed → printed → delivered → active → expired
//     │                                  └→ returned (disabled على الراوتر)
//     └→ pending (ما بينطبع)  ← إعادة إرسال نفس الكود

export type CardStatus = 'generated' | 'pending' | 'confirmed' | 'printed' | 'delivered' | 'active' | 'expired' | 'returned'

export const CARD_TRANSITIONS: Readonly<Record<CardStatus, readonly CardStatus[]>> = {
  generated: ['confirmed', 'pending'],
  pending: ['confirmed'],
  confirmed: ['printed'],
  printed: ['delivered'],
  delivered: ['active', 'returned'],
  active: ['expired'],
  expired: [],
  returned: []
}

/** الطباعة ممنوعة قبل التأكيد. إعادة الطباعة بنفس الأكواد مسموحة بعده. */
export const PRINTABLE: ReadonlySet<CardStatus> = new Set(['confirmed', 'printed', 'delivered'])

export function canMove(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to)
}

/** الدفعة: form → sending → sent → done. الفورم بينقفل من بعد form. */
export type BatchStatus = 'form' | 'sending' | 'sent' | 'done'

export const BATCH_TRANSITIONS: Readonly<Record<BatchStatus, readonly BatchStatus[]>> = {
  form: ['sending'],
  sending: ['sent'],
  // إعادة إرسال الناقص بترجّعها لـsending.
  sent: ['sending', 'done'],
  done: []
}
