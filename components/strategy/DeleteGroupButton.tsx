'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DeleteGroupButtonProps = {
  groupId: string
  groupName: string
}

export function DeleteGroupButton({ groupId, groupName }: DeleteGroupButtonProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/strategy/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        let message = `Delete failed (${res.status})`
        try {
          const data = (await res.json()) as { error?: string }
          if (data?.error) message = data.error
        } catch {}
        throw new Error(message)
      }
    },
    onSuccess: () => {
      setConfirmOpen(false)
      toast.success('Strategy group deleted')
      // The history page is server-rendered; refresh so this card leaves it.
      router.refresh()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive gap-1.5"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2Icon className="size-3.5" aria-hidden="true" />
        Delete
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!deleteMutation.isPending) setConfirmOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete strategy group?</DialogTitle>
            <DialogDescription>
              This permanently removes “{groupName}” and all of its entries and event
              history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
