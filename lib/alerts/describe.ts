import { formatCurrency } from '@/lib/format'
import type { AlertConfig, AlertDirection, ConditionType } from '@/lib/alerts/types'

// The minimal shape needed to phrase an alert. Client-safe (only pulls
// formatCurrency), so the same wording drives the alert list row, the in-app
// notification, and the email.
export type DescribableAlert = {
  type?: ConditionType | null
  targetPrice?: number | null
  direction?: AlertDirection | null
  config?: AlertConfig | null
}

// A short noun label for the condition family — used in notification/email titles.
export function conditionLabel(a: DescribableAlert): string {
  switch (a.type ?? 'price') {
    case 'price':
      return 'Price alert'
    case 'pct_change':
      return 'Day move'
    case 'volume':
      return 'Volume spike'
    case 'week52':
      return '52-week breakout'
    case 'circuit':
      return 'Circuit'
    case 'sma_cross':
      return 'SMA cross'
    case 'ema_cross':
      return 'EMA cross'
    case 'rsi':
      return 'RSI'
    case 'macd_cross':
      return 'MACD cross'
    case 'rating_flip':
      return 'Rating flip'
    default:
      return 'Alert'
  }
}

// The standing condition as a phrase (no symbol), used in the alert list row and
// the notification/email body. e.g. "at or below ₹100", "RSI(14) ≤ 30 (oversold)".
export function describeCondition(a: DescribableAlert): string {
  const cfg = a.config ?? {}
  switch (a.type ?? 'price') {
    case 'price': {
      if (typeof a.targetPrice !== 'number') return 'price alert'
      return a.direction === 'above'
        ? `at or above ${formatCurrency(a.targetPrice)}`
        : `at or below ${formatCurrency(a.targetPrice)}`
    }
    case 'pct_change': {
      const t = cfg.thresholdPct ?? 0
      return a.direction === 'below'
        ? `day change ≤ −${t}%`
        : `day change ≥ +${t}%`
    }
    case 'volume': {
      const m = cfg.multiple ?? 2
      return `volume ≥ ${m}× 20-day average`
    }
    case 'week52':
      return cfg.edge === 'low'
        ? 'breaks below 52-week low'
        : 'breaks above 52-week high'
    case 'circuit':
      return cfg.band === 'upper'
        ? 'hits upper circuit'
        : cfg.band === 'lower'
          ? 'hits lower circuit'
          : 'hits a circuit limit'
    case 'sma_cross':
      return a.direction === 'above'
        ? `crosses above SMA(${cfg.period})`
        : `crosses below SMA(${cfg.period})`
    case 'ema_cross':
      return a.direction === 'above'
        ? `crosses above EMA(${cfg.period})`
        : `crosses below EMA(${cfg.period})`
    case 'rsi': {
      const period = cfg.period ?? 14
      if (cfg.rsiBand === 'oversold') {
        return `RSI(${period}) ≤ ${cfg.threshold ?? 30} (oversold)`
      }
      return `RSI(${period}) ≥ ${cfg.threshold ?? 70} (overbought)`
    }
    case 'macd_cross':
      return cfg.macdDirection === 'bearish'
        ? 'MACD crosses bearish'
        : 'MACD crosses bullish'
    case 'rating_flip': {
      const tf = cfg.timeframe ?? '1D'
      if (!cfg.to || cfg.to === 'any') return `${tf} rating flips`
      return `${tf} rating flips to ${cfg.to}`
    }
    default:
      return 'alert'
  }
}
