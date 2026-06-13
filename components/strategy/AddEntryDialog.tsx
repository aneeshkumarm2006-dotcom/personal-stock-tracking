'use client'

import { useEffect, useState } from 'react'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/format'
import {
  InstrumentTypeahead,
  type InstrumentResult,
} from '@/components/portfolio/InstrumentTypeahead'

const numberInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
  z.number().positive('Must be greater than 0'),
)

const formSchema = z
  .object({
    instrumentToken: z.string().min(1, 'Pick an instrument'),
    instrumentSymbol: z.string().min(1, 'Pick an instrument'),
    entryPrice: numberInput,
    stopLoss: numberInput,
    targetPrice: numberInput,
    quantity: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
      z.number().int('Whole number only').positive('Must be greater than 0'),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.stopLoss >= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['stopLoss'],
        message: 'Must be below entry price',
      })
    }
    if (data.targetPrice <= data.entryPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetPrice'],
        message: 'Must be above entry price',
      })
    }
  })

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export type AddEntryDialogProps = {
  groupId: string
  capitalFree: number
}

function num(value: unknown): number {
  if (value === '' || value === null || value === undefined) return Number.NaN
  const n = Number(value)
  return Number.isFinite(n) ? n : Number.NaN
}

export function AddEntryDialog({ groupId, capitalFree }: AddEntryDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      instrumentToken: '',
      instrumentSymbol: '',
      entryPrice: '',
      stopLoss: '',
      targetPrice: '',
      quantity: '',
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        instrumentToken: '',
        instrumentSymbol: '',
        entryPrice: '',
        stopLoss: '',
        targetPrice: '',
        quantity: '',
      })
    }
  }, [open, form])

  const watched = form.watch()
  const entryPrice = num(watched.entryPrice)
  const stopLoss = num(watched.stopLoss)
  const targetPrice = num(watched.targetPrice)
  const quantity = num(watched.quantity)

  const capitalUsed =
    Number.isFinite(entryPrice) && Number.isFinite(quantity)
      ? Math.round(entryPrice * quantity * 100) / 100
      : null
  const risk =
    Number.isFinite(entryPrice) && Number.isFinite(stopLoss) && Number.isFinite(quantity)
      ? Math.round((entryPrice - stopLoss) * quantity * 100) / 100
      : null
  const reward =
    Number.isFinite(entryPrice) && Number.isFinite(targetPrice) && Number.isFinite(quantity)
      ? Math.round((targetPrice - entryPrice) * quantity * 100) / 100
      : null
  const rr =
    risk !== null && reward !== null && risk > 0
      ? Math.round((reward / risk) * 100) / 100
      : null

  const overAllocated = capitalUsed !== null && capitalUsed > capitalFree

  const selectedInstrument = form.watch('instrumentToken')
    ? {
        token: form.watch('instrumentToken'),
        symbol: form.watch('instrumentSymbol'),
      }
    : null

  const handleInstrumentChange = (result: InstrumentResult | null) => {
    if (result) {
      form.setValue('instrumentToken', result.token, { shouldValidate: true })
      form.setValue('instrumentSymbol', result.symbol, { shouldValidate: true })
    } else {
      form.setValue('instrumentToken', '', { shouldValidate: true })
      form.setValue('instrumentSymbol', '', { shouldValidate: true })
    }
  }

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    if (values.entryPrice * values.quantity > capitalFree) {
      toast.error('Insufficient capital in group')
      return
    }
    try {
      const res = await fetch('/api/strategy/entries', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          instrumentToken: values.instrumentToken,
          instrumentSymbol: values.instrumentSymbol,
          entryPrice: values.entryPrice,
          stopLoss: values.stopLoss,
          targetPrice: values.targetPrice,
          quantity: values.quantity,
          direction: 'long',
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
      toast.success('Entry added')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      setOpen(false)
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Add entry</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add strategy entry</DialogTitle>
          <DialogDescription>
            Define an entry, stop loss, and target price. The entry is tracked
            against live prices and closes automatically at target or stop.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label>Instrument</Label>
            <InstrumentTypeahead
              value={selectedInstrument}
              onChange={handleInstrumentChange}
            />
            {form.formState.errors.instrumentToken && (
              <p className="text-destructive text-xs">
                {form.formState.errors.instrumentToken.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="entry-price">Entry price (₹)</Label>
              <Input
                id="entry-price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                {...form.register('entryPrice')}
              />
              {form.formState.errors.entryPrice && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.entryPrice.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entry-qty">Quantity</Label>
              <Input
                id="entry-qty"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                {...form.register('quantity')}
              />
              {form.formState.errors.quantity && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stop-loss">Stop loss (₹)</Label>
              <Input
                id="stop-loss"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                {...form.register('stopLoss')}
              />
              {form.formState.errors.stopLoss && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.stopLoss.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-price">Target price (₹)</Label>
              <Input
                id="target-price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                {...form.register('targetPrice')}
              />
              {form.formState.errors.targetPrice && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.targetPrice.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Capital used</div>
              <div className={overAllocated ? 'text-destructive font-medium' : 'font-medium'}>
                {capitalUsed !== null ? formatCurrency(capitalUsed) : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Risk</div>
              <div className="font-medium">{risk !== null ? formatCurrency(risk) : '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Reward</div>
              <div className="font-medium">
                {reward !== null ? formatCurrency(reward) : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">R:R</div>
              <div className="font-medium">{rr !== null ? rr.toFixed(2) : '—'}</div>
            </div>
          </div>

          {overAllocated && (
            <p className="text-destructive text-xs">
              Capital used exceeds free capital ({formatCurrency(capitalFree)}).
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || overAllocated}
            >
              {form.formState.isSubmitting ? 'Adding…' : 'Add entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
