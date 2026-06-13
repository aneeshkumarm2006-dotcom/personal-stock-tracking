'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatIstTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type RefreshSuccess = {
  fetched?: number
  evaluated?: number
  durationMs?: number
  skipped?: boolean
  reason?: string
  message?: string
}

export function RefreshButton() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function handleRefresh() {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      if (res.status === 503) {
        toast.error('Rate limited — try again in 60s')
        return
      }

      if (res.status === 401) {
        toast.error('Session expired. Please log in again.')
        return
      }

      if (!res.ok) {
        toast.error(`Refresh failed (${res.status})`)
        return
      }

      const data = (await res.json()) as RefreshSuccess

      if (data.skipped) {
        if (data.reason === 'rate_limited') {
          toast.error('Rate limited — try again in 60s')
          return
        }
        if (data.reason === 'error') {
          toast.error(`Refresh failed: ${data.message ?? 'unknown error'}`)
          return
        }
        toast.message(`Refresh skipped: ${data.reason ?? 'no work to do'}`)
        return
      }

      await queryClient.invalidateQueries()
      // Server-rendered data (summary cards, group lists) reads prices too.
      router.refresh()
      toast.success(`Updated ${formatIstTime(new Date())}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error'
      toast.error(`Refresh failed: ${message}`)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isRefreshing}
      aria-busy={isRefreshing}
      aria-label="Refresh prices"
    >
      <RefreshCwIcon
        className={cn('size-3.5', isRefreshing && 'animate-spin')}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">
        {isRefreshing ? 'Refreshing…' : 'Refresh'}
      </span>
    </Button>
  )
}
