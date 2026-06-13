'use client'

import { useRouter } from 'next/navigation'
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

const formSchema = z.object({
  name: z.string().min(1, 'Required'),
  allocatedCapital: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? Number.NaN : Number(v)),
    z.number().positive('Must be greater than 0'),
  ),
})

type FormValues = z.input<typeof formSchema>
type ParsedValues = z.output<typeof formSchema>

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', allocatedCapital: '' },
  })

  useEffect(() => {
    if (open) form.reset({ name: '', allocatedCapital: '' })
  }, [open, form])

  const onSubmit: SubmitHandler<ParsedValues> = async (values) => {
    try {
      const res = await fetch('/api/strategy/groups', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          allocatedCapital: values.allocatedCapital,
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
      toast.success('Strategy group created')
      await queryClient.invalidateQueries({ queryKey: ['strategyGroups'] })
      // The group list is server-rendered; refresh it so the new group appears.
      router.refresh()
      setOpen(false)
    } catch {
      toast.error('Network error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Create group</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create strategy group</DialogTitle>
          <DialogDescription>
            Group a set of trade ideas together with a shared capital budget.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              type="text"
              placeholder="e.g. Breakout swing - Q3"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <p className="text-destructive text-xs">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-capital">Allocated capital (₹)</Label>
            <Input
              id="group-capital"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              {...form.register('allocatedCapital')}
            />
            {form.formState.errors.allocatedCapital && (
              <p className="text-destructive text-xs">
                {form.formState.errors.allocatedCapital.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
