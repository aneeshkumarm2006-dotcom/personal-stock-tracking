'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ChangeEvent, type FocusEvent } from 'react'
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
import { formatCurrency } from '@/lib/format'
import type { EntryStats } from '@/lib/strategy/group'

const numberInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
  z.number().positive('Must be greater than 0'),
)

const optionalNumberInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().positive('Must be greater than 0').optional(),
)

const chargeInput = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
  z.number().min(0),
)

const formSchema = z
  .object({
    entryPrice: numberInput,
    quantity: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
      z.number().int('Whole number only').positive('Must be greater than 0'),
    ),
    stopLoss: numberInput,
    targetPrice: numberInput,
    target2: optionalNumberInput,
    date: z.string().min(1, 'Required'),
    charges: chargeInput,
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.stopLoss >= data.entryPrice) {
      ctx.addIssue({ code: 'custom', path: ['stopLoss'], message: 'Must be below entry price' })
    }
    if (data.targetPrice <= data.entryPrice) {
      ctx.addIssue({ code: 'custom', path: ['targetPrice'], message: 'Must be above entry price' })
    }
    if (data.target2 != null && data.target2 <= data.targetPrice) {
      ctx.addIssue({ code: 'custom', path: ['target2'], message: 'Must be above Target 1' })
    }
  })

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export type EnterPositionDialogProps = {
  entry: EntryStats
  groupId: string
  onClose: () => void
}

function num(value: unknown): number {
  if (value === '' || value === null || value === undefined) return Number.NaN
  const n = Number(value)
  return Number.isFinite(n) ? n : Number.NaN
}

function today(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function EnterPositionDialog({ entry, groupId, onClose }: EnterPositionDialogProps) {
  const queryClient = useQueryClient()
  const router = useRouter()

  const initial: FormValues = {
    // Default to the planned levels, but everything is editable — you rarely fill
    // at exactly the planned price.
    entryPrice: String(entry.entryPrice),
    quantity: String(entry.remainingQuantity || entry.quantity),
    stopLoss: String(entry.stopLoss),
    targetPrice: String(entry.targetPrice),
    target2: entry.target2 != null ? String(entry.target2) : '',
    date: today(),
    charges: 0,
    notes: '',
  }

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  })

  useEffect(() => {
    form.reset(initial)
    // Reset only when the target entry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id])

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
  const rr = risk !== null && reward !== null && risk > 0 ? Math.round((reward / risk) * 100) / 100 : null

  type PriceField = 'stopLoss' | 'targetPrice' | 'target2'

  // SL / TP boxes accept a percentage (e.g. "10%") off the entry price. SL sits
  // below entry; targets sit above. Copied from AddEntryDialog / EditEntryDialog.
  // "$", "^" and "&" sit next to "%" on the keyboard, so any of them is treated
  // as "%" — a fat-fingered "10^" resolves the same as "10%".
  const resolvePriceOrPercent = (field: PriceField, direction: 'up' | 'down', raw: string) => {
    const match = /^(\d*\.?\d+)\s*[%^&$]$/.exec(raw.trim())
    if (!match) return
    const pct = Number(match[1])
    const base = num(form.getValues('entryPrice'))
    if (!Number.isFinite(base) || !Number.isFinite(pct)) return
    const computed = direction === 'down' ? base * (1 - pct / 100) : base * (1 + pct / 100)
    form.setValue(field, String(Math.round(computed * 100) / 100), {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const percentField = (field: PriceField, direction: 'up' | 'down') => {
    const reg = form.register(field)
    const maybeResolve = (value: string) => {
      if (/[%^&$]$/.test(value.trim())) resolvePriceOrPercent(field, direction, value)
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

  const reresolvePriceFields = () => {
    resolvePriceOrPercent('stopLoss', 'down', String(form.getValues('stopLoss') ?? ''))
    resolvePriceOrPercent('targetPrice', 'up', String(form.getValues('targetPrice') ?? ''))
    resolvePriceOrPercent('target2', 'up', String(form.getValues('target2') ?? ''))
  }

  const entryReg = form.register('entryPrice')

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    try {
      const res = await fetch(`/api/strategy/entries/${entry.id}/enter`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryPrice: values.entryPrice,
          quantity: values.quantity,
          stopLoss: values.stopLoss,
          targetPrice: values.targetPrice,
          ...(values.target2 != null ? { target2: values.target2 } : {}),
          date: new Date(values.date).toISOString(),
          charges: values.charges,
          notes: values.notes ?? '',
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
      toast.success('Entered into portfolio — alerts armed')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
        queryClient.invalidateQueries({ queryKey: ['holdings'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ])
      // Portfolio summary cards are server-rendered.
      router.refresh()
      onClose()
    } catch {
      toast.error('Network error')
    }
  }

  const symbol = entry.instrumentSymbol || entry.instrumentToken || 'this stock'

  return (
    <Dialog
      open={true}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enter into portfolio · {symbol}</DialogTitle>
          <DialogDescription>
            Record the trade you actually took. This adds a BUY to your portfolio and
            arms a loud alert for when the stop loss or target hits — so you know to
            execute even if you&apos;re not watching.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enter-price">Entry price (actual)</Label>
              <Input
                id="enter-price"
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
              <Label htmlFor="enter-qty">Quantity</Label>
              <Input
                id="enter-qty"
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
              <Label htmlFor="enter-stop-loss">Stop loss</Label>
              <Input
                id="enter-stop-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                {...percentField('stopLoss', 'down')}
              />
              {form.formState.errors.stopLoss && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.stopLoss.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enter-target-price">Target 1 / TP1</Label>
              <Input
                id="enter-target-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
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
              <Label htmlFor="enter-target-2">
                Target 2 / TP2{' '}
                <span className="text-muted-foreground font-normal">— optional</span>
              </Label>
              <Input
                id="enter-target-2"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                {...percentField('target2', 'up')}
              />
              {form.formState.errors.target2 && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.target2.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enter-date">Date</Label>
              <Input id="enter-date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-destructive text-xs">{form.formState.errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="enter-charges">Charges (₹)</Label>
              <Input
                id="enter-charges"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                {...form.register('charges')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enter-notes">
                Notes <span className="text-muted-foreground font-normal">— optional</span>
              </Label>
              <Input id="enter-notes" type="text" placeholder="Optional" {...form.register('notes')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Capital</div>
              <div className="font-medium">
                {capitalUsed !== null ? formatCurrency(capitalUsed) : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Risk</div>
              <div className="font-medium">{risk !== null ? formatCurrency(risk) : '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Reward</div>
              <div className="font-medium">{reward !== null ? formatCurrency(reward) : '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">R:R</div>
              <div className="font-medium">{rr !== null ? rr.toFixed(2) : '—'}</div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Entering…' : 'Enter into portfolio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
