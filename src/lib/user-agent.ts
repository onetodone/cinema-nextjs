// A small labeler for the `User-Agent` strings the API records per session, for the account page's list of signed-in
// devices: "Firefox on Linux", "Safari on iPhone". It knows the common browsers and systems only — a readable hint for
// telling one's own devices apart, not device detection. (A parser library would be heavier, and the usual one,
// ua-parser-js v2, is AGPL.)

export type DeviceKind = 'desktop' | 'phone' | 'tablet' | 'unknown'

export interface DeviceInfo {
  /** "Chrome", "Firefox", …; for a client that is not a browser, its product name ("curl"); null when unknown. */
  browser: string | null
  /** "Windows", "macOS", "iPhone", "Android", …; null when unknown. */
  os: string | null
  kind: DeviceKind
}

// Order matters: browsers built on Chromium also carry "Chrome/" (and Safari's "Safari/"), so their own tokens are
// checked first.
const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|OPT|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bYaBrowser\//, 'Yandex Browser'],
  [/\bVivaldi\//, 'Vivaldi'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\bHeadlessChrome\//, 'Headless Chrome'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
]

const SYSTEMS: readonly [RegExp, string, DeviceKind][] = [
  [/\biPad\b/, 'iPad', 'tablet'],
  [/\biPhone\b|\biPod\b/, 'iPhone', 'phone'],
  [/\bAndroid\b.*\bMobile\b/, 'Android', 'phone'],
  [/\bAndroid\b/, 'Android', 'tablet'],
  [/\bWindows Phone\b/, 'Windows Phone', 'phone'],
  [/\bWindows\b/, 'Windows', 'desktop'],
  [/\bCrOS\b/, 'ChromeOS', 'desktop'],
  [/\bMacintosh\b|\bMac OS X\b/, 'macOS', 'desktop'],
  [/\bLinux\b|\bX11\b/, 'Linux', 'desktop'],
]

/** What a `User-Agent` string says about the browser and the device. */
export function describeUserAgent(userAgent: string): DeviceInfo {
  const ua = userAgent.trim()
  if (ua === '') return { browser: null, os: null, kind: 'unknown' }

  // Browsers all start with "Mozilla/5.0"; other clients name themselves first ("curl/8.5.0", "Go-http-client/1.1").
  if (!ua.startsWith('Mozilla/')) {
    const product = /^[^\s/;()]+/.exec(ua)?.[0] ?? null
    return { browser: product, os: null, kind: 'unknown' }
  }

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))
  return {
    browser,
    os: system?.[1] ?? null,
    kind: system?.[2] ?? (/\bMobi/.test(ua) ? 'phone' : 'unknown'),
  }
}

/** "Firefox on Linux", "Safari on iPhone", "Chrome", "A browser on Windows", "curl", or "Unknown device". */
export function deviceLabel({ browser, os }: DeviceInfo): string {
  if (browser && os) return `${browser} on ${os}`
  if (browser) return browser
  if (os) return `A browser on ${os}`
  return 'Unknown device'
}
