// Formatting helpers specific to the fundamentals layer. Values arrive already
// parsed to numbers (or null) from the API route.

const decimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const decimal0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

// A plain number with Indian digit grouping; em dash for missing values.
export function fmtNum(value: number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return (dp === 0 ? decimal0 : decimal).format(value)
}

// A ratio/multiple like a P/E or D/E — one decimal, no currency.
export function fmtRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return decimal.format(value)
}

// A percentage where the value is already expressed in percent units (e.g. 9.25
// means 9.25%). No leading sign by default.
export function fmtPct(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${decimal.format(value)}%`
}

// A ₹ figure already denominated in crore. Switches to "Lakh Cr" for the very
// large market caps so the headline stays readable.
export function fmtCrore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 100_000) {
    return `₹${decimal.format(value / 100_000)} Lakh Cr`
  }
  return `₹${decimal0.format(value)} Cr`
}

// A plain ₹ price (two decimals).
export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `₹${decimal.format(value)}`
}

const monthYear = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  year: '2-digit',
})
const fullDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

// "Jun '25" — compact column header for quarterly/period tables.
export function fmtMonthYear(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return monthYear.format(d).replace(/ /, " '")
}

// "05 Jun 2026" — for corporate-action and news dates.
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return fullDate.format(d)
}
