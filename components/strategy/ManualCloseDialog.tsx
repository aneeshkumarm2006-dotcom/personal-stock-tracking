'use client'

import { useEffect } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const formSchema = z.object({
  closePrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
    z.number().positive('Must be greater than 0'),
  ),
  closeDate: z.string().min(1, 'Required'),
})

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export type ManualCloseDialogProps = {
  entryId: string
  groupId: string
  symbol: string
  currentPrice: number | null
  onClose: () => void
}

function todayDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function ManualCloseDialog({
  entryId,
  groupId,
  symbol,
  currentPrice,
  onClose,
}: ManualCloseDialogProps) {
  const queryClient = useQueryClient()

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      closePrice: currentPrice !== null ? String(currentPrice) : '',
      closeDate: todayDate(),
    },
  })

  useEffect(() => {
    form.reset({
      closePrice: currentPrice !== null ? String(currentPrice) : '',
      closeDate: todayDate(),
    })
  }, [currentPrice, form])

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    try {
      const res = await fetch(`/api/strategy/entries/${entryId}/close`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closePrice: values.closePrice,
          closeDate: new Date(values.closeDate).toISOString(),
        }),
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
      toast.success('Entry closed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      onClose()
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={true} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close entry · {symbol}</DialogTitle>
          <DialogDescription>
            Record a manual close. The entry will be marked as closed and excluded from live tracking.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label htmlFor="close-price">Close price (₹)</Label>
            <Input
              id="close-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              {...form.register('closePrice')}
            />
            {form.formState.errors.closePrice && (
              <p className="text-destructive text-xs">
                {form.formState.errors.closePrice.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="close-date">Close date</Label>
            <Input id="close-date" type="date" {...form.register('closeDate')} />
            {form.formState.errors.closeDate && (
              <p className="text-destructive text-xs">
                {form.formState.errors.closeDate.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Closing…' : 'Confirm close'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
