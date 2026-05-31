'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, formatIstDate } from '@/lib/format'
import { AddTransactionDialog, type TransactionFormInitial } from './AddTransactionDialog'

type ApiCharges = {
  brokerage?: number
  stt?: number
  exchFees?: number
  gst?: number
  stampDuty?: number
  sebiFees?: number
}

type ApiTransaction = {
  _id: string
  instrumentToken: string
  instrumentSymbol?: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  date: string
  charges?: ApiCharges
  totalCharges?: number
  notes?: string
}

async function fetchTransactions(): Promise<ApiTransaction[]> {
  const res = await fetch('/api/transactions', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as ApiTransaction[]
  return Array.isArray(data) ? data : []
}

function totalCharges(charges?: ApiCharges): number {
  if (!charges) return 0
  return (
    (charges.brokerage ?? 0) +
    (charges.stt ?? 0) +
    (charges.exchFees ?? 0) +
    (charges.gst ?? 0) +
    (charges.stampDuty ?? 0) +
    (charges.sebiFees ?? 0)
  )
}

export function TransactionHistoryTable() {
  const queryClient = useQueryClient()
  const [symbolFilter, setSymbolFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editing, setEditing] = useState<TransactionFormInitial | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/transactions/${id}`, {
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
    onSuccess: async () => {
      toast.success('Transaction deleted')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['holdings'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] }),
      ])
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const rows = useMemo(() => {
    const all = query.data ?? []
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null
    const symbolNeedle = symbolFilter.trim().toUpperCase()

    return all.filter((tx) => {
      const ts = new Date(tx.date).getTime()
      if (fromTs !== null && ts < fromTs) return false
      if (toTs !== null && ts > toTs) return false
      if (symbolNeedle && !(tx.instrumentSymbol ?? '').toUpperCase().includes(symbolNeedle)) {
        return false
      }
      return true
    })
  }, [query.data, symbolFilter, dateFrom, dateTo])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input
          placeholder="Filter by symbol"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
        />
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
        />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
        <p className="text-destructive text-sm">Unable to load transactions.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No transactions match the filters.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx._id}>
                  <TableCell>{formatIstDate(tx.date)}</TableCell>
                  <TableCell className="font-medium">{tx.instrumentSymbol ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === 'BUY' ? 'default' : 'secondary'}>
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatInt(tx.quantity)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(tx.price)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(tx.totalCharges ?? totalCharges(tx.charges))}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {tx.notes || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: tx._id,
                            instrumentToken: tx.instrumentToken,
                            instrumentSymbol: tx.instrumentSymbol ?? '',
                            type: tx.type,
                            quantity: tx.quantity,
                            price: tx.price,
                            date: tx.date,
                            charges: tx.charges,
                            notes: tx.notes,
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => setConfirmDeleteId(tx._id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <AddTransactionDialog
          mode="edit"
          initial={editing}
          open={true}
          onOpenChange={(next) => {
            if (!next) setEditing(null)
          }}
        />
      )}

      {confirmDeleteId && (
        <DeleteConfirmDialog
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            const id = confirmDeleteId
            setConfirmDeleteId(null)
            await deleteMutation.mutateAsync(id)
          }}
        />
      )}
    </div>
  )
}

function DeleteConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-popover text-popover-foreground w-full max-w-sm space-y-4 rounded-xl p-4 ring-1 ring-foreground/10">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-medium">Delete transaction?</h2>
          <p className="text-muted-foreground text-sm">
            This permanently removes the entry. Realized P&L will recompute.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
