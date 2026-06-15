'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/format'
import type { GroupStats } from '@/lib/strategy/group'
import { EntriesTable } from './EntriesTable'
import { AddEntryDialog } from './AddEntryDialog'
import { EditGroupDialog } from './EditGroupDialog'

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

const TERMINAL = new Set([
  'tp_hit',
  'sl_hit',
  'trail_hit',
  'closed_manual',
  'expired',
])

export function GroupCard({ groupId, initialGroup }: GroupCardProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const query = useQuery({
    queryKey: ['strategyGroup', groupId],
    queryFn: () => fetchGroupDetail(groupId),
    refetchInterval: 30_000,
  })

  const closeMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch(`/api/strategy/groups/${groupId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', force }),
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
      setConfirmOpen(false)
      toast.success('Group closed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      // The active-group list is server-rendered; refresh so this card leaves it.
      router.refresh()
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
  const hasOpenEntries = stats.entries.some((e) => !TERMINAL.has(e.status))
  const isActive = group.status === 'active'
  const winRatePct = Math.round(stats.winRate * 10000) / 100

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{group.name}</CardTitle>
              {group.status === 'active' ? (
                <Badge variant="outline" className="gap-1.5">
                  <span
                    className="bg-gain inline-block size-1.5 rounded-full"
                    aria-hidden="true"
                  />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary">Closed</Badge>
              )}
            </div>
            <CardDescription>
              {formatCurrency(stats.allocatedCapital)} allocated ·{' '}
              {formatCurrency(stats.capitalDeployed)} deployed ·{' '}
              {formatCurrency(stats.capitalFree)} free
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <EditGroupDialog
                groupId={groupId}
                name={group.name}
                allocatedCapital={stats.allocatedCapital}
                capitalDeployed={stats.capitalDeployed}
              />
            )}
            {isActive && (
              <AddEntryDialog groupId={groupId} capitalFree={stats.capitalFree} />
            )}
            {isActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  hasOpenEntries ? setConfirmOpen(true) : closeMutation.mutate(false)
                }
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? 'Closing…' : 'Close group'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="space-y-3">
          <div className="bg-card flex items-baseline justify-between rounded-lg border px-4 py-3">
            <dt className="text-muted-foreground text-sm font-medium">Win rate</dt>
            <dd className="text-2xl font-semibold tabular-nums leading-none">
              {`${winRatePct.toFixed(0)}%`}
            </dd>
          </div>
          <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
            <Stat label="Pending" value={counts.pending} />
            <Stat label="Active" value={counts.active} />
            <Stat label="Partial" value={counts.partial} />
            <Stat label="Trailing" value={counts.trailing} />
            <Stat label="TP hit" value={counts.tp_hit} valueClass="text-gain" />
            <Stat label="Trail hit" value={counts.trail_hit} valueClass="text-gain" />
            <Stat label="SL hit" value={counts.sl_hit} valueClass="text-loss" />
            <Stat label="Closed" value={counts.closed_manual} />
            {counts.expired > 0 && (
              <Stat
                label="Expired"
                value={counts.expired}
                valueClass="text-muted-foreground"
              />
            )}
          </div>
        </dl>

        <EntriesTable
          groupId={groupId}
          entries={stats.entries}
          allowClose={group.status === 'active'}
        />
      </CardContent>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!closeMutation.isPending) setConfirmOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Close group with open entries?</DialogTitle>
            <DialogDescription>
              “{group.name}” still has open entries. Closing now books each of them at
              its current market price and moves the group to history. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={closeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => closeMutation.mutate(true)}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Closing…' : 'Close group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    <div className="bg-card px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums ${valueClass ?? ''}`}>
        {value}
      </dd>
    </div>
  )
}
