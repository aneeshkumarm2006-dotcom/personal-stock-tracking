// Client-safe mirror of the API shapes used across the research components.
// We deliberately do NOT import from '@/lib/angelone/fullQuote' here: that module
// pulls in the server-only smartapi-javascript SDK, which must never reach the
// client bundle. These types match the JSON the routes return.

export type DepthLevel = { price: number; quantity: number; orders: number }

export type Quote = {
  token: string
  symbol?: string
  exchange?: string
  ltp?: number
  open?: number
  high?: number
  low?: number
  close?: number // previous close
  netChange?: number
  pctChange?: number
  avgPrice?: number
  lastTradeQty?: number
  week52High?: number
  week52Low?: number
  upperCircuit?: number
  lowerCircuit?: number
  tradeVolume?: number
  totalBuyQty?: number
  totalSellQty?: number
  openInterest?: number
  depth?: { buy: DepthLevel[]; sell: DepthLevel[] }
  exchFeedTime?: string
  exchTradeTime?: string
  fetchedAt: string
}

export type CandleRow = {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type SelectedInstrument = {
  token: string
  symbol: string
  name: string
  exchange: 'NSE' | 'BSE'
}
