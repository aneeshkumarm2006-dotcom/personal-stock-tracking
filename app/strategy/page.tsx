import Link from 'next/link'

import { connectDB } from '@/lib/db/connect'
import { StrategyGroup } from '@/lib/db/models/StrategyGroup'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/PageHeader'
import { CreateGroupDialog } from '@/components/strategy/CreateGroupDialog'
import { GroupCard } from '@/components/strategy/GroupCard'
import { StrategyLivePrices } from '@/components/strategy/StrategyLivePrices'

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
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Strategy"
        description="Plan trade ideas in groups. Entries are tracked against live prices and close automatically at target or stop."
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/strategy/history" />}
            >
              View history
            </Button>
            <CreateGroupDialog />
          </>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No active strategy groups"
          description="Create a group to start tracking trade ideas against a shared capital budget."
        />
      ) : (
        <div className="space-y-4">
          <StrategyLivePrices />
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
