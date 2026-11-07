// صيغة RouterOS API على السلك: كل كلمة قبلها طولها بالبايت، والجملة بتخلص بكلمة طولها صفر.
// المرجع: https://help.mikrotik.com/docs/display/ROS/API

export function encodeLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  if (n < 0x4000) return Buffer.from([(n >> 8) | 0x80, n & 0xff])
  if (n < 0x200000) return Buffer.from([(n >> 16) | 0xc0, (n >> 8) & 0xff, n & 0xff])
  if (n < 0x10000000) return Buffer.from([(n >>> 24) | 0xe0, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
  return Buffer.from([0xf0, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
}

export function encodeSentence(words: readonly string[]): Buffer {
  const parts: Buffer[] = []
  for (const w of words) {
    const b = Buffer.from(w, 'utf8')
    parts.push(encodeLength(b.length), b)
  }
  parts.push(Buffer.from([0]))
  return Buffer.concat(parts)
}

/** بيقرأ الطول من أول buf. بيرجع null إذا البايتات لسا ما وصلت كلها. */
function decodeLength(buf: Buffer, at: number): { len: number; size: number } | null {
  if (at >= buf.length) return null
  const b = buf[at]!
  const need = (b & 0x80) === 0 ? 1 : (b & 0xc0) === 0x80 ? 2 : (b & 0xe0) === 0xc0 ? 3 : (b & 0xf0) === 0xe0 ? 4 : 5
  if (at + need > buf.length) return null
  if (need === 1) return { len: b, size: 1 }
  if (need === 2) return { len: ((b & 0x3f) << 8) | buf[at + 1]!, size: 2 }
  if (need === 3) return { len: ((b & 0x1f) << 16) | (buf[at + 1]! << 8) | buf[at + 2]!, size: 3 }
  if (need === 4) return { len: ((b & 0x0f) * 0x1000000) + ((buf[at + 1]! << 16) | (buf[at + 2]! << 8) | buf[at + 3]!), size: 4 }
  return { len: buf.readUInt32BE(at + 1), size: 5 }
}

/** بيجمع البايتات اللي بتوصل متقطعة من الشبكة، وبيطلع جمل كاملة. */
export class SentenceReader {
  #buf: Buffer<ArrayBufferLike> = Buffer.alloc(0)

  push(chunk: Buffer): string[][] {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk
    const out: string[][] = []
    let at = 0
    let words: string[] = []
    let sentenceStart = 0
    for (;;) {
      const h = decodeLength(this.#buf, at)
      if (!h || at + h.size + h.len > this.#buf.length) break
      at += h.size
      if (h.len === 0) {
        out.push(words)
        words = []
        sentenceStart = at
        continue
      }
      words.push(this.#buf.toString('utf8', at, at + h.len))
      at += h.len
    }
    // الجملة الناقصة بتضل بالذاكرة لحين ما يكمل باقيها.
    this.#buf = this.#buf.subarray(sentenceStart)
    return out
  }
}

export interface Reply {
  /** !re: صف بيانات لكل عنصر. */
  rows: Record<string, string>[]
  /** خصائص !done، مثل ret بعد add. */
  done: Record<string, string>
}

/** «=name=value» ← {name: value}. القيمة ممكن فيها «=». */
export function parseAttributes(words: readonly string[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const w of words) {
    if (!w.startsWith('=')) continue
    const i = w.indexOf('=', 1)
    if (i > 0) o[w.slice(1, i)] = w.slice(i + 1)
  }
  return o
}
