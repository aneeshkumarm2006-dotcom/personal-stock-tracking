// Server-only: fetches a company's fundamentals from indianapi.in's /stock
// endpoint and reshapes the ~350KB raw payload into the compact, typed
// Fundamentals object the Research page consumes. Keeping the transform here
// means the giant raw object never crosses the network to the browser.

import { indianApiGet, IndianApiError } from './client'
import type {
  CorporateAction,
  FinancialPeriod,
  Fundamentals,
  Metric,
  MetricGroup,
  Officer,
  Peer,
  ShareholdingGroup,
} from '@/components/research/fundamentals/types'

// Thrown when the provider has no data for any of the names we tried.
export class FundamentalsNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FundamentalsNotFoundError'
  }
}

// ---- raw shapes (only the parts we read) -----------------------------------

type RawMetric = { displayName?: string; key?: string; value?: string | number | null }

type RawFinancial = {
  Type?: string
  FiscalYear?: number | string
  EndDate?: string
  stockFinancialMap?: { INC?: RawMetric[]; BAL?: RawMetric[]; CAS?: RawMetric[] }
}

type RawPeer = Record<string, unknown> & { companyName?: string }

type RawStock = {
  error?: string
  companyName?: string
  industry?: string
  percentChange?: string | number
  yearHigh?: string | number
  yearLow?: string | number
  currentPrice?: { NSE?: string | number; BSE?: string | number }
  companyProfile?: {
    companyDescription?: string
    isInId?: string
    exchangeCodeNse?: string
    exchangeCodeBse?: string
    peerCompanyList?: RawPeer[]
    officers?: { officer?: RawOfficer[] }
  }
  keyMetrics?: Record<string, RawMetric[]>
  stockDetailsReusableData?: Record<string, unknown>
  stockTechnicalData?: Array<{ days?: number; nsePrice?: string | number; bsePrice?: string | number }>
  financials?: RawFinancial[]
  shareholding?: Array<{
    categoryName?: string
    displayName?: string
    categories?: Array<{ holdingDate?: string; percentage?: string | number }>
  }>
  recosBar?: { noOfRecommendations?: number; meanValue?: number }
  analystView?: Array<{ ratingName?: string; numberOfAnalystsLatest?: string | number; colorCode?: string }>
  riskMeter?: { categoryName?: string; stdDev?: number }
  stockCorporateActionData?: {
    dividend?: RawCorpAction[]
    bonus?: RawCorpAction[]
    splits?: RawCorpAction[]
  }
  recentNews?: Array<{ headline?: string; url?: string; date?: string; summary?: string }>
}

type RawOfficer = {
  firstName?: string
  mI?: string
  lastName?: string
  since?: string
  title?: { Value?: string } | string
}

type RawCorpAction = {
  remarks?: string
  recordDate?: string
  value?: string | number
  percentage?: string | number
  interimOrFinal?: string
}

// ---- helpers ---------------------------------------------------------------

// Parse a provider value into a number. Handles strings with commas/percent
// signs and treats blanks/non-numerics as null.
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const cleaned = v.replace(/[,%\s]/g, '')
  if (cleaned === '' || cleaned.toLowerCase() === 'null') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'number') return String(v)
  return null
}

