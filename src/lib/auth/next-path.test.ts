import { describe, expect, it } from 'vitest'
import { loginHref, safeNextPath } from '@/lib/auth/next-path'

describe('safeNextPath', () => {
  it('keeps paths of this site with their query and hash', () => {
    expect(safeNextPath('/showtimes/7')).toBe('/showtimes/7')
    expect(safeNextPath('/schedule?date=2026-09-28&movie=3#list')).toBe('/schedule?date=2026-09-28&movie=3#list')
    expect(safeNextPath('/')).toBe('/')
  })

  it.each([
    [null],
    [''],
    ['showtimes/7'],
    ['https://evil.example/'],
    ['//evil.example/'],
    ['/\\evil.example/'],
    ['/\t/evil.example/'],
    ['javascript:alert(1)'],
    ['/v1/auth/logout'],
    ['/v1'],
    ['/login?next=/account'],
    ['/register'],
  ])('rejects %j', (value) => {
    expect(safeNextPath(value)).toBeNull()
  })
})

describe('loginHref', () => {
  it('comes back to the page it was sent from', () => {
    expect(loginHref('/showtimes/7?x=1')).toBe('/login?next=%2Fshowtimes%2F7%3Fx%3D1')
  })

  it('leaves out a next that is home or unsafe', () => {
    expect(loginHref('/')).toBe('/login')
    expect(loginHref('//evil.example')).toBe('/login')
    expect(loginHref(null)).toBe('/login')
  })
})
