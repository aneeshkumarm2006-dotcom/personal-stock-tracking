'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/empty-state'
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
  total?: number
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

function totalCharges(charges?: ApiCharges): number {
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

async function fetchTransactions(token: string): Promise<ApiTransaction[]> {
  const res = await fetch(
    `/api/transactions?instrumentToken=${encodeURIComponent(token)}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`Failed (${res.status})`)
  const data = (await res.json()) as ApiTransaction[]
  return Array.isArray(data) ? data : []
}

export type InstrumentTransactionsCardProps = {
  token: string
  instrumentSymbol: string
}

export function InstrumentTransactionsCard({
  token,
  instrumentSymbol,
}: InstrumentTransactionsCardProps) {
  const [editing, setEditing] = useState<TransactionFormInitial | null>(null)

  const query = useQuery({
    queryKey: ['transactions', token],
    queryFn: () => fetchTransactions(token),
  })

  const rows = query.data ?? []

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            Your trades in {instrumentSymbol}. Add brokerage &amp; taxes to a trade
            later — they fold into your average buy price.
          </CardDescription>
        </div>
        <AddTransactionDialog
          initial={{
            instrumentToken: token,
            instrumentSymbol,
            type: 'BUY',
            quantity: 0,
            price: 0,
            date: new Date().toISOString(),
          }}
          trigger={
            <Button size="sm" variant="outline">
              Add transaction
            </Button>
          }
        />
      </CardHeader>

      <div className="px-6 pb-6">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : query.isError ? (
          <ErrorState message="Unable to load transactions." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Nothing has been recorded for this instrument."
          />
        ) : (
          <div className="bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => {
                  const charges = tx.totalCharges ?? totalCharges(tx.charges)
                  return (
                    <TableRow key={tx._id}>
                      <TableCell>{formatIstDate(tx.date)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            tx.type === 'BUY'
                              ? 'bg-gain/10 text-gain border-transparent'
                              : 'bg-loss/10 text-loss border-transparent'
                          }
                        >
                          {tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatInt(tx.quantity)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tx.price)}</TableCell>
                      <TableCell className="text-right">
                        {charges > 0 ? (
                          formatCurrency(charges)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            setEditing({
                              id: tx._id,
                              instrumentToken: tx.instrumentToken,
                              instrumentSymbol: tx.instrumentSymbol ?? instrumentSymbol,
                              type: tx.type,
                              quantity: tx.quantity,
                              price: tx.price,
                              date: tx.date,
                              charges: tx.charges,
                              notes: tx.notes,
                            })
                          }
                        >
                          {charges > 0 ? 'Edit' : 'Add charges'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
    </Card>
  )
}
