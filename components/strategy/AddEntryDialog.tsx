'use client'

import { useEffect, useState, type ChangeEvent, type FocusEvent } from 'react'
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

const optionalNumberInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().positive('Must be greater than 0').optional(),
)

const formSchema = z
  .object({
    instrumentToken: z.string().min(1, 'Pick an instrument'),
    instrumentSymbol: z.string().min(1, 'Pick an instrument'),
    entryPrice: numberInput,
    stopLoss: numberInput,
    targetPrice: numberInput,
    target2: optionalNumberInput,
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
    if (data.target2 != null && data.target2 <= data.targetPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['target2'],
        message: 'Must be above Target 1',
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
      target2: '',
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
        target2: '',
        quantity: '',
      })
    }
  }, [open, form])

  const watched = form.watch()
  const entryPrice = num(watched.entryPrice)
  const stopLoss = num(watched.stopLoss)
  const targetPrice = num(watched.targetPrice)
  const target2 = num(watched.target2)
  const quantity = num(watched.quantity)

  const hasTarget2 = Number.isFinite(target2)
  // Mirrors the auto-decision the evaluator makes (lib/strategy/evaluate.ts).
  const planText = !Number.isFinite(quantity)
    ? null
    : quantity === 1
      ? hasTarget2
        ? 'Single share: holds past TP1 on a trailing stop, and exits if TP2 is reached.'
        : 'Single share: holds past TP1 on a trailing stop (stop never drops below your entry).'
      : hasTarget2
        ? `Sells ${Math.floor(quantity / 2)} of ${quantity} at TP1, then trails the rest up (selling on a pullback, or at TP2 if reached).`
        : 'Sells the whole position at TP1. Add a TP2 to sell half there and trail the rest.'

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

  type PriceField = 'stopLoss' | 'targetPrice' | 'target2'

  // Lets the SL / TP1 / TP2 boxes accept a percentage (e.g. "10%") instead of a
  // rupee price. It is converted off the entry price, in place, in the same box.
  // SL sits below entry; targets sit above.
  const resolvePriceOrPercent = (
    field: PriceField,
    direction: 'up' | 'down',
    raw: string,
  ) => {
    const match = /^(\d*\.?\d+)\s*%$/.exec(raw.trim())
    if (!match) return
    const pct = Number(match[1])
    const base = num(form.getValues('entryPrice'))
    if (!Number.isFinite(base) || !Number.isFinite(pct)) return
    const computed =
      direction === 'down' ? base * (1 - pct / 100) : base * (1 + pct / 100)
    form.setValue(field, String(Math.round(computed * 100) / 100), {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  // Spread onto a price input: resolves a "%" value as soon as it is typed, and
  // again on blur (covers pasted values).
  const percentField = (field: PriceField, direction: 'up' | 'down') => {
    const reg = form.register(field)
    const maybeResolve = (value: string) => {
      if (value.trim().endsWith('%')) resolvePriceOrPercent(field, direction, value)
    }
    return {
      ...reg,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        void reg.onChange(e)
        maybeResolve(e.target.value)
      },
      onBlur: (e: FocusEvent<HTMLInputElement>) => {
        void reg.onBlur(e)
        maybeResolve(e.target.value)
      },
    }
  }

  // If a "%" was typed into a price box before entry was filled, redo the
  // conversion once entry is known (or changes).
  const reresolvePriceFields = () => {
    resolvePriceOrPercent('stopLoss', 'down', String(form.getValues('stopLoss') ?? ''))
    resolvePriceOrPercent('targetPrice', 'up', String(form.getValues('targetPrice') ?? ''))
    resolvePriceOrPercent('target2', 'up', String(form.getValues('target2') ?? ''))
  }

  const entryReg = form.register('entryPrice')

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
          ...(values.target2 != null ? { target2: values.target2 } : {}),
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
                {...entryReg}
                onBlur={(e) => {
                  void entryReg.onBlur(e)
                  reresolvePriceFields()
                }}
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
              <Label htmlFor="stop-loss">Stop loss (₹ or %)</Label>
              <Input
                id="stop-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 4645 or 5%"
                {...percentField('stopLoss', 'down')}
              />
              {form.formState.errors.stopLoss && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.stopLoss.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-price">Target 1 / TP1 (₹ or %)</Label>
              <Input
                id="target-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 4790 or 2%"
                {...percentField('targetPrice', 'up')}
              />
              {form.formState.errors.targetPrice && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.targetPrice.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="target-2">
                Target 2 / TP2 (₹ or %){' '}
                <span className="text-muted-foreground font-normal">— optional</span>
              </Label>
              <Input
                id="target-2"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="e.g. 4900 or 5%"
                {...percentField('target2', 'up')}
              />
              {form.formState.errors.target2 && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.target2.message}
                </p>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Tip: type a percentage like <span className="font-medium">5%</span> in
            the stop / target boxes and it is converted from the entry price
            automatically.
          </p>

          {planText && (
            <p className="bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-xs">
              <span className="text-foreground font-medium">What happens: </span>
              {planText}
            </p>
          )}

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
