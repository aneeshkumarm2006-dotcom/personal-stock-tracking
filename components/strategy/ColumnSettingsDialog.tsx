'use client'

import { GripVerticalIcon, LockIcon } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ENTRY_COLUMNS } from './entryColumns'
import { useStrategyColumns } from './StrategyColumnsContext'

const BY_ID = new Map(ENTRY_COLUMNS.map((c) => [c.id, c]))

export function ColumnSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { order, hidden, toggle, reorder, reset } = useStrategyColumns()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Only the non-pinned columns take part in drag reordering.
  const sortableIds = order.filter((id) => !BY_ID.get(id)?.pinned)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorder(String(active.id), String(over.id))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize columns</DialogTitle>
          <DialogDescription>
            Toggle columns on or off and drag to reorder. Applies to every group’s
            table.
          </DialogDescription>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <ul className="thin-scrollbar max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {order.map((id) => {
                const col = BY_ID.get(id)
                if (!col) return null
                const isPinned = !!col.pinned
                const visible = col.alwaysVisible || !hidden.has(id)
                if (isPinned) {
                  return (
                    <PinnedRow key={id} label={col.label} />
                  )
                }
                return (
                  <SortableRow
                    key={id}
                    id={id}
                    label={col.label}
                    visible={visible}
                    onToggle={() => toggle(id)}
                  />
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={reset}>
            Reset to default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PinnedRow({ label }: { label: string }) {
  return (
    <li className="bg-muted/40 flex items-center gap-2 rounded-md border px-2 py-1.5">
      <LockIcon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-muted-foreground text-[11px]">Always on</span>
      <Switch checked disabled aria-label={`${label} is always shown`} />
    </li>
  )
}

function SortableRow({
  id,
  label,
  visible,
  onToggle,
}: {
  id: string
  label: string
  visible: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card flex items-center gap-2 rounded-md border px-2 py-1.5',
        isDragging && 'ring-ring/40 relative z-10 shadow-sm ring-2',
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground -ml-1 cursor-grab touch-none rounded p-1 active:cursor-grabbing"
        aria-label={`Drag ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <span className="flex-1 text-sm">{label}</span>
      <Switch
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${label}`}
      />
    </li>
  )
}
