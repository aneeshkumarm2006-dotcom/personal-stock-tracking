'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import type { EntryStats } from '@/lib/strategy/group'
import { ManualCloseDialog } from './ManualCloseDialog'
import { EditEntryDialog } from './EditEntryDialog'

export type EntriesTableProps = {
  groupId: string
  entries: EntryStats[]
  allowClose?: boolean
  // Free capital in the group, used to validate edits to pending entries.
  capitalFree?: number
}

type StatusDisplay = {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

function runningPct(entry: EntryStats): { label: string; className: string } {
  const pct = entry.capitalUsed > 0 ? (entry.totalPnL / entry.capitalUsed) * 100 : 0
  const sign = pct >= 0 ? '+' : ''
  return {
    label: `${sign}${pct.toFixed(2)}%`,
    className: pct >= 0 ? 'text-gain' : 'text-loss',
  }
}

function statusDisplay(entry: EntryStats): StatusDisplay {
  switch (entry.status) {
    case 'pending':
      return {
        label:
          entry.triggerType === 'stop'
            ? 'Waiting · breakout ↑'
            : 'Waiting · dip ↓',
        variant: 'outline',
      }
    case 'active': {
      if (entry.currentPrice === null) {
        return { label: 'Running', variant: 'secondary' }
      }
      const p = runningPct(entry)
      return { label: `Running ${p.label}`, variant: 'outline', className: p.className }
    }
    case 'partial': {
      const p = runningPct(entry)
      return {
        label: `Scaled out · ${p.label}`,
        variant: 'outline',
        className: 'bg-gain/10 text-gain border-transparent',
      }
    }
    case 'trailing': {
      const p = runningPct(entry)
      return {
        label: `Trailing · ${p.label}`,
        variant: 'outline',
        className: 'bg-gain/10 text-gain border-transparent',
      }
    }
    case 'tp_hit':
      return {
        label: 'TP hit',
        variant: 'outline',
        className: 'bg-gain/10 text-gain border-transparent',
      }
    case 'trail_hit':
      return {
        label: 'Trail exit',
        variant: 'outline',
        className: 'bg-gain/10 text-gain border-transparent',
      }
    case 'sl_hit':
      return {
        label: 'SL hit',
        variant: 'outline',
        className: 'bg-loss/10 text-loss border-transparent',
      }
    case 'closed_manual':
      return { label: 'Closed', variant: 'outline' }
    case 'expired':
      return {
        label: 'Expired · never filled',
        variant: 'outline',
        className: 'text-muted-foreground',
      }
    default:
      return { label: entry.status, variant: 'outline' }
  }
}

export function EntriesTable({
  groupId,
  entries,
  allowClose = true,
  capitalFree = 0,
}: EntriesTableProps) {
  const [closing, setClosing] = useState<EntryStats | null>(null)
  const [editing, setEditing] = useState<EntryStats | null>(null)

  if (entries.length === 0) {
    return (
      <EmptyState
        className="min-h-24 py-6"
        description="No entries yet. Add one to start tracking trade ideas in this group."
      />
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">TP1</TableHead>
              <TableHead className="text-right">TP2</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Risk</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="text-right">R:R</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              {allowClose && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const display = statusDisplay(e)
              const canClose =
                e.status === 'pending' ||
                e.status === 'active' ||
                e.status === 'partial' ||
                e.status === 'trailing'
              // Only entries that haven't filled yet can have their levels edited.
              const canEdit = e.status === 'pending'
              const stopMoved = e.activeStop !== e.stopLoss
              const key = e.id ?? `${e.instrumentToken}-${e.entryPrice}`
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {e.instrumentSymbol || e.instrumentToken}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.entryPrice)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(e.activeStop)}
                    {stopMoved && (
                      <div className="text-muted-foreground text-[10px] leading-tight">
                        was {formatCurrency(e.stopLoss)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.targetPrice)}</TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    {e.target2 !== null ? formatCurrency(e.target2) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.soldQuantity > 0
                      ? `${formatInt(e.remainingQuantity)} / ${formatInt(e.quantity)}`
                      : formatInt(e.quantity)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.capitalUsed)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.risk)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.reward)}</TableCell>
                  <TableCell className="text-right">
                    {e.rr > 0 ? e.rr.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.currentPrice)}</TableCell>
                  <TableCell>
                    <Badge variant={display.variant} className={display.className}>
                      {display.label}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right ${pnlColorClass(e.totalPnL)}`}>
                    {e.status === 'pending' || e.status === 'expired'
                      ? '—'
                      : formatCurrency(e.totalPnL)}
                  </TableCell>
                  {allowClose && (
                    <TableCell className="text-right">
                      {e.id && (canClose || canEdit) ? (
                        <div className="flex justify-end gap-1.5">
                          {canEdit && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setEditing(e)}
                            >
                              Edit
                            </Button>
                          )}
                          {canClose && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setClosing(e)}
                            >
                              Close
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {closing && closing.id && (
        <ManualCloseDialog
          entryId={closing.id}
          groupId={groupId}
          symbol={closing.instrumentSymbol || closing.instrumentToken}
          currentPrice={closing.currentPrice}
          onClose={() => setClosing(null)}
        />
      )}

      {editing && editing.id && (
        <EditEntryDialog
          entry={editing}
          groupId={groupId}
          // This entry's own capital is freed when re-allocated, so it's
          // available again on top of the group's free capital.
          capitalAvailable={capitalFree + editing.capitalUsed}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
