// إدخال الأرقام والأكواد. num() وnormCode() منقولين حرفيا من reference/Final-Prototype.dc.html،
// واختبار input.test.ts بيقارنهم بنسخة النموذج نفسها. أي تغيير لازم يضل يعطي نفس النتيجة.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** بيحوّل الإدخال لصيغة لاتينية موحدة. الفاصلة قبل خانة أو خانتين في الآخر عشرية، وغيرها آلاف. */
function normalizeNumberText(v: unknown): string {
  return String(v == null ? '' : v)
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[\s₪]/g, '')
    .replace(/[,،٬](\d{1,2})$/, '.$1')
    .replace(/[,،٬]/g, '')
}

const VALID = /^(\d+)(?:\.(\d{1,2}))?$/

/** بيقرأ رقم مكتوب بأي صيغة مقبولة. بيرجع NaN إذا مش رقم صالح. للعدد والعرض بس، مش للمال. */
export function num(v: unknown): number {
  const s = normalizeNumberText(v)
  return VALID.test(s) ? Number(s) : NaN
}

/**
 * بيقرأ مبلغ بالشيكل وبيرجعه integer بالأغورة، بدون ما يمر على float.
 * بيرجع NaN إذا الإدخال مش مبلغ صالح أو أكبر من الحد الآمن.
 */
export function parseAgorot(v: unknown): number {
  const m = VALID.exec(normalizeNumberText(v))
  if (!m) return NaN
  const whole = m[1]!.replace(/^0+(?=\d)/, '')
  const frac = (m[2] ?? '').padEnd(2, '0')
  if (whole.length > 13) return NaN
  return Number(whole) * 100 + Number(frac)
}

// لوحة المفاتيح العربية ← الحرف اللاتيني على نفس الزر.
const KB: Record<string, string> = {
  ض: 'Q', ص: 'W', ث: 'E', ق: 'R', ف: 'T', غ: 'Y', ع: 'U', ه: 'I', خ: 'O', ح: 'P',
  ش: 'A', س: 'S', ي: 'D', ب: 'F', ل: 'G', ا: 'H', ت: 'J', ن: 'K', م: 'L',
  ئ: 'Z', ء: 'X', ؤ: 'C', ر: 'V', ى: 'N', ة: 'M'
}

/** بيوحّد كود الكرت لصيغة XXXX-XXXX إذا طوله 8 بعد التنظيف. */
export function normCode(v: unknown): string {
  const clean = (t: string): string =>
    t
      .replace(/[\u0621-\u064A]/g, (c) => KB[c] ?? '')
      .toUpperCase()
      .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
      .replace(/[^A-Z0-9]/g, '')
  const raw = String(v || '')
  let s = clean(raw.replace(/لا/g, 'B'))
  if (s.length !== 8 && raw.indexOf('لا') !== -1) s = clean(raw)
  return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4) : s
}
