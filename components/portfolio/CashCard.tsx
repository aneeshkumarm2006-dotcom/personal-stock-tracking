import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CashSummary } from '@/lib/portfolio/cash'

import { ManageCashDialog } from './ManageCashDialog'

export type CashCardProps = {
  cash: CashSummary
}

export function CashCard({ cash }: CashCardProps) {
  return (
    <div className="bg-card ring-foreground/10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl px-4 py-3.5 ring-1">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-muted-foreground text-xs">Available cash</p>
          <p
            className={cn(
              'text-lg leading-tight font-semibold tracking-tight tabular-nums',
              cash.availableCash < 0 && 'text-loss',
            )}
          >
            {formatCurrency(cash.availableCash)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Funds added</p>
          <p className="text-sm leading-tight font-medium tabular-nums">
            {formatCurrency(cash.fundsAdded)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Invested</p>
          <p className="text-sm leading-tight font-medium tabular-nums">
            {formatCurrency(cash.netInvested)}
          </p>
        </div>
      </div>

      <ManageCashDialog fundsAdded={cash.fundsAdded} />
    </div>
  )
}
