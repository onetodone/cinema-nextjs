// Prices arrive as integer minor units ("cents") plus an ISO 4217 code. Totals always come from the API or from
// integer sums; the division below happens only for display.

const LOCALE = 'en-US'

const formatters = new Map<string, Intl.NumberFormat | null>()

function formatterFor(currency: string): Intl.NumberFormat | null {
  let formatter = formatters.get(currency)
  if (formatter === undefined) {
    try {
      formatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency })
    } catch {
      // An unknown currency code: fall back to plain numbers rather than failing the page.
      formatter = null
    }
    formatters.set(currency, formatter)
  }
  return formatter
}

/** "$13.00" for (1300, "USD"); respects currencies with other numbers of minor digits (JPY has none). */
export function formatMoney(cents: number, currency: string): string {
  const formatter = formatterFor(currency)
  if (!formatter) return `${(cents / 100).toFixed(2)} ${currency}`
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(cents / 10 ** digits)
}
