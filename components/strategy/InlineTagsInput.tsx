'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

async function fetchTagCatalog(): Promise<string[]> {
  const res = await fetch('/api/tags', { credentials: 'include' })
  if (!res.ok) return []
  const data = (await res.json()) as { tags?: string[] }
  return data.tags ?? []
}

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

function addTag(list: string[], raw: string): string[] {
  const tag = normalize(raw)
  if (!tag) return list
  if (list.some((t) => t.toLowerCase() === tag.toLowerCase())) return list
  return [...list, tag]
}

export type InlineTagsInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  id?: string
  /** Fetch the existing-tag catalog for the dropdown. Defaults to true. */
  showSuggestions?: boolean
}

// Combobox-style tag input: type to filter existing tags in a dropdown, click
// one (or press Enter) to select it, or pick the "Create …" row to add a brand
// new tag. The parent owns the value and persists it on submit. Shared by the
// Strategy add-entry form and (via TagsEditor) the Portfolio + Strategy tag
// dialogs, so both surfaces behave identically.
export function InlineTagsInput({
  value,
  onChange,
  id = 'inline-tags',
  showSuggestions = true,
}: InlineTagsInputProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const catalog = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTagCatalog,
    enabled: showSuggestions,
  })

  // Existing tags not already on this item, narrowed by what's typed.
  const trimmed = normalize(query)
  const matches = useMemo(() => {
    const available = (catalog.data ?? []).filter(
      (t) => !value.some((s) => s.toLowerCase() === t.toLowerCase()),
    )
    if (!trimmed) return available
    const q = trimmed.toLowerCase()
    return available.filter((t) => t.toLowerCase().includes(q))
  }, [catalog.data, value, trimmed])

  // Only offer "Create" when the typed text isn't already an existing/selected tag.
  const exists = useMemo(
    () =>
      [...value, ...(catalog.data ?? [])].some(
        (t) => t.toLowerCase() === trimmed.toLowerCase(),
      ),
    [value, catalog.data, trimmed],
  )
  const showCreate = trimmed.length > 0 && !exists

  // Flat option list backing keyboard navigation: matches first, then Create.
  const options = useMemo(
    () => [
      ...matches.map((tag) => ({ kind: 'tag' as const, tag })),
      ...(showCreate ? [{ kind: 'create' as const, tag: trimmed }] : []),
    ],
    [matches, showCreate, trimmed],
  )

  // Keep the highlight in range as the option list changes under typing.
  useEffect(() => {
    setHighlight((h) => (options.length === 0 ? 0 : Math.min(h, options.length - 1)))
  }, [options.length])

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const select = (tag: string) => {
    onChange(addTag(value, tag))
    setQuery('')
    setHighlight(0)
    setOpen(true)
    inputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => (options.length === 0 ? 0 : (h + 1) % options.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) =>
        options.length === 0 ? 0 : (h - 1 + options.length) % options.length,
      )
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const choice = options[highlight]
      if (choice) {
        select(choice.tag)
      } else if (trimmed) {
        // No dropdown options (e.g. catalog still loading): create from text.
        select(trimmed)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1 min-h-8 focus-within:ring-2 focus-within:ring-ring/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
            >
              <XIcon className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          id={id}
          value={query}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? 'Add a tag…' : ''}
          className="h-5 flex-1 border-0 px-0 shadow-none focus-visible:ring-0 min-w-24"
        />
      </div>

      {open && (options.length > 0 || (catalog.isLoading && showSuggestions)) && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1.5 max-h-56 w-full overflow-auto rounded-lg p-1 shadow-lg ring-1"
        >
          {catalog.isLoading && options.length === 0 && (
            <li className="text-muted-foreground px-2 py-1.5 text-xs">Loading tags…</li>
          )}
          {options.map((opt, i) => (
            <li
              key={opt.kind === 'create' ? `__create__${opt.tag}` : opt.tag}
              role="option"
              aria-selected={i === highlight}
            >
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  i === highlight ? 'bg-muted' : 'hover:bg-muted',
                )}
                // Use mousedown so the input's blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(opt.tag)
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {opt.kind === 'create' ? (
                  <>
                    <PlusIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Create <span className="font-medium">“{opt.tag}”</span>
                    </span>
                  </>
                ) : (
                  <span className="font-medium">{opt.tag}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
