'use client'

import type { ReactNode } from 'react'
import { BriefcaseIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatCurrency,
  formatInt,
  formatIstDate,
  formatPercent,
  pnlColorClass,
} from '@/lib/format'
import type { EntryStats } from '@/lib/strategy/group'
import { StrategyEntryTags } from './StrategyEntryTags'

// ---------------------------------------------------------------------------
// Status display — moved here (out of EntriesTable) so the column registry can
// use it without an import cycle. EntriesTable re-exports statusDisplay for the
// existing StrategyGroupList import.
// ---------------------------------------------------------------------------

export type StatusDisplay = {
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

export function statusDisplay(entry: EntryStats): StatusDisplay {
  switch (entry.status) {
    case 'pending':
      return {
        label:
          entry.triggerType === 'stop' ? 'Waiting · breakout ↑' : 'Waiting · dip ↓',
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

// ---------------------------------------------------------------------------
// Column registry
// ---------------------------------------------------------------------------

// Per-row callbacks + group scope handed to every cell renderer, so the Actions
// column can open the same dialogs EntriesTable owns.
export type CellCtx = {
  groupId: string
  allowClose: boolean
  capitalFree: number
  setEntering: (e: EntryStats) => void
  setEditing: (e: EntryStats) => void
  setClosing: (e: EntryStats) => void
  setDeleting: (e: EntryStats) => void
}

export type ColumnDef = {
  id: string
  label: string
  align?: 'left' | 'right'
  headClassName?: string
  // A per-row class is needed for P&L/% Return colouring; static string otherwise.
  cellClassName?: string | ((e: EntryStats) => string)
  // Symbol + Actions can't be toggled off in the customizer.
  alwaysVisible?: boolean
  // Actions only render for an active group (allowClose).
  requiresAllowClose?: boolean
  // Symbol stays first, Actions stays last, regardless of the stored order.
  pinned?: 'start' | 'end'
  cell: (e: EntryStats, ctx: CellCtx) => ReactNode
}

export const ENTRY_COLUMNS: ColumnDef[] = [
  {
    id: 'symbol',
    label: 'Symbol',
    align: 'left',
    alwaysVisible: true,
    pinned: 'start',
    cellClassName: 'font-medium',
    cell: (e) => (
      <>
        {e.instrumentSymbol || e.instrumentToken || (
          <span className="text-muted-foreground font-normal italic">Unassigned</span>
        )}
        {e.enteredToPortfolio && (
          <div className="mt-0.5">
            <Badge
              variant="outline"
              className="border-transparent bg-primary/10 text-primary text-[10px]"
            >
              In portfolio
            </Badge>
          </div>
        )}
      </>
    ),
  },
  {
    id: 'sector',
    label: 'Sector',
    align: 'left',
    cellClassName: 'text-muted-foreground whitespace-nowrap',
    cell: (e) => e.sector || 'Other',
  },
  {
    id: 'entry',
    label: 'Entry',
    align: 'right',
    cell: (e) => formatCurrency(e.entryPrice),
  },
  {
    id: 'sl',
    label: 'SL',
    align: 'right',
    cell: (e) => (
      <>
        {formatCurrency(e.activeStop)}
        {e.activeStop !== e.stopLoss && (
          <div className="text-muted-foreground text-[10px] leading-tight">
            was {formatCurrency(e.stopLoss)}
          </div>
        )}
      </>
    ),
  },
  {
    id: 'tp1',
    label: 'TP1',
    align: 'right',
    cell: (e) => formatCurrency(e.targetPrice),
  },
  {
    id: 'tp2',
    label: 'TP2',
    align: 'right',
    cellClassName: 'text-muted-foreground',
    cell: (e) => (e.target2 !== null ? formatCurrency(e.target2) : '—'),
  },
  {
    id: 'qty',
    label: 'Qty',
    align: 'right',
    cell: (e) =>
      e.soldQuantity > 0
        ? `${formatInt(e.remainingQuantity)} / ${formatInt(e.quantity)}`
        : formatInt(e.quantity),
  },
  {
    id: 'capital',
    label: 'Capital',
    align: 'right',
    cell: (e) => formatCurrency(e.capitalUsed),
  },
  {
    id: 'risk',
    label: 'Risk',
    align: 'right',
    cell: (e) => formatCurrency(e.risk),
  },
  {
    id: 'reward',
    label: 'Reward',
    align: 'right',
    cell: (e) => formatCurrency(e.reward),
  },
  {
    id: 'rr',
    label: 'R:R',
    align: 'right',
    cell: (e) => (e.rr > 0 ? e.rr.toFixed(2) : '—'),
  },
  {
    id: 'current',
    label: 'Current',
    align: 'right',
    cell: (e) => formatCurrency(e.currentPrice),
  },
  {
    id: 'status',
    label: 'Status',
    align: 'left',
    cell: (e) => {
      const d = statusDisplay(e)
      return (
        <Badge variant={d.variant} className={d.className}>
          {d.label}
        </Badge>
      )
    },
  },
  {
    id: 'pnl',
    label: 'P&L',
    align: 'right',
    cellClassName: (e) => pnlColorClass(e.totalPnL),
    cell: (e) =>
      e.status === 'pending' || e.status === 'expired'
        ? '—'
        : formatCurrency(e.totalPnL),
  },
  {
    id: 'returnPct',
    label: '% Return',
    align: 'right',
    cellClassName: (e) => pnlColorClass(e.totalPnL),
    cell: (e) =>
      e.status === 'pending' || e.status === 'expired' || e.capitalUsed <= 0
        ? '—'
        : formatPercent((e.totalPnL / e.capitalUsed) * 100),
  },
  {
    id: 'entryDate',
    label: 'Entry date',
    align: 'left',
    cellClassName: 'text-muted-foreground whitespace-nowrap',
    cell: (e) => formatIstDate(e.createdAt),
  },
  {
    id: 'daysHeld',
    label: 'Days',
    align: 'right',
    cellClassName: 'text-muted-foreground',
    cell: (e) => {
      if (!e.createdAt) return '—'
      const ms = Date.now() - new Date(e.createdAt).getTime()
      if (Number.isNaN(ms)) return '—'
      return formatInt(Math.max(0, Math.floor(ms / 86_400_000)))
    },
  },
  {
    id: 'trigger',
    label: 'Trigger',
    align: 'left',
    cellClassName: 'text-muted-foreground whitespace-nowrap',
    cell: (e) => (e.triggerType === 'stop' ? 'Breakout ↑' : 'Dip ↓'),
  },
  {
    id: 'tags',
    label: 'Tags',
    align: 'left',
    headClassName: 'min-w-[240px]',
    cellClassName: 'min-w-[240px]',
    cell: (e, ctx) =>
      e.id ? (
        <StrategyEntryTags
          entryId={e.id}
          groupId={ctx.groupId}
          instrumentSymbol={e.instrumentSymbol}
          tags={e.tags}
        />
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    id: 'actions',
    label: 'Actions',
    align: 'right',
    alwaysVisible: true,
    pinned: 'end',
    requiresAllowClose: true,
    cell: (e, ctx) => {
      const canClose =
        e.status === 'pending' ||
        e.status === 'active' ||
        e.status === 'partial' ||
        e.status === 'trailing'
      const canEdit = e.status === 'pending'
      const canDelete = canClose
      const canEnter = !!e.instrumentToken && !e.enteredToPortfolio && canClose
      if (!(e.id && (canClose || canEdit || canEnter))) {
        return <span className="text-muted-foreground text-xs">—</span>
      }
      return (
        <div className="flex justify-end gap-1.5">
          {canEnter && (
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => ctx.setEntering(e)}
              aria-label="Enter into portfolio"
              title="Enter into portfolio"
            >
              <BriefcaseIcon className="size-3.5" />
            </Button>
          )}
          {canEdit && (
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => ctx.setEditing(e)}
              aria-label="Edit entry"
              title="Edit"
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
          {canClose && (
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => ctx.setClosing(e)}
              aria-label="Close entry"
              title="Close"
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              size="icon-xs"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => ctx.setDeleting(e)}
              aria-label="Delete entry"
              title="Delete"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </div>
      )
    },
  },
]

const BY_ID = new Map(ENTRY_COLUMNS.map((c) => [c.id, c]))
const PINNED_START = ENTRY_COLUMNS.filter((c) => c.pinned === 'start').map((c) => c.id)
const PINNED_END = ENTRY_COLUMNS.filter((c) => c.pinned === 'end').map((c) => c.id)

// Default column order. All columns (including the five new ones) are visible
// out of the box; the customizer lets the user hide what they don't want.
export const DEFAULT_ORDER = ENTRY_COLUMNS.map((c) => c.id)
export const DEFAULT_HIDDEN: string[] = []

// Migration-safe order: keep known stored ids (in stored order), insert any
// newly-added columns at their default position, drop unknown ids, then force
// the pinned columns to the ends.
export function mergeOrder(stored: string[]): string[] {
  const result = stored.filter((id) => BY_ID.has(id))
  DEFAULT_ORDER.forEach((id, i) => {
    if (result.includes(id)) return
    const prev = DEFAULT_ORDER.slice(0, i)
      .reverse()
      .find((p) => result.includes(p))
    result.splice(prev ? result.indexOf(prev) + 1 : 0, 0, id)
  })
  const middle = result.filter(
    (id) => !PINNED_START.includes(id) && !PINNED_END.includes(id),
  )
  return [...PINNED_START, ...middle, ...PINNED_END]
}

// The ordered, visible columns for one table. `allowClose` drops Actions on a
// closed group, exactly like the old `{allowClose && …}` guard did.
export function resolveColumns(
  order: string[],
  hidden: Set<string>,
  allowClose: boolean,
): ColumnDef[] {
  return mergeOrder(order)
    .map((id) => BY_ID.get(id)!)
    .filter(
      (c) =>
        (c.alwaysVisible || !hidden.has(c.id)) &&
        (!c.requiresAllowClose || allowClose),
    )
}
