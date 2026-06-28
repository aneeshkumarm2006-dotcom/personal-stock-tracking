'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { InlineTagsInput } from '@/components/strategy/InlineTagsInput'

export type TagsEditorProps = {
  /** The identifier used in the endpoint URL (e.g. instrumentToken). */
  entityId: string
  /** Human label shown in the dialog title (e.g. the symbol). */
  entityLabel: string
  /** Sent in the PUT body alongside the tags (kept for parity with holdings). */
  instrumentSymbol?: string
  tags: string[]
  /** Full tags endpoint, e.g. `/api/watchlist/${token}/tags`. */
  endpoint: string
  /** Query keys to invalidate after a successful save. */
  invalidateKeys: (readonly unknown[])[]
  title?: string
  description?: string
}

// Generic tag chip editor — shared by Portfolio holdings and the Watchlist.
// Behaviour mirrors the original HoldingTagsEditor exactly; only the endpoint,
// labels, and query-invalidation keys are parameterised.
export function TagsEditor({
  entityId,
  entityLabel,
  instrumentSymbol,
  tags,
  endpoint,
  invalidateKeys,
  title,
  description,
}: TagsEditorProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(tags)
  const [saving, setSaving] = useState(false)

  // Reset the working copy each time the dialog opens so cancels are discarded.
  const handleOpenChange = (next: boolean) => {
    if (next) setSelected(tags)
    setOpen(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selected, instrumentSymbol }),
      })
      if (!res.ok) {
        toast.error(`Failed to save tags (${res.status})`)
        return
      }
      toast.success('Tags updated')
      await Promise.all(
        invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      )
      setOpen(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
        </Badge>
      ))}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-5 gap-1 px-1.5 text-xs"
            >
              <PlusIcon className="size-3" aria-hidden="true" />
              {tags.length === 0 ? 'Tag' : null}
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title ?? `Tags for ${entityLabel || entityId}`}</DialogTitle>
            <DialogDescription>
              {description ??
                'Capture your intention for this item (e.g. long term, swing, short term). Type a new tag and press Enter to create it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="tag-input">Tags</Label>
            <InlineTagsInput id="tag-input" value={selected} onChange={setSelected} />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save tags'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
