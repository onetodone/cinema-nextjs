import { describe, expect, it } from 'vitest'
import { formatMoney } from '@/lib/money'

describe('formatMoney', () => {
  it('formats integer cents in the given currency', () => {
    expect(formatMoney(1300, 'USD')).toBe('$13.00')
    expect(formatMoney(1650, 'USD')).toBe('$16.50')
    expect(formatMoney(0, 'USD')).toBe('$0.00')
    expect(formatMoney(123456, 'EUR')).toBe('€1,234.56')
  })

  it('respects currencies without minor units', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500')
  })

  it('falls back to a plain amount for an unknown currency code', () => {
    expect(formatMoney(1300, 'NOT-A-CODE')).toBe('13.00 NOT-A-CODE')
  })
})
