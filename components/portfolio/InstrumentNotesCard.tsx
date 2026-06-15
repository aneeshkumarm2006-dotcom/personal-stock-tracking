'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

export type InstrumentNotesCardProps = {
  token: string
  instrumentSymbol: string
}

async function fetchNote(token: string): Promise<string> {
  const res = await fetch(`/api/holdings/${encodeURIComponent(token)}/note`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as { note?: string }
  return data.note ?? ''
}

export function InstrumentNotesCard({
  token,
  instrumentSymbol,
}: InstrumentNotesCardProps) {
  const noteQuery = useQuery({
    queryKey: ['instrument-note', token],
    queryFn: () => fetchNote(token),
  })

  // `null` means "untouched" — show the saved note. Once the user types, draft
  // holds their edit. This avoids seeding state from an effect.
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const saved = noteQuery.data ?? ''
  const value = draft ?? saved
  const dirty = draft !== null && draft !== saved

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/holdings/${encodeURIComponent(token)}/note`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: value, instrumentSymbol }),
      })
      if (!res.ok) {
        toast.error(`Failed to save note (${res.status})`)
        return
      }
      // Re-sync with the trimmed value the server persisted, then drop the draft.
      await noteQuery.refetch()
      setDraft(null)
      toast.success('Note saved')
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>
          A free-form note for this stock. Separate from your transactions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {noteQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Textarea
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write anything you want to remember about this stock…"
            className="min-h-32"
          />
        )}
        <div className="flex justify-end gap-2">
          {dirty && !noteQuery.isLoading ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(null)}
              disabled={saving}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={save}
            disabled={saving || noteQuery.isLoading || !dirty}
          >
            {saving ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
