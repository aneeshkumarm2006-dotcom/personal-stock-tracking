'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import type { GroupStats } from '@/lib/strategy/group'
import { EntriesTable } from './EntriesTable'
import { AddEntryDialog } from './AddEntryDialog'

type GroupDoc = {
  _id: string
  name: string
  allocatedCapital: number
  status: 'active' | 'closed'
  createdAt?: string
  closedAt?: string
}

type GroupDetailResponse = {
  group: GroupDoc
  entries: unknown[]
  stats: GroupStats
}

export type GroupCardProps = {
  groupId: string
  initialGroup?: GroupDoc
}

async function fetchGroupDetail(id: string): Promise<GroupDetailResponse> {
  const res = await fetch(`/api/strategy/groups/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load group (${res.status})`)
  return (await res.json()) as GroupDetailResponse
}

const TERMINAL = new Set(['tp_hit', 'sl_hit', 'closed_manual'])

export function GroupCard({ groupId, initialGroup }: GroupCardProps) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['strategyGroup', groupId],
    queryFn: () => fetchGroupDetail(groupId),
    refetchInterval: 30_000,
  })

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/strategy/groups/${groupId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close' }),
      })
      if (!res.ok) {
        let message = `Failed (${res.status})`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {}
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      toast.success('Group closed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (query.isLoading && !query.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialGroup?.name ?? 'Loading…'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{initialGroup?.name ?? 'Group'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">Unable to load this group.</p>
        </CardContent>
      </Card>
    )
  }

  const { group, stats } = query.data
  const counts = stats.entryCountByStatus
  const allTerminal =
    stats.entries.length > 0 &&
    stats.entries.every((e) => TERMINAL.has(e.status))
  const canClose = group.status === 'active' && allTerminal
  const winRatePct = Math.round(stats.winRate * 10000) / 100

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{group.name}</CardTitle>
              <Badge variant={group.status === 'active' ? 'default' : 'secondary'}>
                {group.status}
              </Badge>
            </div>
            <CardDescription>
              {formatCurrency(stats.allocatedCapital)} allocated ·{' '}
              {formatCurrency(stats.capitalDeployed)} deployed ·{' '}
              {formatCurrency(stats.capitalFree)} free
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {group.status === 'active' && (
              <AddEntryDialog groupId={groupId} capitalFree={stats.capitalFree} />
            )}
            {canClose && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? 'Closing…' : 'Close group'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-6">
          <Stat label="Pending" value={counts.pending} />
          <Stat label="Active" value={counts.active} />
          <Stat label="TP hit" value={counts.tp_hit} valueClass="text-emerald-500" />
          <Stat label="SL hit" value={counts.sl_hit} valueClass="text-red-500" />
          <Stat label="Closed" value={counts.closed_manual} />
          <Stat label="Win rate" value={`${winRatePct.toFixed(2)}%`} />
        </div>

        <EntriesTable
          groupId={groupId}
          entries={stats.entries}
          allowClose={group.status === 'active'}
        />
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string | number
  valueClass?: string
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${valueClass ?? ''}`}>{value}</div>
    </div>
  )
}
