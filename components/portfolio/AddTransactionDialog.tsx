'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/format'
import { InstrumentTypeahead, type InstrumentResult } from './InstrumentTypeahead'

const chargeFieldSchema = z
  .preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().min(0))

const formSchema = z.object({
  instrumentToken: z.string().min(1, 'Pick an instrument'),
  instrumentSymbol: z.string().min(1, 'Pick an instrument'),
  type: z.enum(['BUY', 'SELL']),
  quantity: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
    z.number().int('Whole number only').positive('Must be greater than 0'),
  ),
  price: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
    z.number().positive('Must be greater than 0'),
  ),
  date: z.string().min(1, 'Required'),
  charges: chargeFieldSchema,
  notes: z.string().optional(),
})

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export type TransactionFormInitial = {
  id?: string
  instrumentToken: string
  instrumentSymbol: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  date: string
  charges?: {
    brokerage?: number
    stt?: number
    exchFees?: number
    gst?: number
    stampDuty?: number
    sebiFees?: number
    total?: number
  }
  notes?: string
}

// Collapse a transaction's charges (whether stored as the single `total` or the
// older six-way split) into one number for the single charges input.
function sumInitialCharges(charges?: TransactionFormInitial['charges']): number {
  if (!charges) return 0
  return (
    (charges.brokerage ?? 0) +
    (charges.stt ?? 0) +
    (charges.exchFees ?? 0) +
    (charges.gst ?? 0) +
    (charges.stampDuty ?? 0) +
    (charges.sebiFees ?? 0) +
    (charges.total ?? 0)
  )
}

export type AddTransactionDialogProps = {
  mode?: 'create' | 'edit'
  initial?: TransactionFormInitial
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function today(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function toDateInputValue(value: string | undefined): string {
  if (!value) return today()
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString().slice(0, 10)
}

export function AddTransactionDialog({
  mode = 'create',
  initial,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: AddTransactionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const queryClient = useQueryClient()
  const router = useRouter()

  const defaultValues = useMemo<FormValues>(
    () => ({
      instrumentToken: initial?.instrumentToken ?? '',
      instrumentSymbol: initial?.instrumentSymbol ?? '',
      type: initial?.type ?? 'BUY',
      quantity: initial ? String(initial.quantity) : '',
      price: initial ? String(initial.price) : '',
      date: toDateInputValue(initial?.date),
      charges: sumInitialCharges(initial?.charges),
      notes: initial?.notes ?? '',
    }),
    [initial],
  )

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })

  useEffect(() => {
    if (open) form.reset(defaultValues)
  }, [open, defaultValues, form])

  const selectedInstrument = form.watch('instrumentToken')
    ? { token: form.watch('instrumentToken'), symbol: form.watch('instrumentSymbol') }
    : null

  // Live "new ATP" for a BUY: the charge folds into the per-share cost, so the
  // average traded price becomes price + charges ÷ quantity. (Charges never
  // touch cash — see computeNetInvested.) Only meaningful for buys.
  const watchType = form.watch('type')
  const priceNum = Number(form.watch('price'))
  const qtyNum = Number(form.watch('quantity'))
  const chargesNum = Number(form.watch('charges'))
  const atpPreview =
    watchType === 'BUY' && priceNum > 0 && qtyNum > 0
      ? priceNum + (chargesNum > 0 ? chargesNum / qtyNum : 0)
      : null

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    const payload = {
      instrumentToken: values.instrumentToken,
      instrumentSymbol: values.instrumentSymbol,
      type: values.type,
      quantity: values.quantity,
      price: values.price,
      date: new Date(values.date).toISOString(),
      // Store the whole charge in `total`; zero the legacy six so an edited
      // older transaction collapses cleanly instead of double-counting.
      charges: {
        total: values.charges,
        brokerage: 0,
        stt: 0,
        exchFees: 0,
        gst: 0,
        stampDuty: 0,
        sebiFees: 0,
      },
      notes: values.notes ?? '',
    }

    const url =
      mode === 'edit' && initial?.id
        ? `/api/transactions/${initial.id}`
        : '/api/transactions'
    const method = mode === 'edit' ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      toast.success(mode === 'edit' ? 'Transaction updated' : 'Transaction added')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['holdings'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolioSummary'] }),
      ])
      // Keep any remaining server-rendered bits (e.g. realized-P&L section) fresh.
      router.refresh()
      setOpen(false)
    } catch {
      toast.error('Network error')
    }
  }

  const handleInstrumentChange = (result: InstrumentResult | null) => {
    if (result) {
      form.setValue('instrumentToken', result.token, { shouldValidate: true })
      form.setValue('instrumentSymbol', result.symbol, { shouldValidate: true })
    } else {
      form.setValue('instrumentToken', '', { shouldValidate: true })
      form.setValue('instrumentSymbol', '', { shouldValidate: true })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger as React.ReactElement} />
      ) : mode === 'create' ? (
        <DialogTrigger render={<Button>Add transaction</Button>} />
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
          <DialogDescription>
            Record a BUY or SELL trade. Charges fold into your average buy price
            (ATP) — they are not deducted from your available cash.
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
              <Label htmlFor="tx-type">Type</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(v) => form.setValue('type', v as 'BUY' | 'SELL')}
              >
                <SelectTrigger id="tx-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-destructive text-xs">{form.formState.errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-qty">Quantity</Label>
              <Input
                id="tx-qty"
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
            <div className="space-y-1.5">
              <Label htmlFor="tx-price">Price (₹)</Label>
              <Input
                id="tx-price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                {...form.register('price')}
              />
              {form.formState.errors.price && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.price.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-notes">Notes</Label>
            <Input id="tx-notes" type="text" placeholder="Optional" {...form.register('notes')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-charges">Charges (₹)</Label>
            <Input
              id="tx-charges"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              {...form.register('charges')}
            />
            <p className="text-muted-foreground text-xs">
              Total brokerage &amp; taxes. Folds into your average buy price — not
              taken out of your cash.
            </p>
            {form.formState.errors.charges && (
              <p className="text-destructive text-xs">
                {form.formState.errors.charges.message}
              </p>
            )}
          </div>

          {atpPreview !== null && (
            <div className="bg-muted/40 flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">New average buy price (ATP)</span>
              <span className="font-medium tabular-nums">{formatCurrency(atpPreview)}</span>
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
