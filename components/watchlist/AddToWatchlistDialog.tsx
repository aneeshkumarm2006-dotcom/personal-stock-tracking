'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  InstrumentTypeahead,
  type InstrumentResult,
} from '@/components/portfolio/InstrumentTypeahead'
import type { Conviction, Exchange } from '@/lib/watchlist/types'

const formSchema = z.object({
  instrumentToken: z.string().min(1, 'Pick an instrument'),
  instrumentSymbol: z.string().min(1, 'Pick an instrument'),
  exchange: z.enum(['NSE', 'BSE']),
  name: z.string().optional(),
  targetBuyPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive('Must be greater than 0').optional(),
  ),
  conviction: z.enum(['watching', 'interested', 'high']),
  notes: z.string().optional(),
})

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export type WatchlistFormInitial = {
  instrumentToken: string
  instrumentSymbol: string
  exchange: Exchange
  name?: string
  targetBuyPrice?: number | null
  conviction?: Conviction
  notes?: string
}

export type AddToWatchlistDialogProps = {
  mode?: 'create' | 'edit'
  initial?: WatchlistFormInitial
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function addTag(list: string[], raw: string): string[] {
  const tag = raw.trim().replace(/\s+/g, ' ')
  if (!tag) return list
  if (list.some((t) => t.toLowerCase() === tag.toLowerCase())) return list
  return [...list, tag]
}

export function AddToWatchlistDialog({
  mode = 'create',
  initial,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AddToWatchlistDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const queryClient = useQueryClient()
  const router = useRouter()
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')

  const defaultValues = useMemo<FormValues>(
    () => ({
      instrumentToken: initial?.instrumentToken ?? '',
      instrumentSymbol: initial?.instrumentSymbol ?? '',
      exchange: initial?.exchange ?? 'NSE',
      name: initial?.name ?? '',
      targetBuyPrice:
        initial?.targetBuyPrice != null ? String(initial.targetBuyPrice) : '',
      conviction: initial?.conviction ?? 'watching',
      notes: initial?.notes ?? '',
    }),
    [initial],
  )

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
      setTags([])
      setTagDraft('')
    }
  }, [open, defaultValues, form])

  const selectedInstrument = form.watch('instrumentToken')
    ? { token: form.watch('instrumentToken'), symbol: form.watch('instrumentSymbol') }
    : null

  const handleInstrumentChange = (result: InstrumentResult | null) => {
    if (result) {
      form.setValue('instrumentToken', result.token, { shouldValidate: true })
      form.setValue('instrumentSymbol', result.symbol, { shouldValidate: true })
      form.setValue('exchange', result.exchange, { shouldValidate: true })
      form.setValue('name', result.name)
    } else {
      form.setValue('instrumentToken', '', { shouldValidate: true })
      form.setValue('instrumentSymbol', '', { shouldValidate: true })
    }
  }

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    const isEdit = mode === 'edit' && initial
    const url = isEdit
      ? `/api/watchlist/${encodeURIComponent(initial.instrumentToken)}`
      : '/api/watchlist'
    const method = isEdit ? 'PUT' : 'POST'

    const payload: Record<string, unknown> = isEdit
      ? {
          instrumentSymbol: values.instrumentSymbol,
          exchange: values.exchange,
          name: values.name ?? '',
          conviction: values.conviction,
          notes: values.notes ?? '',
          // null clears the target on the server
          targetBuyPrice: values.targetBuyPrice ?? null,
        }
      : {
          instrumentToken: values.instrumentToken,
          instrumentSymbol: values.instrumentSymbol,
          exchange: values.exchange,
          name: values.name ?? '',
          conviction: values.conviction,
          notes: values.notes ?? '',
          tags,
          ...(values.targetBuyPrice !== undefined
            ? { targetBuyPrice: values.targetBuyPrice }
            : {}),
        }

    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        if (res.status === 409) {
          toast.error('That instrument is already on your watchlist')
          return
        }
        let message = `Failed (${res.status})`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {}
        toast.error(message)
        return
      }
      toast.success(isEdit ? 'Watchlist item updated' : 'Added to watchlist')
      await queryClient.invalidateQueries({ queryKey: ['watchlist'] })
      router.refresh()
      setOpen(false)
    } catch {
      toast.error('Network error')
    }
  }

  const commitTagDraft = () => {
    setTags((prev) => addTag(prev, tagDraft))
    setTagDraft('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : mode === 'create' ? (
        <DialogTrigger render={<Button>Add to watchlist</Button>} />
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit watchlist item' : 'Add to watchlist'}
          </DialogTitle>
          <DialogDescription>
            Park a buy candidate: set a target buy price, your conviction, and why
            you&apos;re watching.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label>Instrument</Label>
            {mode === 'edit' ? (
              <p className="text-sm font-medium">
                {initial?.instrumentSymbol || initial?.instrumentToken}
              </p>
            ) : (
              <>
                <InstrumentTypeahead
                  value={selectedInstrument}
                  onChange={handleInstrumentChange}
                />
                {form.formState.errors.instrumentToken && (
                  <p className="text-destructive text-xs">
                    {form.formState.errors.instrumentToken.message}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wl-conviction">Conviction</Label>
              <Select
                value={form.watch('conviction')}
                onValueChange={(v) =>
                  form.setValue('conviction', v as Conviction)
                }
              >
                <SelectTrigger id="wl-conviction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="watching">Watching</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="high">High conviction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-target">Target buy price (₹)</Label>
              <Input
                id="wl-target"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="Optional"
                {...form.register('targetBuyPrice')}
              />
              {form.formState.errors.targetBuyPrice && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.targetBuyPrice.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wl-notes">Why I&apos;m watching</Label>
            <Input
              id="wl-notes"
              type="text"
              placeholder="Optional thesis / what to wait for"
              {...form.register('notes')}
            />
          </div>

          {mode === 'create' && (
            <div className="space-y-1.5">
              <Label htmlFor="wl-tags">Tags</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      className="hover:text-destructive"
                      onClick={() =>
                        setTags((prev) => prev.filter((t) => t !== tag))
                      }
                    >
                      <XIcon className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
                <Input
                  id="wl-tags"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      commitTagDraft()
                    } else if (
                      e.key === 'Backspace' &&
                      tagDraft === '' &&
                      tags.length > 0
                    ) {
                      setTags((prev) => prev.slice(0, -1))
                    }
                  }}
                  onBlur={commitTagDraft}
                  placeholder={tags.length === 0 ? 'e.g. swing, wait for dip' : ''}
                  className="h-6 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? 'Saving…'
                : mode === 'edit'
                  ? 'Save changes'
                  : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
