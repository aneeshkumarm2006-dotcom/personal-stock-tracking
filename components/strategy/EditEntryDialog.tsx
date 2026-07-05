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
import { formatCurrency } from '@/lib/format'
import {
  InstrumentTypeahead,
  type InstrumentResult,
} from '@/components/portfolio/InstrumentTypeahead'
import type { EntryStats } from '@/lib/strategy/group'

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
    // Optional: an entry can still be unassigned here, and this is where the
    // stock gets added later. Leaving it blank keeps it unassigned.
    instrumentToken: z.string().default(''),
    instrumentSymbol: z.string().default(''),
    entryPrice: numberInput,
    stopLoss: numberInput,
    targetPrice: numberInput,
    target2: optionalNumberInput,
    quantity: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
      z.number().int('Whole number only').positive('Must be greater than 0'),
    ),
    triggerType: z.enum(['auto', 'limit', 'stop', 'active']).default('auto'),
  })
  .superRefine((data, ctx) => {
    // "Already entered" means the position is held now — that needs a stock.
    if (data.triggerType === 'active' && !data.instrumentToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['instrumentToken'],
        message: 'Pick a stock to mark this as already held',
      })
    }
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

export type EditEntryDialogProps = {
  entry: EntryStats
  groupId: string
  // Free capital in the group, NOT counting this entry's own deployment — it is
  // released when the entry is re-edited, so it's available to re-allocate.
  capitalAvailable: number
  onClose: () => void
}

function num(value: unknown): number {
  if (value === '' || value === null || value === undefined) return Number.NaN
  const n = Number(value)
  return Number.isFinite(n) ? n : Number.NaN
}

