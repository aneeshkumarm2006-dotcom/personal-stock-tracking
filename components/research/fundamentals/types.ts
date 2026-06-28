// Client-safe shapes for the fundamentals layer (sourced from indianapi.in).
// Mirrors what /api/research/fundamentals returns. We deliberately keep these
// in a component-side module — the server transform in @/lib/indianapi imports
// these as *types only*, so nothing server-only ever reaches the client bundle.

// A single named figure. `value` is the parsed number (null when the provider
// sends a blank/non-numeric); `raw` preserves the original string for display
// fallbacks (e.g. dates or text-valued metrics).
export type Metric = { label: string; value: number | null; raw: string | null }

export type MetricGroup = { title: string; items: Metric[] }

// The curated headline ratios shown at the top of the fundamentals section.
export type SummaryRatios = {
  marketCap: number | null // ₹ Crore
  peTTM: number | null
  sectorPe: number | null
  pbv: number | null
  epsTTM: number | null
  bookValuePerShare: number | null
  dividendYield: number | null // %
  roeTTM: number | null // %
  debtToEquity: number | null
  beta: number | null
  netIncome: number | null // ₹ Crore
  faceValue: number | null
}

// One reporting period's statements. Figures are in ₹ Crore as reported.
export type FinancialPeriod = {
  fiscalYear: number | null
  endDate: string | null
  income: Metric[]
  balance: Metric[]
  cashflow: Metric[]
}

export type Financials = {
  annual: FinancialPeriod[]
  quarterly: FinancialPeriod[]
}

export type ShareholdingGroup = {
  name: string
  series: { date: string; percentage: number | null }[]
}

export type Peer = {
  name: string
  pe: number | null
  pb: number | null
  marketCap: number | null
  price: number | null
  percentChange: number | null
  roe: number | null
  netProfitMargin: number | null
  debtToEquity: number | null
  dividendYield: number | null
  rating: string | null
}

export type AnalystRecommendation = { name: string; count: number }

export type AnalystSummary = {
  recommendations: AnalystRecommendation[]
  averageRating: string | null
  meanValue: number | null
  totalAnalysts: number | null
  riskCategory: string | null
  riskStdDev: number | null
}

export type Officer = { name: string; title: string; since: string | null }

export type CorporateAction = {
  remarks: string
  date: string | null
  value: number | null
  subtype: string | null
}

export type CorporateActions = {
  dividends: CorporateAction[]
  bonuses: CorporateAction[]
  splits: CorporateAction[]
}

export type MovingAverage = { days: number; nse: number | null; bse: number | null }

export type NewsItem = {
  headline: string
  url: string
  date: string | null
  summary: string | null
}

// The full payload returned by /api/research/fundamentals.
export type Fundamentals = {
  source: 'indianapi.in'
  query: string // what we searched the provider with
  companyName: string
  industry: string | null
  description: string | null
  isin: string | null
  nseCode: string | null
  bseCode: string | null
  price: { nse: number | null; bse: number | null; percentChange: number | null }
  yearHigh: number | null
  yearLow: number | null
  summary: SummaryRatios
  ratioGroups: MetricGroup[]
  financials: Financials
  shareholding: ShareholdingGroup[]
  peers: Peer[]
  analyst: AnalystSummary
  officers: Officer[]
  corporateActions: CorporateActions
  movingAverages: MovingAverage[]
  news: NewsItem[]
  fetchedAt: string
}
