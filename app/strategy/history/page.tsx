import Link from 'next/link'

import { connectDB } from '@/lib/db/connect'
import { StrategyEntry } from '@/lib/db/models/StrategyEntry'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCurrency,
  formatInt,
  formatIstDate,
  pnlColorClass,
} from '@/lib/format'
import type { StrategyEntryStatus, StrategyEvent } from '@/lib/strategy/evaluate'

export const dynamic = 'force-dynamic'

type GroupDoc = {
  _id: unknown
  name: string
  allocatedCapital: number
  status: 'active' | 'closed'
  createdAt?: Date
  closedAt?: Date
}

type EntryDoc = {
  _id: unknown
  groupId: unknown
  instrumentToken: string
  instrumentSymbol?: string
  entryPrice: number
  stopLoss: number
  targetPrice: number
  quantity: number
  status: StrategyEntryStatus
  events: StrategyEvent[]
}

function statusBadge(status: StrategyEntryStatus) {
  switch (status) {
    case 'tp_hit':
      return (
        <Badge variant="default" className="bg-emerald-600 text-white">
          TP HIT
        </Badge>
      )
    case 'sl_hit':
      return <Badge variant="destructive">SL HIT</Badge>
    case 'closed_manual':
      return <Badge variant="outline">Closed</Badge>
    case 'active':
      return <Badge variant="secondary">Active</Badge>
    case 'pending':
      return <Badge variant="outline">Pending</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function entryExitPrice(entry: EntryDoc): number | null {
  if (entry.status === 'tp_hit') {
    const ev = [...entry.events].reverse().find((e) => e.type === 'tp_hit')
    return ev?.price ?? entry.targetPrice
  }
  if (entry.status === 'sl_hit') {
    const ev = [...entry.events].reverse().find((e) => e.type === 'sl_hit')
    return ev?.price ?? entry.stopLoss
  }
  if (entry.status === 'closed_manual') {
    const ev = [...entry.events].reverse().find((e) => e.type === 'closed_manual')
    return ev?.price ?? null
  }
  return null
}

function entryPnL(entry: EntryDoc): number | null {
  const exit = entryExitPrice(entry)
  if (exit === null) return null
  return Math.round((exit - entry.entryPrice) * entry.quantity * 100) / 100
}

function eventLabel(type: string): string {
  switch (type) {
    case 'entry_hit':
      return 'Entry hit'
    case 'tp_hit':
      return 'Target hit'
    case 'sl_hit':
      return 'Stop loss hit'
    case 'closed_manual':
      return 'Closed manually'
    default:
      return type
  }
}

export default async function StrategyHistoryPage() {
  await connectDB()

  const groupsRaw = (await StrategyGroup.find({ status: 'closed' })
    .sort({ closedAt: -1, createdAt: -1 })
    .lean()) as unknown as GroupDoc[]

  const groupIds = groupsRaw.map((g) => String(g._id))
  const entriesRaw =
    groupIds.length === 0
      ? []
      : ((await StrategyEntry.find({ groupId: { $in: groupIds } as never })
          .sort({ createdAt: 1 })
          .lean()) as unknown as EntryDoc[])

  const entriesByGroup = new Map<string, EntryDoc[]>()
  for (const e of entriesRaw) {
    const key = String(e.groupId)
    const list = entriesByGroup.get(key) ?? []
    list.push(e)
    entriesByGroup.set(key, list)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Strategy history
          </h1>
          <p className="text-muted-foreground text-sm">
            Closed strategy groups with their outcomes and event timelines.
          </p>
        </div>
        <Button size="sm" variant="outline" render={<Link href="/strategy" />}>
          Back to active groups
        </Button>
      </header>

      {groupsRaw.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No closed groups yet.
        </div>
      ) : (
        <div className="space-y-4">
          {groupsRaw.map((g) => {
            const id = String(g._id)
            const entries = entriesByGroup.get(id) ?? []
            const tpHits = entries.filter((e) => e.status === 'tp_hit').length
            const slHits = entries.filter((e) => e.status === 'sl_hit').length
            const decided = tpHits + slHits
            const winRate = decided > 0 ? (tpHits / decided) * 100 : 0
            const netResult = entries.reduce((acc, e) => {
              const pnl = entryPnL(e)
              return pnl === null ? acc : acc + pnl
            }, 0)

            return (
              <Card key={id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{g.name}</CardTitle>
                        <Badge variant="secondary">closed</Badge>
                      </div>
                      <CardDescription>
                        {formatIstDate(g.createdAt)} → {formatIstDate(g.closedAt)} ·{' '}
                        {formatCurrency(g.allocatedCapital)} allocated · {entries.length}{' '}
                        {entries.length === 1 ? 'entry' : 'entries'}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md border bg-muted/30 px-2 py-1">
                        Win rate <strong>{winRate.toFixed(2)}%</strong>
                      </span>
                      <span
                        className={`rounded-md border bg-muted/30 px-2 py-1 ${pnlColorClass(netResult)}`}
                      >
                        Net result <strong>{formatCurrency(netResult)}</strong>
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {entries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No entries.</p>
                  ) : (
                    <div className="space-y-2">
                      {entries.map((e) => {
                        const exit = entryExitPrice(e)
                        const pnl = entryPnL(e)
                        return (
                          <details
                            key={String(e._id)}
                            className="rounded-md border bg-muted/20 px-3 py-2"
                          >
                            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {e.instrumentSymbol || e.instrumentToken}
                                </span>
                                {statusBadge(e.status)}
                                <span className="text-muted-foreground text-xs">
                                  Entry {formatCurrency(e.entryPrice)} · SL{' '}
                                  {formatCurrency(e.stopLoss)} · TP{' '}
                                  {formatCurrency(e.targetPrice)} · Qty{' '}
                                  {formatInt(e.quantity)}
                                </span>
                              </span>
                              <span
                                className={`text-sm font-medium ${pnlColorClass(pnl ?? 0)}`}
                              >
                                {pnl !== null ? formatCurrency(pnl) : '—'}
                              </span>
                            </summary>

                            <div className="mt-3 space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                <div>
                                  <div className="text-muted-foreground">Entry</div>
                                  <div>{formatCurrency(e.entryPrice)}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Exit</div>
                                  <div>
                                    {exit !== null ? formatCurrency(exit) : '—'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">Quantity</div>
                                  <div>{formatInt(e.quantity)}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">P&L</div>
                                  <div className={pnlColorClass(pnl ?? 0)}>
                                    {pnl !== null ? formatCurrency(pnl) : '—'}
                                  </div>
                                </div>
                              </div>

                              {e.events.length > 0 ? (
                                <div className="rounded-md border">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>When</TableHead>
                                        <TableHead>Event</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {e.events.map((ev, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell>
                                            {formatIstDate(ev.timestamp)}
                                          </TableCell>
                                          <TableCell>{eventLabel(ev.type)}</TableCell>
                                          <TableCell className="text-right">
                                            {formatCurrency(ev.price)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-xs">
                                  No events recorded.
                                </p>
                              )}
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
