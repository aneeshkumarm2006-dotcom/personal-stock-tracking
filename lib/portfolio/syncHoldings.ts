import { connectDB } from '@/lib/db/connect'
import { CashAccount } from '@/lib/db/models/CashAccount'
import { Transaction } from '@/lib/db/models/Transaction'
import {
  fetchAngelFunds,
  fetchAngelHoldings,
  fetchAngelTradeBook,
  type AngelTrade,
} from '@/lib/angelone/portfolio'
import { computeNetInvested, type CashFlowTx } from '@/lib/portfolio/cash'
import { computeHoldings, type TransactionForHoldings } from '@/lib/portfolio/holdings'
import {
  reconcileHoldings,
  type AppHoldingQty,
  type ReconcileLine,
} from '@/lib/portfolio/reconcile'

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export type SyncOptions = {
  // When true, compute the plan but write nothing. Lets the UI show a preview
  // ("you sold 50 of ITC at ₹X") before the user commits.
  dryRun?: boolean
  // Re-anchor the cash account so availableCash matches Angel One's real
  // available balance. Defaults to true; skipped automatically if the RMS funds
  // call fails. This is what keeps cash from drifting as buys/sells, deposits,
  // dividends and charges accumulate on the Angel side.
  anchorCash?: boolean
}

export type SyncResult = {
  dryRun: boolean
  // Per-instrument diff between Angel One and the ledger (including no-ops).
  lines: ReconcileLine[]
  // Number of corrective transactions generated.
  applied: number
  // Deltas that could not be priced and were skipped.
  skipped: ReconcileLine[]
  cash: {
    anchored: boolean
    angelAvailableCash: number | null
    fundsAdded: number | null
    availableCash: number | null
    reason?: string
  }
}

// Reconcile the ledger against Angel One and (unless dryRun) persist the
// resulting transactions, then re-anchor cash to Angel's real balance.
export async function runHoldingsSync(options: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = options.dryRun ?? false
  const anchorCash = options.anchorCash ?? true

  await connectDB()

  // 1. What the ledger currently believes is held.
  const ledger = (await Transaction.find({})
    .sort({ date: 1 })
    .lean()) as unknown as TransactionForHoldings[]
  const appHoldings: AppHoldingQty[] = computeHoldings(ledger)
    .filter((h) => h.netQty > 0)
    .map((h) => ({
      instrumentToken: h.instrumentToken,
      instrumentSymbol: h.instrumentSymbol,
      netQty: h.netQty,
    }))

  // 2. Angel One live state. Holdings are required; trade book and funds are
  //    best-effort (an outage there degrades pricing/cash-anchoring but must not
  //    abort the holdings reconciliation).
  const angelHoldings = await fetchAngelHoldings()

  let trades: AngelTrade[] = []
  try {
    trades = await fetchAngelTradeBook()
  } catch {
    trades = []
  }

  // 3. Reconcile.
  const syncDate = new Date()
  const { transactions, lines } = reconcileHoldings(appHoldings, angelHoldings, trades, {
    syncDate,
  })
  const skipped = lines.filter((l) => l.skipped)

  // 4. Funds (best-effort) for cash anchoring.
  let angelAvailableCash: number | null = null
  if (anchorCash) {
    try {
      const funds = await fetchAngelFunds()
      angelAvailableCash = funds?.availableCash ?? null
    } catch {
      angelAvailableCash = null
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      lines,
      applied: 0,
      skipped,
      cash: {
        anchored: false,
        angelAvailableCash,
        fundsAdded: null,
        availableCash: null,
        reason: 'dry run',
      },
    }
  }

  // 5. Persist corrective transactions.
  if (transactions.length > 0) {
    await Transaction.insertMany(transactions)
  }

  // 6. Re-anchor cash. With the ledger now matching Angel's positions, set
  //    fundsAdded = netInvested + angelAvailableCash so that
  //    availableCash (= fundsAdded - netInvested) exactly equals Angel's
  //    available balance. This absorbs deposits, withdrawals, dividends and
  //    charges without needing a separate ledger for them.
  let anchored = false
  let fundsAdded: number | null = null
  let availableCash: number | null = null
  let reason: string | undefined

  if (!anchorCash) {
    reason = 'cash anchoring disabled'
  } else if (angelAvailableCash === null) {
    reason = 'Angel funds unavailable; cash left unchanged'
  } else {
    const allTx = (await Transaction.find(
      {},
      { type: 1, quantity: 1, price: 1, charges: 1 },
    ).lean()) as unknown as CashFlowTx[]
    const netInvested = computeNetInvested(allTx)
    fundsAdded = round2(netInvested + angelAvailableCash)
    availableCash = round2(fundsAdded - netInvested)
    await CashAccount.findOneAndUpdate(
      { key: 'default' },
      { $set: { fundsAdded } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    anchored = true
  }

  return {
    dryRun: false,
    lines,
    applied: transactions.length,
    skipped,
    cash: { anchored, angelAvailableCash, fundsAdded, availableCash, reason },
  }
}
