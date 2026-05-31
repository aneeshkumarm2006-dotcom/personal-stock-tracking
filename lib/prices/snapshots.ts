import type { PriceSnapshotData } from '@/lib/angelone/quotes'
import { PriceSnapshot } from '@/lib/db/models/PriceSnapshot'

function toSnapshotData(s: {
  token?: string | null
  symbol?: string | null
  exchange?: string | null
  ltp?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  netChange?: number | null
  pctChange?: number | null
  fetchedAt?: Date | null
}): PriceSnapshotData | null {
  if (!s.token) return null
  return {
    token: s.token,
    symbol: s.symbol ?? undefined,
    exchange: s.exchange ?? undefined,
    ltp: s.ltp ?? undefined,
    open: s.open ?? undefined,
    high: s.high ?? undefined,
    low: s.low ?? undefined,
    close: s.close ?? undefined,
    netChange: s.netChange ?? undefined,
    pctChange: s.pctChange ?? undefined,
    fetchedAt: s.fetchedAt ?? new Date(0),
  }
}

export async function loadSnapshotsForTokens(
  tokens: string[],
): Promise<PriceSnapshotData[]> {
  if (tokens.length === 0) return []
  const docs = await PriceSnapshot.find({ token: { $in: tokens } }).lean()
  const result: PriceSnapshotData[] = []
  for (const d of docs) {
    const snap = toSnapshotData(d)
    if (snap) result.push(snap)
  }
  return result
}