// The provider stamps news as "MM/DD/YYYY HH:mm:ss"; corporate actions use ISO
// dates. Normalise both to ISO so the client can format them uniformly.
function toIso(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/.exec(s)
  if (us) {
    const mm = us[1]
    const dd = us[2]
    const yyyy = us[3]
    if (mm && dd && yyyy) {
      const d = new Date(
        Date.UTC(+yyyy, +mm - 1, +dd, +(us[4] ?? '0'), +(us[5] ?? '0'), +(us[6] ?? '0')),
      )
      return Number.isNaN(d.getTime()) ? s : d.toISOString()
    }
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toISOString()
}

function mapMetrics(items: RawMetric[] | undefined): Metric[] {
  if (!Array.isArray(items)) return []
  const out: Metric[] = []
  for (const it of items) {
    const label = str(it.displayName)
    if (!label) continue
    const raw = it.value === null || it.value === undefined ? null : String(it.value)
    const value = toNum(it.value)
    // Drop blanks and boolean flags (e.g. isForCasted) — keep numeric figures.
    if (value === null && (raw === null || raw === '' || raw === 'true' || raw === 'false')) {
      continue
    }
    out.push({ label, value, raw })
  }
  return out
}

// Friendly titles + display order for the keyMetrics buckets. incomeStatement is
// intentionally skipped: it duplicates the Financials table and its absolute
// figures use a different unit scale than the statements.
const RATIO_GROUPS: Array<{ key: string; title: string }> = [
  { key: 'valuation', title: 'Valuation' },
  { key: 'margins', title: 'Margins' },
  { key: 'mgmtEffectiveness', title: 'Returns & efficiency' },
  { key: 'financialstrength', title: 'Financial strength' },
  { key: 'growth', title: 'Growth' },
  { key: 'persharedata', title: 'Per-share data' },
  { key: 'priceandVolume', title: 'Price & volume' },
]

function buildRatioGroups(keyMetrics: Record<string, RawMetric[]> | undefined): MetricGroup[] {
  if (!keyMetrics) return []
  const groups: MetricGroup[] = []
  for (const { key, title } of RATIO_GROUPS) {
    const items = mapMetrics(keyMetrics[key])
    if (items.length > 0) groups.push({ title, items })
  }
  return groups
}

// Flatten every keyMetrics figure into a normalised-key → number lookup so the
// headline summary can pull specific ratios regardless of the provider's
// inconsistent key punctuation/casing.
function buildMetricIndex(keyMetrics: Record<string, RawMetric[]> | undefined): Map<string, number | null> {
  const index = new Map<string, number | null>()
  if (!keyMetrics) return index
  for (const arr of Object.values(keyMetrics)) {
    if (!Array.isArray(arr)) continue
    for (const it of arr) {
      const k = str(it.key)
      if (!k) continue
      const norm = k.replace(/[)\s]/g, '').toLowerCase()
      if (!index.has(norm)) index.set(norm, toNum(it.value))
    }
  }
  return index
}

function mapFinancial(f: RawFinancial): FinancialPeriod {
  return {
    fiscalYear: toNum(f.FiscalYear),
    endDate: str(f.EndDate),
    income: mapMetrics(f.stockFinancialMap?.INC),
    balance: mapMetrics(f.stockFinancialMap?.BAL),
    cashflow: mapMetrics(f.stockFinancialMap?.CAS),
  }
}

function mapPeers(list: RawPeer[] | undefined): Peer[] {
  if (!Array.isArray(list)) return []
  return list.map((p) => ({
    name: str(p.companyName) ?? '—',
    pe: toNum(p.priceToEarningsValueRatio),
    pb: toNum(p.priceToBookValueRatio),
    marketCap: toNum(p.marketCap),
    price: toNum(p.price),
    percentChange: toNum(p.percentChange),
    roe: toNum(p.returnOnAverageEquityTrailing12Month),
    netProfitMargin: toNum(p.netProfitMarginPercentTrailing12Month),
    debtToEquity: toNum(p.ltDebtPerEquityMostRecentFiscalYear),
    dividendYield: toNum(p.dividendYieldIndicatedAnnualDividend),
    rating: str(p.overallRating),
  }))
}

function mapOfficers(list: RawOfficer[] | undefined): Officer[] {
  if (!Array.isArray(list)) return []
  return list
    .map((o) => {
      const name = [o.firstName, o.mI, o.lastName]
        .map((x) => str(x))
        .filter(Boolean)
        .join(' ')
      const title =
        typeof o.title === 'string' ? o.title : str(o.title?.Value) ?? ''
      return { name, title, since: str(o.since) }
    })
    .filter((o) => o.name)
}

function mapCorpActions(list: RawCorpAction[] | undefined): CorporateAction[] {
  if (!Array.isArray(list)) return []
  return list.map((a) => ({
    remarks: str(a.remarks) ?? '—',
    date: str(a.recordDate),
    value: toNum(a.value),
    subtype: str(a.interimOrFinal),
  }))
}

// ---- transform -------------------------------------------------------------

