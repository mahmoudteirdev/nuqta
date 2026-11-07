import { describe, expect, it } from 'vitest'
import { formatBalance, formatMoney, formatSigned, multiply, shekels } from './money'

describe('money', () => {
  it('formats with the symbol first, Latin digits and thousands separators', () => {
    expect(formatMoney(shekels(1320))).toBe('₪1,320')
    expect(formatMoney(1250)).toBe('₪12.50')
    expect(formatMoney(5)).toBe('₪0.05')
    expect(formatMoney(0)).toBe('₪0')
    expect(formatMoney(shekels(1_234_567))).toBe('₪1,234,567')
  })

  it('shows a negative balance as «له», never a minus sign', () => {
    expect(formatBalance(shekels(-300))).toBe('له ₪300')
    expect(formatBalance(shekels(300))).toBe('₪300')
    expect(formatSigned(shekels(-300))).toBe('-₪300')
  })

  it('refuses floats and overflow', () => {
    expect(() => shekels(1.5)).toThrow()
    expect(() => multiply(Number.MAX_SAFE_INTEGER, 2)).toThrow()
  })
})
