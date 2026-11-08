// أكواد الكروت: تدعم أرقام وحروف (XXXX-XXXX)، أو أرقام فقط، أو حروف فقط.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ0-9-]{4,16}$/

export type CodeFormat = 'alphanumeric' | 'numeric' | 'alpha'

export interface CodeOptions {
  format?: CodeFormat
  length?: number
}

export type RandomBytes = (n: number) => Uint8Array

const cryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

export function generateCode(optsOrRandom?: CodeOptions | RandomBytes, maybeRandom?: RandomBytes): string {
  const isRandom = typeof optsOrRandom === 'function'
  const random: RandomBytes = isRandom ? optsOrRandom : (maybeRandom ?? cryptoBytes)
  const opts: CodeOptions = isRandom ? {} : (optsOrRandom ?? {})

  const format = opts.format ?? 'alphanumeric'
  const len = opts.length ?? 8

  let alphabet = CODE_ALPHABET
  if (format === 'numeric') alphabet = '0123456789'
  else if (format === 'alpha') alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ'

  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < len) {
    for (const b of random(16)) {
      if (b >= limit) continue
      out += alphabet[b % alphabet.length]
      if (out.length === len) break
    }
  }

  // إذا 8 خانات وحروف أو أرقام وحروف، بننسقها بفاصل في المنتصف XXXX-XXXX
  if (len === 8 && format !== 'numeric') {
    return out.slice(0, 4) + '-' + out.slice(4)
  }
  return out
}

/**
 * بيولد count كود جديد، ما بيتكرر بينهم ولا مع الموجود.
 * الكود فريد على مستوى الشبكة كلها، مش لكل راوتر (HANDOFF القسم 7).
 */
export function generateCodes(
  count: number,
  exists: (code: string) => boolean,
  optsOrRandom?: CodeOptions | RandomBytes,
  maybeRandom?: RandomBytes
): string[] {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(`bad count ${count}`)
  const isRandom = typeof optsOrRandom === 'function'
  const random: RandomBytes = isRandom ? optsOrRandom : (maybeRandom ?? cryptoBytes)
  const opts: CodeOptions = isRandom ? {} : (optsOrRandom ?? {})

  const made = new Set<string>()
  let tries = 0
  while (made.size < count) {
    if (++tries > count * 20 + 100) throw new Error('could not generate unique codes')
    const c = generateCode(opts, random)
    if (!made.has(c) && !exists(c)) made.add(c)
  }
  return [...made]
}

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}
