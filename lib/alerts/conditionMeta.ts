import type { AlertConfig, AlertDirection, AlertStatus, ConditionType } from '@/lib/alerts/types'

// The JSON body the alert create/replace endpoints accept. Mirrors the Zod
// discriminated union at the API edge.
export type AlertRequestBody = {
  type: ConditionType
  targetPrice?: number
  direction?: AlertDirection
  config?: AlertConfig
  note?: string
  status?: AlertStatus
}

// The Advanced conditions offered in the picker, in menu order, with a one-line
// hint. `price` is the Normal tab and is intentionally not listed here.
export const ADVANCED_TYPES: {
  type: ConditionType
  label: string
  hint: string
}[] = [
  {
    type: 'pct_change',
    label: 'Day % change',
    hint: "Fires on the day's move past a ± threshold.",
  },
  {
    type: 'volume',
    label: 'Volume spike',
    hint: "Today's volume vs the 20-day average.",
  },
  {
    type: 'week52',
    label: '52-week breakout',
    hint: 'Price breaks the 52-week high or low.',
  },
  {
    type: 'circuit',
    label: 'Circuit hit',
    hint: 'Price reaches the upper / lower circuit.',
  },
  {
    type: 'sma_cross',
    label: 'Price vs SMA',
    hint: 'Price crosses an N-period simple moving average.',
  },
  {
    type: 'ema_cross',
    label: 'Price vs EMA',
    hint: 'Price crosses an N-period exponential moving average.',
  },
  {
    type: 'rsi',
    label: 'RSI',
    hint: 'RSI(14) reaches overbought / oversold.',
  },
  {
    type: 'macd_cross',
    label: 'MACD cross',
    hint: 'MACD line crosses its signal line.',
  },
  {
    type: 'rating_flip',
    label: 'Technical rating flip',
    hint: 'The TradingView-style rating changes bucket.',
  },
]
