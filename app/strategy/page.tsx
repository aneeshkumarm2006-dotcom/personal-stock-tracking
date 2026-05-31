import Link from 'next/link'

import { connectDB } from '@/lib/db/connect'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'

import { Button } from '@/components/ui/button'
import { CreateGroupDialog } from '@/components/strategy/CreateGroupDialog'
import { GroupCard } from '@/components/strategy/GroupCard'

export const dynamic = 'force-dynamic'

type StrategyGroupDoc = {
  _id: unknown
  name: string
  allocatedCapital: number
  status: 'active' | 'closed'
  createdAt?: Date
  closedAt?: Date
}

export default async function StrategyPage() {
  await connectDB()

  const groupsRaw = (await StrategyGroup.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .lean()) as unknown as StrategyGroupDoc[]

  const groups = groupsRaw.map((g) => ({
    _id: String(g._id),
    name: g.name,
    allocatedCapital: g.allocatedCapital,
    status: g.status,
    createdAt: g.createdAt?.toISOString(),
    closedAt: g.closedAt?.toISOString(),
  }))

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Strategy
          </h1>
          <p className="text-muted-foreground text-sm">
            Plan trade ideas in groups. Entries are tracked against live LTP and
            auto-transition through pending → active → tp/sl_hit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" render={<Link href="/strategy/history" />}>
            View history
          </Button>
          <CreateGroupDialog />
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active strategy groups yet. Create one to start tracking trade ideas.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group._id}
              groupId={group._id}
              initialGroup={group}
            />
          ))}
        </div>
      )}
    </div>
  )
}
