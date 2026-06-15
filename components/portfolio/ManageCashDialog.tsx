'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/format'

export type ManageCashDialogProps = {
  fundsAdded: number
}

type Mode = 'add' | 'set'

export function ManageCashDialog({ fundsAdded }: ManageCashDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('add')
  const [addValue, setAddValue] = useState('')
  const [setValue, setSetValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Reset the form each time the dialog opens: empty top-up, current total
  // pre-filled for the "set total" tab.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setMode('add')
      setAddValue('')
      setSetValue(fundsAdded ? String(fundsAdded) : '')
    }
    setOpen(next)
  }

  const addAmount = Number(addValue)
  const addPreview =
    addValue.trim() !== '' && Number.isFinite(addAmount) && addAmount > 0
      ? fundsAdded + addAmount
      : null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isAdd = mode === 'add'
    const num = Number(isAdd ? addValue : setValue)

    if (isAdd) {
      if (!Number.isFinite(num) || num <= 0) {
        toast.error('Enter an amount greater than zero')
        return
      }
    } else if (!Number.isFinite(num) || num < 0) {
      toast.error('Enter a valid amount (0 or more)')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/cash', {
        method: isAdd ? 'PATCH' : 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAdd ? { amount: num } : { fundsAdded: num }),
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
      toast.success(isAdd ? `Added ${formatCurrency(num)}` : 'Cash updated')
      await queryClient.invalidateQueries({ queryKey: ['cash'] })
      router.refresh()
      setOpen(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Manage cash
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage cash</DialogTitle>
          <DialogDescription>
            Available cash is your funds added minus what you&apos;ve invested,
            and updates automatically as you record buys and sells.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="add">Add funds</TabsTrigger>
            <TabsTrigger value="set">Set total</TabsTrigger>
          </TabsList>

          <form className="mt-4 space-y-4" onSubmit={onSubmit}>
            <TabsContent value="add" className="space-y-1.5">
              <Label htmlFor="cash-add">Amount to add (₹)</Label>
              <Input
                id="cash-add"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {addPreview !== null ? (
                  <>
                    New total: {formatCurrency(fundsAdded)} +{' '}
                    {formatCurrency(addAmount)} ={' '}
                    <span className="text-foreground font-medium">
                      {formatCurrency(addPreview)}
                    </span>
                  </>
                ) : (
                  <>Current funds added: {formatCurrency(fundsAdded)}</>
                )}
              </p>
            </TabsContent>

            <TabsContent value="set" className="space-y-1.5">
              <Label htmlFor="cash-funds">Total funds added (₹)</Label>
              <Input
                id="cash-funds"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={setValue}
                onChange={(e) => setSetValue(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Overwrites the running total with this figure.
              </p>
            </TabsContent>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? 'Saving…'
                  : mode === 'add'
                    ? 'Add funds'
                    : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
