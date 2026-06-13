'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TagsEditor } from '@/components/TagsEditor'
import { formatCurrency, formatPercent, pnlColorClass } from '@/lib/format'
import type { Conviction, WatchlistItemView } from '@/lib/watchlist/types'
import { AddToWatchlistDialog } from './AddToWatchlistDialog'
import { ManageAlertsDialog } from './ManageAlertsDialog'
import { WatchlistSparkline } from './WatchlistSparkline'

const CONVICTION_LABEL: Record<Conviction, string> = {
  watching: 'Watching',
  interested: 'Interested',
  high: 'High',
}

function DistanceCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>
  if (Math.abs(pct) < 0.005) return <span>at target</span>
  const mustRise = pct > 0
  return (
    <span
      className="text-muted-foreground"
      title={
        mustRise
          ? 'Price must rise to reach your target'
          : 'Price must fall to reach your target'
      }
    >
      {mustRise ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  )
}

function AlertsCell({ item }: { item: WatchlistItemView }) {
  if (item.alerts.length === 0) {
    return <span className="text-muted-foreground text-xs">none</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {item.armedCount > 0 ? <Badge>{item.armedCount} armed</Badge> : null}
      {item.triggeredCount > 0 ? (
        <Badge variant="secondary">triggered</Badge>
      ) : null}
      {item.armedCount === 0 && item.triggeredCount === 0 ? (
        <Badge variant="outline">{item.alerts.length}</Badge>
      ) : null}
    </span>
  )
}

export type WatchlistTableProps = {
  items: WatchlistItemView[]
  selected: Set<string>
  onToggleSelect: (token: string) => void
  onToggleAll: () => void
  allSelected: boolean
}

export function WatchlistTable({
  items,
  selected,
  onToggleSelect,
  onToggleAll,
  allSelected,
}: WatchlistTableProps) {
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                aria-label="Select all"
                className="border-input size-3.5 rounded"
                checked={allSelected}
                onChange={onToggleAll}
              />
            </TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Trend</TableHead>
            <TableHead className="text-right">LTP</TableHead>
            <TableHead className="text-right">Day %</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right">Δ Target</TableHead>
            <TableHead>Conviction</TableHead>
            <TableHead>Alerts</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <WatchlistRow
              key={item.instrumentToken}
              item={item}
              selected={selected.has(item.instrumentToken)}
              onToggleSelect={() => onToggleSelect(item.instrumentToken)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

type WatchlistRowProps = {
  item: WatchlistItemView
  selected: boolean
  onToggleSelect: () => void
}

function WatchlistRow({ item, selected, onToggleSelect }: WatchlistRowProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)

  const remove = async () => {
    if (
      !window.confirm(
        `Remove ${item.instrumentSymbol || item.instrumentToken} from your watchlist?`,
      )
    ) {
      return
    }
    try {
      const res = await fetch(
        `/api/watchlist/${encodeURIComponent(item.instrumentToken)}`,
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        toast.error(`Failed to remove (${res.status})`)
        return
      }
      toast.success('Removed from watchlist')
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      router.refresh()
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell>
        <input
          type="checkbox"
          aria-label={`Select ${item.instrumentSymbol}`}
          className="border-input size-3.5 rounded"
          checked={selected}
          onChange={onToggleSelect}
        />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-col gap-0.5">
          <span>{item.instrumentSymbol || item.instrumentToken}</span>
          <div className="flex flex-wrap gap-1">
            {item.inPortfolio ? (
              <Badge variant="outline" className="text-[10px]">
                In portfolio
              </Badge>
            ) : null}
            {item.inStrategy ? (
              <Badge variant="outline" className="text-[10px]">
                In strategy
              </Badge>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <TagsEditor
          entityId={item.instrumentToken}
          entityLabel={item.instrumentSymbol || item.instrumentToken}
          instrumentSymbol={item.instrumentSymbol}
          tags={item.tags}
          endpoint={`/api/watchlist/${encodeURIComponent(item.instrumentToken)}/tags`}
          invalidateKeys={[['watchlist'], ['tags']]}
        />
      </TableCell>
      <TableCell>
        <WatchlistSparkline token={item.instrumentToken} exchange={item.exchange} />
      </TableCell>
      <TableCell className="text-right">{formatCurrency(item.ltp)}</TableCell>
      <TableCell className={`text-right ${pnlColorClass(item.dayChangePct)}`}>
        {formatPercent(item.dayChangePct)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(item.targetBuyPrice)}
      </TableCell>
      <TableCell className="text-right">
        <DistanceCell pct={item.distanceToTargetPct} />
      </TableCell>
      <TableCell>
        <Badge variant={item.conviction === 'high' ? 'default' : 'outline'}>
          {CONVICTION_LABEL[item.conviction]}
        </Badge>
      </TableCell>
      <TableCell>
        <AlertsCell item={item} />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Row actions"
                className="text-muted-foreground"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  ⋯
                </span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAlertsOpen(true)}>
              Manage alerts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              Edit target &amp; notes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={remove}>
              Remove from watchlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Trigger-less, controlled dialogs. Content portals to body, so
            nothing renders inline here when closed. */}
        <ManageAlertsDialog
          item={item}
          open={alertsOpen}
          onOpenChange={setAlertsOpen}
        />
        <AddToWatchlistDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          initial={{
            instrumentToken: item.instrumentToken,
            instrumentSymbol: item.instrumentSymbol,
            exchange: item.exchange,
            name: item.name,
            targetBuyPrice: item.targetBuyPrice,
            conviction: item.conviction,
            notes: item.notes,
          }}
        />
      </TableCell>
    </TableRow>
  )
}