export function EditEntryDialog({
  entry,
  groupId,
  capitalAvailable,
  onClose,
}: EditEntryDialogProps) {
  const queryClient = useQueryClient()

  const initial: FormValues = {
    instrumentToken: entry.instrumentToken ?? '',
    instrumentSymbol: entry.instrumentSymbol ?? '',
    entryPrice: String(entry.entryPrice),
    stopLoss: String(entry.stopLoss),
    targetPrice: String(entry.targetPrice),
    target2: entry.target2 != null ? String(entry.target2) : '',
    quantity: String(entry.quantity),
    triggerType: entry.triggerType ?? 'auto',
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

  const [currentPrice, setCurrentPrice] = useState<number | null>(entry.currentPrice)

  const watched = form.watch()
  const entryPrice = num(watched.entryPrice)
  const stopLoss = num(watched.stopLoss)
  const targetPrice = num(watched.targetPrice)
  const target2 = num(watched.target2)
  const quantity = num(watched.quantity)
  const triggerChoice = watched.triggerType ?? 'auto'
  // The position is already held: it's recorded as open immediately, so the
  // fill-direction preview and immediate-trigger guard don't apply.
  const alreadyEntered = triggerChoice === 'active'
  const instrumentToken = watched.instrumentToken ?? ''

  const selectedInstrument = instrumentToken
    ? { token: instrumentToken, symbol: watched.instrumentSymbol ?? '' }
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

  // Refresh the live price for the currently-selected instrument so the
  // fill-side preview and the would-trigger-now guard mirror the server. When
  // the entry is still unassigned there is no price to show.
  useEffect(() => {
    if (!instrumentToken) {
      setCurrentPrice(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/prices?tokens=${encodeURIComponent(instrumentToken)}`,
          { credentials: 'include' },
        )
        if (!res.ok) return
        const rows = (await res.json()) as { ltp?: number }[]
        const ltp = rows[0]?.ltp
        if (!cancelled) {
          setCurrentPrice(typeof ltp === 'number' ? ltp : null)
        }
      } catch {
        /* keep the snapshot price we started with */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [instrumentToken])

  // Mirrors resolveTriggerType on the server.
  const resolvedTrigger: 'limit' | 'stop' =
    triggerChoice === 'limit' || triggerChoice === 'stop'
      ? triggerChoice
      : currentPrice !== null && Number.isFinite(entryPrice)
        ? entryPrice >= currentPrice
          ? 'stop'
          : 'limit'
        : 'limit'

  // Warn when the edited entry would fill the instant it is saved (mirrors the
  // server guard) so the user can fix it before the request is rejected. An
  // already-held entry is recorded as open on purpose, so the guard is skipped.
  const wouldTriggerNow =
    !alreadyEntered && currentPrice !== null && Number.isFinite(entryPrice)
      ? resolvedTrigger === 'stop'
        ? currentPrice >= entryPrice
        : currentPrice <= entryPrice
      : false

  const hasTarget2 = Number.isFinite(target2)
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

  const overAllocated = capitalUsed !== null && capitalUsed > capitalAvailable

  type PriceField = 'stopLoss' | 'targetPrice' | 'target2'

  // Lets the SL / TP1 / TP2 boxes accept a percentage (e.g. "10%") off the entry
  // price instead of a rupee price. SL sits below entry; targets sit above.
  // "$", "^" and "&" sit next to "%" on the keyboard, so any of them is treated
  // as "%" — a fat-fingered "10^" resolves the same as "10%".
  const resolvePriceOrPercent = (
    field: PriceField,
    direction: 'up' | 'down',
    raw: string,
  ) => {
    const match = /^(\d*\.?\d+)\s*[%^&$]$/.exec(raw.trim())
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
    if (values.entryPrice * values.quantity > capitalAvailable) {
      toast.error('Insufficient capital in group')
      return
    }
    try {
      const res = await fetch(`/api/strategy/entries/${entry.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Sent so a still-unassigned entry can get its stock here, or an
          // existing one can be changed before it fills.
          instrumentToken: values.instrumentToken ?? '',
          instrumentSymbol: values.instrumentSymbol ?? '',
          entryPrice: values.entryPrice,
          stopLoss: values.stopLoss,
          targetPrice: values.targetPrice,
          target2: values.target2 ?? null,
          quantity: values.quantity,
          triggerType: values.triggerType ?? 'auto',
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
      toast.success('Entry updated')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      onClose()
    } catch {
      toast.error('Network error')
    }
  }

  const symbol = entry.instrumentSymbol || entry.instrumentToken || 'Unassigned'

  return (
    <Dialog
      open={true}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit entry · {symbol}</DialogTitle>
          <DialogDescription>
            Assign or change the stock, and adjust the entry, stop loss, targets,
            or quantity before this idea fills. Only pending entries (not yet
            triggered) can be edited.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label>
              Instrument{' '}
              <span className="text-muted-foreground font-normal">— optional</span>
            </Label>
            <InstrumentTypeahead
              value={selectedInstrument}
              onChange={handleInstrumentChange}
            />
            {form.formState.errors.instrumentToken ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.instrumentToken.message}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {selectedInstrument
                  ? 'Once a stock is set, this entry is tracked against its live price.'
                  : 'No stock yet — add one to start tracking this entry against live prices.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-entry-price">Entry price</Label>
              <Input
                id="edit-entry-price"
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
              <Label htmlFor="edit-entry-qty">Quantity</Label>
              <Input
                id="edit-entry-qty"
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
              <Label htmlFor="edit-stop-loss">Stop loss</Label>
              <Input
                id="edit-stop-loss"
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
              <Label htmlFor="edit-target-price">Target 1 / TP1</Label>
              <Input
                id="edit-target-price"
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
              <Label htmlFor="edit-target-2">
                Target 2 / TP2{' '}
                <span className="text-muted-foreground font-normal">— optional</span>
              </Label>
              <Input
                id="edit-target-2"
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-trigger-type">Fill when</Label>
            <Select
              value={triggerChoice}
              onValueChange={(v) =>
                form.setValue('triggerType', (v ?? 'auto') as FormValues['triggerType'], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="edit-trigger-type" aria-label="Fill when">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (decide from current price)</SelectItem>
                <SelectItem value="stop">Breakout — price rises to entry</SelectItem>
                <SelectItem value="limit">Dip — price falls to entry</SelectItem>
                <SelectItem value="active">Already entered — I hold this now</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {alreadyEntered ? (
                <>
                  Recorded as already open at{' '}
                  {Number.isFinite(entryPrice) ? formatCurrency(entryPrice) : '—'}. It
                  starts active and is tracked for target and stop from now.
                </>
              ) : currentPrice !== null ? (
                <>
                  Current price {formatCurrency(currentPrice)}.{' '}
                  {Number.isFinite(entryPrice) && (
                    <>
                      This fills when price{' '}
                      {resolvedTrigger === 'stop' ? 'rises to' : 'falls to'}{' '}
                      {formatCurrency(entryPrice)}.
                    </>
                  )}
                </>
              ) : (
                'Current price unavailable — pick Breakout or Dip if Auto guesses wrong.'
              )}
            </p>
          </div>

          {wouldTriggerNow && (
            <p className="text-destructive text-xs">
              This entry would fill immediately at the current price. Adjust the
              entry price or change “Fill when”.
            </p>
          )}

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
              Capital used exceeds available capital ({formatCurrency(capitalAvailable)}).
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || overAllocated || wouldTriggerNow}
            >
              {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
