'use client'

import { useQuery } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

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

export type InlineTagsInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  id?: string
  /** Fetch the existing-tag catalog for suggestions. Defaults to true. */
  showSuggestions?: boolean
}

// Controlled chip input for use inside a form (no save button / endpoint of its
// own — the parent owns the value and persists it on submit). Mirrors the
// chip/suggestion behaviour of the dialog-based TagsEditor.
export function InlineTagsInput({
  value,
  onChange,
  id = 'inline-tags',
  showSuggestions = true,
}: InlineTagsInputProps) {
  const catalog = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTagCatalog,
    enabled: showSuggestions,
  })

  const suggestions = (catalog.data ?? []).filter(
    (t) => !value.some((s) => s.toLowerCase() === t.toLowerCase()),
  )

  const commitDraft = (draft: string, clear: () => void) => {
    onChange(addTag(value, draft))
    clear()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitDraft(input.value, () => {
        input.value = ''
      })
    } else if (e.key === 'Backspace' && input.value === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
        {value.map((tag) => (
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
          id={id}
          // Uncontrolled draft: commits to the parent on Enter/comma/blur.
          onKeyDown={handleKeyDown}
          onBlur={(e) =>
            commitDraft(e.target.value, () => {
              e.target.value = ''
            })
          }
          placeholder={value.length === 0 ? 'Add a tag…' : ''}
          className="h-6 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              render={
                <button
                  type="button"
                  onClick={() => onChange(addTag(value, tag))}
                />
              }
            >
              <PlusIcon className="size-3" aria-hidden="true" />
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
