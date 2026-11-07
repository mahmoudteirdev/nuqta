import { describe, expect, it } from 'vitest'
import { encodeLength, encodeSentence, parseAttributes, SentenceReader } from './protocol'
import { parseUptime } from './types'

describe('word length encoding (MikroTik API docs)', () => {
  it.each([
    [0x00, [0x00]],
    [0x7f, [0x7f]],
    [0x80, [0x80, 0x80]],
    [0x3fff, [0xbf, 0xff]],
    [0x4000, [0xc0, 0x40, 0x00]],
    [0x1fffff, [0xdf, 0xff, 0xff]],
    [0x200000, [0xe0, 0x20, 0x00, 0x00]],
    [0xfffffff, [0xef, 0xff, 0xff, 0xff]],
    [0x10000000, [0xf0, 0x10, 0x00, 0x00, 0x00]]
  ])('%i', (n, bytes) => {
    expect([...encodeLength(n)]).toEqual(bytes)
  })
})

describe('SentenceReader', () => {
  it('round-trips words across every length boundary we can afford, including Arabic bytes', () => {
    const words = ['/ip/hotspot/user/add', 'x'.repeat(0x7f), 'y'.repeat(0x80), 'z'.repeat(0x3fff), 'w'.repeat(0x4000), '=comment=شبكة النور', '=name=']
    const r = new SentenceReader()
    expect(r.push(encodeSentence(words))).toEqual([words])
  })

  it('handles sentences arriving one byte at a time, and several in one chunk', () => {
    const a = ['!re', '=name=7K4F-92QM', '=uptime=1h2m', '.tag=3']
    const b = ['!done', '.tag=3']
    const bytes = Buffer.concat([encodeSentence(a), encodeSentence(b)])
    const r = new SentenceReader()
    const got: string[][] = []
    for (const byte of bytes) got.push(...r.push(Buffer.from([byte])))
    expect(got).toEqual([a, b])
    expect(new SentenceReader().push(bytes)).toEqual([a, b])
  })

  it('reads attributes whose value contains «=»', () => {
    expect(parseAttributes(['!re', '=comment=a=b', '=name=X', '.tag=1'])).toEqual({ comment: 'a=b', name: 'X' })
  })
})

describe('parseUptime', () => {
  it.each([
    ['0s', 0], ['45s', 45], ['1h2m3s', 3723], ['1w2d', 777600], ['3h', 10800], ['500ms', 0], ['1m500ms', 60], ['01:02:03', 3723], ['2d 01:00:00', 176400], [undefined, 0]
  ])('%s = %i seconds', (s, n) => {
    expect(parseUptime(s)).toBe(n)
  })
})
