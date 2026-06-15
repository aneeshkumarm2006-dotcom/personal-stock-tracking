'use client'

import { useMemo, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { GroupCard } from './GroupCard'
import { StrategyLivePrices } from './StrategyLivePrices'

type GroupDoc = {
  _id: string
  name: string
  allocatedCapital: number
  status: 'active' | 'closed'
  createdAt?: string
  closedAt?: string
}

export type StrategyGroupListProps = {
  groups: GroupDoc[]
}

export function StrategyGroupList({ groups }: StrategyGroupListProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StrategyLivePrices />
        {/* Only worth a filter once there's more than one group to sift. */}
        {groups.length > 1 && (
          <div className="relative w-full sm:w-64">
            <SearchIcon
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups by name"
              className="pl-8"
              aria-label="Search groups by name"
            />
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="min-h-24 py-6"
          description={`No groups match “${search.trim()}”.`}
        />
      ) : (
        filtered.map((group) => (
          <GroupCard key={group._id} groupId={group._id} initialGroup={group} />
        ))
      )}
    </div>
  )
}
