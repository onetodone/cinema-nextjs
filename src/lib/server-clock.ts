// The hold countdown runs to a deadline set by the server's clock, which the viewer's clock may not match (a device
// clock minutes off is common). The skew is measured from the `Date` header of the API's answers: second resolution,
// which is plenty for a countdown in whole seconds.

let skewMs = 0

/** Notes the server's time from an answer's `Date` header (the header is cut to whole seconds; +500 ms centres it). */
export function recordServerTime(response: Response): void {
  const header = response.headers.get('Date')
  const serverTime = header ? Date.parse(header) : Number.NaN
  if (!Number.isNaN(serverTime)) skewMs = serverTime + 500 - Date.now()
}

/** The server's clock minus this device's clock, in milliseconds (0 until an answer has told). */
export function serverSkewMs(): number {
  return skewMs
}

/** For tests. */
export function resetServerClock(): void {
  skewMs = 0
}
