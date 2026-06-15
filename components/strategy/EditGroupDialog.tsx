'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PencilIcon } from 'lucide-react'
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

export type EditGroupDialogProps = {
  groupId: string
  name: string
  allocatedCapital: number
  /** Capital already deployed; allocated capital can't be lowered below this. */
  capitalDeployed: number
}

export function EditGroupDialog({
  groupId,
  name,
  allocatedCapital,
  capitalDeployed,
}: EditGroupDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()

  const form = useForm<FormValues, unknown, ParsedValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name, allocatedCapital: String(allocatedCapital) },
  })

  useEffect(() => {
    if (open) form.reset({ name, allocatedCapital: String(allocatedCapital) })
  }, [open, name, allocatedCapital, form])

  const mutation = useMutation({
    mutationFn: async (values: ParsedValues) => {
      const res = await fetch(`/api/strategy/groups/${groupId}`, {
        method: 'PATCH',
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
        throw new Error(message)
      }
    },
    onSuccess: async () => {
      toast.success('Strategy group updated')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['strategyGroup', groupId] }),
        queryClient.invalidateQueries({ queryKey: ['strategyGroups'] }),
      ])
      router.refresh()
      setOpen(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const onSubmit: SubmitHandler<ParsedValues> = (values) => {
    if (values.allocatedCapital < capitalDeployed) {
      form.setError('allocatedCapital', {
        message: `Can't be below deployed capital (₹${capitalDeployed.toLocaleString('en-IN')})`,
      })
      return
    }
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="icon" variant="outline" aria-label="Edit strategy group">
            <PencilIcon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit strategy group</DialogTitle>
          <DialogDescription>
            Update the name or adjust the total allocated capital for this group.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-group-name">Name</Label>
            <Input id="edit-group-name" type="text" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-destructive text-xs">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-group-capital">Allocated capital (₹)</Label>
            <Input
              id="edit-group-capital"
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
