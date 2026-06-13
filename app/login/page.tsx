'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [passphrase, setPassphrase] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Only follow same-origin paths; an absolute or scheme-relative URL here
  // would be an open redirect.
  const rawRedirect = searchParams.get('redirect')
  const redirectTo =
    rawRedirect && /^\/(?![/\\])/.test(rawRedirect) ? rawRedirect : '/portfolio'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      })

      if (response.ok) {
        router.replace(redirectTo)
        router.refresh()
        return
      }

      let message = 'Invalid passphrase'
      try {
        const data = (await response.json()) as { error?: string }
        if (data?.error) message = data.error
      } catch {
      }
      toast.error(message)
    } catch {
      toast.error('Unable to reach login service')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <TrendingUp className="size-5" aria-hidden="true" />
        </span>
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Stock Tracker
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your passphrase to continue.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                required
                autoFocus
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !passphrase}
              className="w-full"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