function transform(raw: RawStock, query: string): Fundamentals {
  const reusable = raw.stockDetailsReusableData ?? {}
  const idx = buildMetricIndex(raw.keyMetrics)

  const financials = Array.isArray(raw.financials) ? raw.financials : []
  const annual = financials
    .filter((f) => f.Type === 'Annual')
    .sort((a, b) => (toNum(b.FiscalYear) ?? 0) - (toNum(a.FiscalYear) ?? 0))
    .slice(0, 7)
    .map(mapFinancial)
  const quarterly = financials
    .filter((f) => f.Type === 'Interim')
    .sort((a, b) => (str(b.EndDate) ?? '').localeCompare(str(a.EndDate) ?? ''))
    .slice(0, 9)
    .map(mapFinancial)

  const shareholding: ShareholdingGroup[] = (raw.shareholding ?? []).map((g) => ({
    name: str(g.displayName) ?? str(g.categoryName) ?? '—',
    series: (g.categories ?? []).map((c) => ({
      date: str(c.holdingDate) ?? '',
      percentage: toNum(c.percentage),
    })),
  }))

  const recommendations = (raw.analystView ?? [])
    .filter((r) => str(r.ratingName) && str(r.ratingName) !== 'Total')
    .map((r) => ({
      name: str(r.ratingName) ?? '',
      count: Math.round(toNum(r.numberOfAnalystsLatest) ?? 0),
    }))

  const movingAverages = (raw.stockTechnicalData ?? [])
    .map((t) => ({
      days: toNum(t.days) ?? 0,
      nse: toNum(t.nsePrice),
      bse: toNum(t.bsePrice),
    }))
    .filter((t) => t.days > 0)

  const news = (raw.recentNews ?? [])
    .map((n) => {
      const url = str(n.url) ?? ''
      return {
        headline: str(n.headline) ?? '',
        url: url.startsWith('/') ? `https://www.livemint.com${url}` : url,
        date: toIso(n.date),
        summary: str(n.summary),
      }
    })
    .filter((n) => n.headline)

  return {
    source: 'indianapi.in',
    query,
    companyName: str(raw.companyName) ?? query,
    industry: str(raw.industry),
    description: str(raw.companyProfile?.companyDescription),
    isin: str(raw.companyProfile?.isInId),
    nseCode: str(raw.companyProfile?.exchangeCodeNse),
    bseCode: str(raw.companyProfile?.exchangeCodeBse),
    price: {
      nse: toNum(raw.currentPrice?.NSE),
      bse: toNum(raw.currentPrice?.BSE),
      percentChange: toNum(raw.percentChange),
    },
    yearHigh: toNum(raw.yearHigh),
    yearLow: toNum(raw.yearLow),
    summary: {
      marketCap: toNum(reusable.marketCap),
      peTTM: toNum(reusable.pPerEBasicExcludingExtraordinaryItemsTTM),
      sectorPe: toNum(reusable.sectorPriceToEarningsValueRatio),
      pbv: idx.get('pricetobookmostrecentquarter') ?? null,
      epsTTM: idx.get('epsincludingextraordinaryitemstrailing12month') ?? null,
      bookValuePerShare: idx.get('bookvaluepersharemostrecentquarter') ?? null,
      dividendYield: toNum(reusable.currentDividendYieldCommonStockPrimaryIssueLTM),
      roeTTM: idx.get('returnonaverageequitytrailing12month') ?? null,
      debtToEquity: toNum(reusable.totalDebtPerTotalEquityMostRecentQuarter),
      beta: idx.get('beta') ?? null,
      netIncome: toNum(reusable.NetIncome),
      faceValue: null,
    },
    ratioGroups: buildRatioGroups(raw.keyMetrics),
    financials: { annual, quarterly },
    shareholding,
    peers: mapPeers(raw.companyProfile?.peerCompanyList),
    analyst: {
      recommendations,
      averageRating: str(reusable.averageRating),
      meanValue: toNum(raw.recosBar?.meanValue),
      totalAnalysts: toNum(raw.recosBar?.noOfRecommendations),
      riskCategory: str(raw.riskMeter?.categoryName),
      riskStdDev: toNum(raw.riskMeter?.stdDev),
    },
    officers: mapOfficers(raw.companyProfile?.officers?.officer),
    corporateActions: {
      dividends: mapCorpActions(raw.stockCorporateActionData?.dividend),
      bonuses: mapCorpActions(raw.stockCorporateActionData?.bonus),
      splits: mapCorpActions(raw.stockCorporateActionData?.splits),
    },
    movingAverages,
    news,
    fetchedAt: new Date().toISOString(),
  }
}

// ---- name resolution + cache ----------------------------------------------

// Angel One equity symbols are "<NSE symbol>-<series>" (RELIANCE-EQ,
// BAJAJ-AUTO-EQ, M&M-EQ). Strip only the trailing series segment so multi-part
// symbols keep their real root.
const SERIES_SUFFIX = /-(EQ|BE|BZ|BL|IL|IQ|SM|ST|GB|GS|MF|AF|RR|RT|N[0-9])$/i

function stripSeries(symbol: string): string {
  return symbol.replace(SERIES_SUFFIX, '')
}

