import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normCode, num, parseAgorot } from './input'

// نسخة النموذج نفسها، مقروءة من ملف المرجع. هيك الاختبار بيمسك أي اختلاف عن النموذج.
const html = readFileSync(resolve(__dirname, '../../../reference/Final-Prototype.dc.html'), 'utf8')
function protoMethod(name: string, next: string): (v: unknown) => unknown {
  const start = html.indexOf(`  ${name}(v) {`)
  const end = html.indexOf(`  ${next}(`, start)
  if (start < 0 || end < 0) throw new Error(`could not find ${name}() in the prototype`)
  const src = html.slice(start, end).trim()
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'))
  return new Function('v', body) as (v: unknown) => unknown
}
const protoNum = protoMethod('num', 'normCode') as (v: unknown) => number
const protoNormCode = protoMethod('normCode', 'daysText') as (v: unknown) => string

// مولّد ثابت البذرة عشان الفشل يتكرر.
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
}
function randomStrings(pool: string[], n: number, maxLen: number, seed: number): string[] {
  const r = rng(seed)
  return Array.from({ length: n }, () => Array.from({ length: Math.floor(r() * maxLen) }, () => pool[Math.floor(r() * pool.length)]).join(''))
}

describe('num()', () => {
  it.each([
    ['١٬٣٢٠', 1320], ['۱۲۳', 123], ['1,320', 1320], ['12.5', 12.5], ['12,5', 12.5], ['₪300', 300],
    ['12,50', 12.5], ['1,320,000', 1320000], [' 45 ', 45], ['٣٠٫٥', 30.5], ['0', 0]
  ])('accepts %s', (input, expected) => {
    expect(num(input)).toBe(expected)
  })

  it.each(['1e5', '0x10', '1.234', '12,345.678', '-5', '', 'abc', '1.2.3', null, undefined])('rejects %s', (input) => {
    expect(num(input)).toBeNaN()
  })

  it('matches the prototype on 20,000 random inputs', () => {
    const pool = ['0', '1', '2', '5', '9', '٠', '٣', '٩', '۱', '۷', '.', ',', '،', '٬', '٫', ' ', '₪', 'e', 'x', '-', '+']
    for (const s of randomStrings(pool, 20000, 9, 7)) expect(Object.is(num(s), protoNum(s)), JSON.stringify(s)).toBe(true)
  })
})

describe('parseAgorot()', () => {
  it.each([
    ['1,320', 132000], ['12.5', 1250], ['12,05', 1205], ['0.29', 29], ['٠٫٠١', 1], ['₪300', 30000], ['007', 700]
  ])('reads %s as %i agorot', (input, expected) => {
    expect(parseAgorot(input)).toBe(expected)
  })

  it('agrees with num() on every valid input, without float error', () => {
    const pool = ['0', '1', '2', '3', '7', '9', '.', ',', '٬', '٫', '٤']
    for (const s of randomStrings(pool, 20000, 8, 11)) {
      const n = num(s)
      if (Number.isNaN(n)) expect(parseAgorot(s)).toBeNaN()
      else expect(parseAgorot(s), JSON.stringify(s)).toBe(Math.round(n * 100))
    }
  })

  it('rejects amounts beyond the safe range', () => {
    expect(parseAgorot('99999999999999')).toBeNaN()
    expect(Number.isSafeInteger(parseAgorot('9999999999999.99'))).toBe(true)
  })
})

describe('normCode()', () => {
  it.each([
    ['7k4f92qm', '7K4F-92QM'], ['7K4F-92QM', '7K4F-92QM'], [' 7k4f 92qm ', '7K4F-92QM'],
    // لوحة مفاتيح عربية: ؤ=C ث=E لا=B ق=R م=L
    ['ؤث٣لا92قم', 'CE3B-92RL'], ['٧ن٤ف-٩٢ضم', '7K4T-92QL'], ['abc', 'ABC'], ['', '']
  ])('normalises %s to %s', (input, expected) => {
    expect(normCode(input)).toBe(expected)
  })

  it('matches the prototype on 20,000 random inputs', () => {
    const pool = [...'AB7k4fqm-29 ', ...'ضصثقفغعهخحشسيبلاتنمئءؤرىة', 'لا', '٣', '٩', 'ـ', 'é']
    for (const s of randomStrings(pool, 20000, 11, 23)) expect(normCode(s), JSON.stringify(s)).toBe(protoNormCode(s))
  })
})
