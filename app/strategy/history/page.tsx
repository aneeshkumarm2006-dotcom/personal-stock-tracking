import Link from 'next/link'
import { ChevronRightIcon } from 'lucide-react'

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
import { EmptyState } from '@/components/ui/empty-state'
import { DeleteGroupButton } from '@/components/strategy/DeleteGroupButton'
import { PageHeader } from '@/components/PageHeader'
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
import {
  realizedPnL,
  type StrategyEntryStatus,
  type StrategyEvent,
} from '@/lib/strategy/evaluate'

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
  target2?: number | null
  quantity: number
  status: StrategyEntryStatus
  events: StrategyEvent[]
}

function statusBadge(status: StrategyEntryStatus) {
  switch (status) {
    case 'tp_hit':
      return (
        <Badge variant="outline" className="bg-gain/10 text-gain border-transparent">
          TP hit
        </Badge>
      )
    case 'trail_hit':
      return (
        <Badge variant="outline" className="bg-gain/10 text-gain border-transparent">
          Trail exit
        </Badge>
      )
    case 'sl_hit':
      return (
        <Badge variant="outline" className="bg-loss/10 text-loss border-transparent">
          SL hit
        </Badge>
      )
    case 'closed_manual':
      return <Badge variant="outline">Closed</Badge>
    case 'expired':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Expired
        </Badge>
      )
    case 'partial':
      return <Badge variant="secondary">Scaled out</Badge>
    case 'trailing':
      return <Badge variant="secondary">Trailing</Badge>
    case 'active':
      return <Badge variant="secondary">Active</Badge>
    case 'pending':
      return <Badge variant="outline">Pending</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// The price of the final fill that closed the position (entries may exit in two
// fills when scaled out; this is the last one).
function entryExitPrice(entry: EntryDoc): number | null {
  const exit = [...entry.events]
    .reverse()
    .find((e) => typeof e.quantity === 'number' && e.quantity > 0)
  return exit?.price ?? null
}

function entryPnL(entry: EntryDoc): number | null {
  if (!entry.events.some((e) => typeof e.quantity === 'number' && e.quantity > 0)) {
    return null
  }
  return realizedPnL(entry.entryPrice, entry.events)
}

function eventLabel(type: string): string {
  switch (type) {
    case 'entry_hit':
      return 'Entry hit'
    case 'tp1_hit':
      return 'TP1 hit — trailing started'
    case 'tp1_partial':
      return 'TP1 hit — sold 50%'
    case 'tp_hit':
      return 'Target hit'
    case 'trail_hit':
      return 'Trailing stop hit'
    case 'sl_hit':
      return 'Stop loss hit'
    case 'closed_manual':
      return 'Closed manually'
    case 'expired':
      return 'Expired — never triggered within 10 trading days'
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
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Strategy history"
        description="Closed strategy groups with their outcomes and event timelines."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/strategy" />}
          >
            Back to active groups
          </Button>
        }
      />

      {groupsRaw.length === 0 ? (
        <EmptyState
          title="No closed groups yet"
          description="Groups appear here once every entry is resolved and the group is closed."
        />
      ) : (
        <div className="space-y-4">
          {groupsRaw.map((g) => {
            const id = String(g._id)
            const entries = entriesByGroup.get(id) ?? []
            const wins = entries.filter(
              (e) => e.status === 'tp_hit' || e.status === 'trail_hit',
            ).length
            const slHits = entries.filter((e) => e.status === 'sl_hit').length
            const decided = wins + slHits
            const winRate = decided > 0 ? (wins / decided) * 100 : 0
            const netResult = entries.reduce((acc, e) => {
              const pnl = entryPnL(e)
              return pnl === null ? acc : acc + pnl
            }, 0)

            return (
              <Card key={id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle>{g.name}</CardTitle>
                        <Badge variant="secondary">Closed</Badge>
                      </div>
                      <CardDescription>
                        {formatIstDate(g.createdAt)} → {formatIstDate(g.closedAt)} ·{' '}
                        {formatCurrency(g.allocatedCapital)} allocated · {entries.length}{' '}
                        {entries.length === 1 ? 'entry' : 'entries'}
                      </CardDescription>
                    </div>
                    <dl className="flex items-center gap-6">
                      <div>
                        <dt className="text-muted-foreground text-xs">Win rate</dt>
                        <dd className="text-sm font-medium tabular-nums">
                          {winRate.toFixed(0)}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Net result</dt>
                        <dd
                          className={`text-sm font-medium tabular-nums ${pnlColorClass(netResult)}`}
                        >
                          {formatCurrency(netResult)}
                        </dd>
                      </div>
                      <DeleteGroupButton groupId={id} groupName={g.name} />
                    </dl>
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
                            className="group overflow-hidden rounded-lg border"
                          >
                            <summary className="hover:bg-muted/50 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors select-none [&::-webkit-details-marker]:hidden">
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                <ChevronRightIcon
                                  className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90"
                                  aria-hidden="true"
                                />
                                <span className="font-medium">
                                  {e.instrumentSymbol || e.instrumentToken || (
                                    <span className="text-muted-foreground italic">
                                      Unassigned
                                    </span>
                                  )}
                                </span>
                                {statusBadge(e.status)}
                                <span className="text-muted-foreground text-xs tabular-nums">
                                  Entry {formatCurrency(e.entryPrice)} · SL{' '}
                                  {formatCurrency(e.stopLoss)} · TP1{' '}
                                  {formatCurrency(e.targetPrice)}
                                  {e.target2 != null
                                    ? ` · TP2 ${formatCurrency(e.target2)}`
                                    : ''}{' '}
                                  · Qty {formatInt(e.quantity)}
                                </span>
                              </span>
                              <span
                                className={`text-sm font-medium tabular-nums ${pnlColorClass(pnl ?? 0)}`}
                              >
                                {pnl !== null ? formatCurrency(pnl) : '—'}
                              </span>
                            </summary>

                            <div className="space-y-3 border-t px-3 py-3">
                              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <dt className="text-muted-foreground text-xs">Entry</dt>
                                  <dd className="text-sm font-medium tabular-nums">
                                    {formatCurrency(e.entryPrice)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground text-xs">Exit</dt>
                                  <dd className="text-sm font-medium tabular-nums">
                                    {exit !== null ? formatCurrency(exit) : '—'}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground text-xs">
                                    Quantity
                                  </dt>
                                  <dd className="text-sm font-medium tabular-nums">
                                    {formatInt(e.quantity)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted-foreground text-xs">P&L</dt>
                                  <dd
                                    className={`text-sm font-medium tabular-nums ${pnlColorClass(pnl ?? 0)}`}
                                  >
                                    {pnl !== null ? formatCurrency(pnl) : '—'}
                                  </dd>
                                </div>
                              </dl>

                              {e.events.length > 0 ? (
                                <div className="overflow-hidden rounded-md border">
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
