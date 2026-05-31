'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatIstTime } from '@/lib/format'

type RefreshSuccess = {
  fetched?: number
  evaluated?: number
  durationMs?: number
  skipped?: boolean
  reason?: string
}

export function RefreshButton() {
  const queryClient = useQueryClient()
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
        toast.message(`Refresh skipped: ${data.reason ?? 'no work to do'}`)
        return
      }

      await queryClient.invalidateQueries()
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
    >
      {isRefreshing ? (
        <>
          <Spinner />
          Refreshing…
        </>
      ) : (
        'Refresh Prices'
      )}
    </Button>
  )
}

function Spinner() {
  return (
    <svg
      className="size-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
