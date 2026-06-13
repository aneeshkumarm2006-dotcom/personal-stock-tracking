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

export type ManageCashDialogProps = {
  fundsAdded: number
}

export function ManageCashDialog({ fundsAdded }: ManageCashDialogProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Seed the input with the current figure each time the dialog opens.
  const handleOpenChange = (next: boolean) => {
    if (next) setValue(fundsAdded ? String(fundsAdded) : '')
    setOpen(next)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const num = Number(value)
    if (!Number.isFinite(num) || num < 0) {
      toast.error('Enter a valid amount (0 or more)')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/cash', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundsAdded: num }),
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
      toast.success('Cash updated')
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
            Enter the total funds you&apos;ve added to your trading account.
            Available cash is this minus what you&apos;ve invested, and updates
            automatically as you record buys and sells.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="cash-funds">Total funds added (₹)</Label>
            <Input
              id="cash-funds"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
