// المال integer بالأغورة في كل مكان (HANDOFF القسم 5، القاعدة 6). العرض بس بيحوّل لشيكل.

export type Agorot = number

/** 1320 شيكل ← 132000 أغورة. للثوابت والاختبارات، مش لإدخال المستخدم (هذا parseAgorot). */
export function shekels(n: number): Agorot {
  if (!Number.isSafeInteger(n)) throw new RangeError(`shekels() needs an integer, got ${n}`)
  return n * 100
}

export function isAgorot(n: unknown): n is Agorot {
  return typeof n === 'number' && Number.isSafeInteger(n)
}

/** ₪1,320 أو ₪12.50. بدون إشارة: الإشارة بيقررها السياق (له، أو حركة سالبة). */
export function formatMoney(ag: Agorot): string {
  const abs = Math.abs(ag)
  const whole = Math.floor(abs / 100)
  const rest = abs % 100
  return '₪' + whole.toLocaleString('en-US') + (rest ? '.' + String(rest).padStart(2, '0') : '')
}

/** الرصيد: الموجب عليه، والسالب رصيد له وبيظهر «له ₪X»، مش بإشارة ناقص. */
export function formatBalance(ag: Agorot): string {
  return (ag < 0 ? 'له ' : '') + formatMoney(ag)
}

/** مبلغ حركة في الكشف: التصحيح بيظهر بإشارة ناقص. */
export function formatSigned(ag: Agorot): string {
  return (ag < 0 ? '-' : '') + formatMoney(ag)
}

export function multiply(unit: Agorot, count: number): Agorot {
  const r = unit * count
  if (!Number.isSafeInteger(r)) throw new RangeError('money overflow')
  return r
}
