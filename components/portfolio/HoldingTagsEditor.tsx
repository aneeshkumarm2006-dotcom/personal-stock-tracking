'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

async function fetchTagCatalog(): Promise<string[]> {
  const res = await fetch('/api/tags', { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as { tags?: string[] }
  return data.tags ?? []
}

function addTag(list: string[], raw: string): string[] {
  const tag = raw.trim().replace(/\s+/g, ' ')
  if (!tag) return list
  if (list.some((t) => t.toLowerCase() === tag.toLowerCase())) return list
  return [...list, tag]
}

export type HoldingTagsEditorProps = {
  instrumentToken: string
  instrumentSymbol: string
  tags: string[]
}

export function HoldingTagsEditor({
  instrumentToken,
  instrumentSymbol,
  tags,
}: HoldingTagsEditorProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<string[]>(tags)
  const [saving, setSaving] = useState(false)

  // Reset the working copy each time the dialog opens so cancels are discarded.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelected(tags)
      setDraft('')
    }
    setOpen(next)
  }

  const catalog = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTagCatalog,
    enabled: open,
  })

  const suggestions = (catalog.data ?? []).filter(
    (t) => !selected.some((s) => s.toLowerCase() === t.toLowerCase()),
  )

  const commitDraft = () => {
    setSelected((prev) => addTag(prev, draft))
    setDraft('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft()
    } else if (e.key === 'Backspace' && draft === '' && selected.length > 0) {
      setSelected((prev) => prev.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => {
    setSelected((prev) => prev.filter((t) => t !== tag))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/holdings/${encodeURIComponent(instrumentToken)}/tags`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: selected, instrumentSymbol }),
        },
      )
      if (!res.ok) {
        toast.error(`Failed to save tags (${res.status})`)
        return
      }
      toast.success('Tags updated')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['holdings'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
      ])
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
            <DialogTitle>Tags for {instrumentSymbol || instrumentToken}</DialogTitle>
            <DialogDescription>
              Capture your intention for this position (e.g. long term, swing,
              short term). Type a new tag and press Enter to create it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tag-input">Tags</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
                {selected.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="hover:text-destructive"
                      onClick={() => removeTag(tag)}
                    >
                      <XIcon className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
                <Input
                  id="tag-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={commitDraft}
                  placeholder={selected.length === 0 ? 'Add a tag…' : ''}
                  className="h-6 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">
                  Existing tags
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer"
                      render={
                        <button
                          type="button"
                          onClick={() => setSelected((prev) => addTag(prev, tag))}
                        />
                      }
                    >
                      <PlusIcon className="size-3" aria-hidden="true" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
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
