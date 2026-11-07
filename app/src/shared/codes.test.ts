import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, generateCode, generateCodes, isValidCode } from './codes'
import { normCode } from './input'

describe('codes', () => {
  it('uses 31 symbols without 0 O 1 I L', () => {
    expect(CODE_ALPHABET).toHaveLength(31)
    expect(new Set(CODE_ALPHABET).size).toBe(31)
    for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c)
  })

  it('makes XXXX-XXXX codes that survive normCode unchanged', () => {
    for (let i = 0; i < 2000; i++) {
      const c = generateCode()
      expect(isValidCode(c), c).toBe(true)
      expect(normCode(c)).toBe(c)
      expect(normCode(c.toLowerCase().replace('-', ''))).toBe(c)
    }
  })

  it('spreads symbols evenly (no modulo bias)', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 20000; i++) for (const ch of generateCode().replace('-', '')) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    const expected = (20000 * 8) / 31
    for (const ch of CODE_ALPHABET) expect(Math.abs((counts.get(ch) ?? 0) - expected) / expected).toBeLessThan(0.06)
  })

  it('never repeats a code, inside the batch or against existing ones', () => {
    const existing = new Set(generateCodes(5000, () => false))
    expect(existing.size).toBe(5000)
    const next = generateCodes(1000, (c) => existing.has(c))
    for (const c of next) expect(existing.has(c)).toBe(false)
    expect(new Set(next).size).toBe(1000)
  })

  it('retries when the random source repeats itself', () => {
    let calls = 0
    const stuck = (n: number) => new Uint8Array(n).fill(calls++ < 3 ? 0 : calls)
    const codes = generateCodes(2, () => false, stuck)
    expect(new Set(codes).size).toBe(2)
  })
})
