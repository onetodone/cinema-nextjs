type LogLevel = 'info' | 'warn' | 'error'

const SENSITIVE_KEY_PATTERN = /pass|secret|token|authorization|cookie|credential|otp/i
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){2,5}/g
const BEARER_PATTERN = /\bBearer\s+[\w.\-~+/]+=*/gi
const SECRET_PARAM_PATTERN =
  /\b((?:access_token|refresh_token|token|code|secret|session-token|csrf-token)=)[^&#;,\s"']+/gi

const REDACTED = '[redacted]'
const MAX_DEPTH = 6

function maskString(value: string): string {
  return value
    .replace(JWT_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, 'Bearer ' + REDACTED)
    .replace(SECRET_PARAM_PATTERN, `$1${REDACTED}`)
}

export function maskSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return maskString(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: maskString(value.message),
      stack: value.stack ? maskString(value.stack) : undefined,
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSecrets(item, depth + 1, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : maskSecrets(item, depth + 1, seen)
  }
  return out
}

const rawConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  const record = { ts: new Date().toISOString(), level, event, ...(maskSecrets(fields) as object) }
  const line = JSON.stringify(record)
  if (level === 'error') rawConsole.error(line)
  else if (level === 'warn') rawConsole.warn(line)
  else rawConsole.log(line)
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
}

let consoleMaskingInstalled = false

export function installConsoleMasking(): void {
  if (consoleMaskingInstalled) return
  consoleMaskingInstalled = true

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) =>
      original(...args.map((arg) => (arg instanceof Error ? arg : maskSecrets(arg))))
  }
}
