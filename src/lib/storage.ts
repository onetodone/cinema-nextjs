// Per-tab storage (sessionStorage) for small JSON values that must survive a reload or a trip through sign-in, such
// as a seat selection or a payment attempt. Storage can be missing or refuse writes (private modes, full quotas,
// server rendering): then values live in this module until the page unloads, which keeps the flows working.

const memory = new Map<string, string>()

function sessionStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readSessionValue(key: string): unknown {
  let raw: string | null | undefined
  try {
    raw = sessionStore()?.getItem(key)
  } catch {
    raw = undefined
  }
  raw ??= memory.get(key) ?? null
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeSessionValue(key: string, value: unknown): void {
  const raw = JSON.stringify(value)
  try {
    const store = sessionStore()
    if (store) {
      store.setItem(key, raw)
      memory.delete(key)
      return
    }
  } catch {
    // Fall back to memory below.
  }
  memory.set(key, raw)
}

export function removeSessionValue(key: string): void {
  memory.delete(key)
  try {
    sessionStore()?.removeItem(key)
  } catch {
    // Nothing stored there.
  }
}
