import { describe, expect, it } from 'vitest'
import { describeUserAgent, deviceLabel } from '@/lib/user-agent'

const label = (userAgent: string) => deviceLabel(describeUserAgent(userAgent))

describe('describeUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox on Linux', 'desktop'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome on Windows',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge on Windows',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
      'Safari on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0',
      'Opera on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
      'phone',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
      'Chrome on iPhone',
      'phone',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
      'Firefox on iPad',
      'tablet',
    ],
    [
      'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
      'phone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 16; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Safari/537.36',
      'Samsung Internet on Android',
      'tablet',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome on ChromeOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36',
      'Headless Chrome on Linux',
      'desktop',
    ],
  ])('labels %s', (userAgent, expected, kind) => {
    expect(label(userAgent)).toBe(expected)
    expect(describeUserAgent(userAgent).kind).toBe(kind)
  })

  it('names clients that are not browsers by their product', () => {
    expect(describeUserAgent('curl/8.5.0')).toEqual({ browser: 'curl', os: null, kind: 'unknown' })
    expect(label('Go-http-client/1.1')).toBe('Go-http-client')
    expect(label('PostmanRuntime/7.43.0')).toBe('PostmanRuntime')
  })

  it('says what it can about unknown browsers, and admits an unknown device', () => {
    expect(label('Mozilla/5.0 (Windows NT 10.0; Win64; x64) SomeBrowser/1.0')).toBe('A browser on Windows')
    expect(label('Mozilla/5.0 (compatible; Konqueror/4.0) Chrome/1.0')).toBe('Chrome')
    expect(label('Mozilla/5.0')).toBe('Unknown device')
    expect(label('')).toBe('Unknown device')
    expect(label('   ')).toBe('Unknown device')
  })
})
