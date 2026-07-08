'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { EntryStats } from '@/lib/strategy/group'
import { resolveColumns, type CellCtx } from './entryColumns'
import { useStrategyColumns } from './StrategyColumnsContext'
import { ManualCloseDialog } from './ManualCloseDialog'
import { EditEntryDialog } from './EditEntryDialog'
import { EnterPositionDialog } from './EnterPositionDialog'

// Re-exported so StrategyGroupList's `import { statusDisplay } from './EntriesTable'`
// keeps working after the move into the column registry.
export { statusDisplay, type StatusDisplay } from './entryColumns'

export type EntriesTableProps = {
  groupId: string
  entries: EntryStats[]
  allowClose?: boolean
  // Free capital in the group, used to validate edits to pending entries.
  capitalFree?: number
}

export function EntriesTable({
  groupId,
  entries,
  allowClose = true,
  capitalFree = 0,
}: EntriesTableProps) {
  const queryClient = useQueryClient()
  const [closing, setClosing] = useState<EntryStats | null>(null)
  const [editing, setEditing] = useState<EntryStats | null>(null)
  const [entering, setEntering] = useState<EntryStats | null>(null)
  const [deleting, setDeleting] = useState<EntryStats | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const { order, hidden } = useStrategyColumns()

  async function confirmDelete() {
    if (!deleting?.id) return
    setDeletePending(true)
    try {
      const res = await fetch(`/api/strategy/entries/${deleting.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        let message = `Failed (${res.status})`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {}
        toast.error(message)
        return
      }
      toast.success('Entry deleted')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      setDeleting(null)
    } catch {
      toast.error('Network error')
    } finally {
      setDeletePending(false)
    }
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        className="min-h-24 py-6"
        description="No entries yet. Add one to start tracking trade ideas in this group."
      />
    )
  }

  const columns = resolveColumns(order, hidden, allowClose)
  const ctx: CellCtx = {
    groupId,
    allowClose,
    capitalFree,
    setEntering,
    setEditing,
    setClosing,
    setDeleting,
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border">
        <Table containerClassName="thin-scrollbar">
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(col.align === 'right' && 'text-right', col.headClassName)}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const key = e.id ?? `${e.instrumentToken}-${e.entryPrice}`
              return (
                <TableRow key={key}>
                  {columns.map((col) => {
                    const extra =
                      typeof col.cellClassName === 'function'
                        ? col.cellClassName(e)
                        : col.cellClassName
                    return (
                      <TableCell
                        key={col.id}
                        className={cn(col.align === 'right' && 'text-right', extra)}
                      >
                        {col.cell(e, ctx)}
                      </TableCell>
                    )
                  })}
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
          symbol={closing.instrumentSymbol || closing.instrumentToken || 'Unassigned'}
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

      {entering && entering.id && (
        <EnterPositionDialog
          entry={entering}
          groupId={groupId}
          onClose={() => setEntering(null)}
        />
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!deletePending && !next) setDeleting(null)
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `“${deleting.instrumentSymbol || deleting.instrumentToken || 'This unassigned entry'}” will be permanently removed from this group and its reserved capital freed. This can’t be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletePending}
            >
              {deletePending ? 'Deleting…' : 'Delete entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
