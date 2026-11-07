// أكواد الكروت: 8 خانات بصيغة XXXX-XXXX من 31 رمز، بدون 0 O 1 I L عشان ما تنلخبط بالقراءة.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/

export type RandomBytes = (n: number) => Uint8Array

const cryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

// أكبر مضاعف لـ31 تحت 256. البايت اللي فوقه بينرمى عشان التوزيع يضل متساوي.
const LIMIT = 256 - (256 % CODE_ALPHABET.length)

export function generateCode(random: RandomBytes = cryptoBytes): string {
  let out = ''
  while (out.length < 8) {
    for (const b of random(16)) {
      if (b >= LIMIT) continue
      out += CODE_ALPHABET[b % CODE_ALPHABET.length]
      if (out.length === 8) break
    }
  }
  return out.slice(0, 4) + '-' + out.slice(4)
}

/**
 * بيولد count كود جديد، ما بيتكرر بينهم ولا مع الموجود.
 * الكود فريد على مستوى الشبكة كلها، مش لكل راوتر (HANDOFF القسم 7).
 */
export function generateCodes(count: number, exists: (code: string) => boolean, random: RandomBytes = cryptoBytes): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`bad count ${count}`)
  const made = new Set<string>()
  let tries = 0
  while (made.size < count) {
    if (++tries > count * 20 + 100) throw new Error('could not generate unique codes')
    const c = generateCode(random)
    if (!made.has(c) && !exists(c)) made.add(c)
  }
  return [...made]
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}