// The provider keys data by ticker/short name, not by Angel One's "RELIANCE-EQ"
// symbol or the full legal name. Try the NSE root first, then the raw symbol,
// then progressively looser name-based fallbacks.
function candidateNames(input: { symbol?: string; name?: string }): string[] {
  const out: string[] = []
  const push = (s: string | undefined) => {
    const v = s?.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  const sym = input.symbol?.trim()
  if (sym) {
    const root = stripSeries(sym) // RELIANCE-EQ -> RELIANCE, BAJAJ-AUTO-EQ -> BAJAJ-AUTO
    push(root)
    // The provider's search mishandles hyphens (e.g. "BAJAJ-AUTO" wrongly maps
    // to Bajaj Finance) but matches the spaced form correctly. Offer both.
    if (root.includes('-')) {
      push(root.replace(/-/g, ' ')) // BAJAJ-AUTO -> "BAJAJ AUTO"
      push(root.replace(/-/g, '')) // BAJAJ-AUTO -> "BAJAJAUTO"
    }
    push(sym)
  }
  push(input.name)
  if (input.name) push(input.name.split(' ')[0]) // first word as a last resort
  return out
}

const NAME_STOPWORDS = new Set([
  'ltd', 'limited', 'the', 'and', 'co', 'company', 'corp', 'corporation',
  'inc', 'plc', 'india', 'indian',
])

// Significant lowercase tokens of a company name (drops boilerplate + short words).
function nameTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t)),
  )
}

// Every significant token of the trusted instrument name must appear in the
// provider's company name. Strong enough to tell "Bajaj Auto" from "Bajaj
// Finance" while tolerating an " Ltd" suffix.
function strongNameMatch(resolved: string, trusted: string): boolean {
  const a = nameTokens(trusted)
  const b = nameTokens(resolved)
  if (a.size === 0 || b.size === 0) return false
  for (const t of a) if (!b.has(t)) return false
  return true
}

// The provider's /stock search is fuzzy: a bogus or thinly-covered symbol can
// resolve to an unrelated company (a random ETF, or "BAJAJ-AUTO" → Bajaj
// Finance). Guard against showing the wrong company's numbers.
//
// The NSE code is the authoritative signal — it mirrors the Angel One symbol
// root (RELIANCE, BAJAJ-AUTO). The BSE code is a numeric scrip id, so it only
// matches a numeric root. Rules:
//   - NSE (or numeric BSE) code equals the root        -> accept
//   - NSE code present but different                    -> reject (wrong company)
//   - NSE code absent (provider didn't populate it)     -> accept only on a
//     strong match to the trusted instrument name
// We'd rather show "no fundamentals" than a confidently wrong result.
function isAcceptableMatch(
  raw: RawStock,
  symbolRoot: string | null,
  trustedName: string | null,
): boolean {
  const nse = str(raw.companyProfile?.exchangeCodeNse)?.toUpperCase() ?? ''
  const bse = str(raw.companyProfile?.exchangeCodeBse)?.toUpperCase() ?? ''
  const company = str(raw.companyName) ?? ''

  if (symbolRoot) {
    const r = symbolRoot.toUpperCase()
    if (nse === r || bse === r) return true
    if (nse) return false // NSE code present and different → wrong company
    // NSE code absent → can't use codes (BSE is numeric); verify by name.
    return trustedName ? strongNameMatch(company, trustedName) : false
  }
  // Name-only path: trust a strong name match, otherwise take what we got.
  return trustedName ? strongNameMatch(company, trustedName) : true
}

type CacheEntry = { data: Fundamentals; expires: number }
const CACHE = new Map<string, CacheEntry>()
const TTL_MS = 12 * 60 * 60 * 1000 // fundamentals change slowly; spare the quota

function isMiss(raw: RawStock | null | undefined): boolean {
  return !raw || typeof raw.error === 'string' || !str(raw.companyName)
}

// Resolve and return a company's fundamentals. Throws FundamentalsNotFoundError
// when no candidate matches; propagates IndianApiAuthError/RateLimitError.
export async function getFundamentals(input: {
  symbol?: string
  name?: string
}): Promise<Fundamentals> {
  const candidates = candidateNames(input)
  const [primary] = candidates
  if (!primary) {
    throw new IndianApiError('A symbol or name is required', 400)
  }

  // Validate fuzzy matches against the symbol root when we have one.
  const symbolRoot = input.symbol?.trim() ? stripSeries(input.symbol.trim()) : null
  const trustedName = input.name?.trim() || null

  const cacheKey = (symbolRoot ?? primary).toLowerCase()
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.data

  let lastRaw: RawStock | null = null
  for (const candidate of candidates) {
    const raw = await indianApiGet<RawStock>('/stock', { name: candidate })
    lastRaw = raw
    if (isMiss(raw)) continue
    // Reject a fuzzy mismatch and keep trying looser candidates.
    if (!isAcceptableMatch(raw, symbolRoot, trustedName)) continue
    const data = transform(raw, candidate)
    CACHE.set(cacheKey, { data, expires: Date.now() + TTL_MS })
    return data
  }

  throw new FundamentalsNotFoundError(
    lastRaw?.error
      ? `indianapi.in: ${lastRaw.error}`
      : `No fundamentals found for ${candidates.join(' / ')}`,
  )
}
