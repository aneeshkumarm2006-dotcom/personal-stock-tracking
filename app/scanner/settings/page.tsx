import { PageHeader } from '@/components/PageHeader'
import { SettingsForm } from '@/components/scanner/SettingsForm'
import { getSettings } from '@/lib/scanner/queries'
import type { ScannerSettings } from '@/lib/scanner/types'

export const dynamic = 'force-dynamic'

// Sensible defaults so the form is fully populated on a brand-new install
// (before the Python engine has ever seeded the singleton).
const DEFAULT_SETTINGS: ScannerSettings = {
  id: 'singleton',
  capital: 500000,
  riskPct: 1,
  riskPctOverrides: {},
  entryModel: 'open-with-rr-gap-check',
  gapHardCapPct: 5,
  minFillRR: 1.5,
  timeStopSessions: 10,
  tpMode: 'partial-trail',
  slippageBps: 5,
  costs: {
    brokeragePerOrder: 20,
    brokerageMaxPct: 0.03,
    sttPct: 0.1,
    exchangeTxnPct: 0.00297,
    sebiPct: 0.0001,
    stampDutyBuyPct: 0.015,
    gstPct: 18,
    dpChargeSell: 13.5,
  },
  strategies: {
    breakout: true,
    pullback: true,
    trend_st_adx: true,
    rs_momentum: true,
    rsi_mr: true,
  },
  watchlist: [],
  blacklist: [],
}

export default async function ScannerSettingsPage() {
  const settings = await getSettings()
  const initial = settings ?? DEFAULT_SETTINGS

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Scanner settings"
        description="Engine parameters for the forward test. Saved to the scanner singleton; changes take effect from the next scan run."
      />

      <div
        role="note"
        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600"
      >
        <span className="font-medium">Heads up — </span>
        Changing engine parameters mid-test taints the forward test. Changes apply
        from the next scan run, not retroactively.
      </div>

      <SettingsForm initial={initial} />
    </div>
  )
}
