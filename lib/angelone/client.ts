// @ts-expect-error - smartapi-javascript ships without TypeScript declarations.
import { SmartAPI } from 'smartapi-javascript'

import { AuthError, RateLimitError, classifyAngelError } from './errors'

export type SmartApiResponse<T = unknown> = {
  status: boolean
  message?: string
  errorCode?: string
  data?: T
}

export type SmartApiClient = {
  setAccessToken: (token: string) => void
  setPublicToken: (token: string) => void
  setClientCode: (code: string) => void
  generateSession: (
    clientCode: string,
    password: string,
    totp: string,
  ) => Promise<SmartApiResponse<{ jwtToken: string; refreshToken: string; feedToken: string }>>
  generateToken: (
    refreshToken: string,
  ) => Promise<SmartApiResponse<{ jwtToken: string; refreshToken: string; feedToken: string }>>
  marketData: (params: {
    mode: 'FULL' | 'LTP' | 'OHLC'
    exchangeTokens: Record<string, string[]>
  }) => Promise<SmartApiResponse<unknown>>
  getCandleData: (params: {
    exchange: string
    symboltoken: string
    interval: string
    fromdate: string
    todate: string
  }) => Promise<SmartApiResponse<Array<Array<string | number>>>>
}

let cached: SmartApiClient | null = null

export function getSmartApi(): SmartApiClient {
  if (cached) return cached

  const apiKey = process.env.ANGEL_API_KEY
  if (!apiKey) {
    throw new Error('getSmartApi: ANGEL_API_KEY is not set. Add it to .env.local.')
  }

  cached = new SmartAPI({ api_key: apiKey }) as SmartApiClient
  return cached
}

export function resetSmartApi(): void {
  cached = null
}

type LogStatus = 'success' | 'rate-limited' | 'auth-failed' | 'error' | 'retry'

function logCall(event: string, status: LogStatus, ms: number, extra?: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      status,
      ms,
      ...(extra ?? {}),
    }),
  )
}

function statusFromError(err: unknown): LogStatus {
  if (err instanceof RateLimitError) return 'rate-limited'
  if (err instanceof AuthError) return 'auth-failed'
  return 'error'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type WithRetryOptions = {
  maxAttempts?: number
  event?: string
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  optsOrMax: WithRetryOptions | number = {},
): Promise<T> {
  const opts: WithRetryOptions =
    typeof optsOrMax === 'number' ? { maxAttempts: optsOrMax } : optsOrMax
  const maxAttempts = opts.maxAttempts ?? 3
  const event = opts.event ?? 'angelone.request'

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now()
    try {
      const result = await fn()
      logCall(event, 'success', Date.now() - startedAt, { attempt })
      return result
    } catch (raw) {
      const err = classifyAngelError(raw)
      const ms = Date.now() - startedAt
      lastError = err

      if (err instanceof AuthError) {
        logCall(event, 'auth-failed', ms, { attempt })
        throw err
      }

      if (attempt === maxAttempts) {
        logCall(event, statusFromError(err), ms, { attempt, final: true })
        throw err
      }

      if (err instanceof RateLimitError) {
        const backoff = Math.pow(2, attempt) * 500
        logCall(event, 'rate-limited', ms, { attempt, backoffMs: backoff })
        await sleep(backoff)
        continue
      }

      const backoff = Math.pow(2, attempt) * 500
      logCall(event, 'retry', ms, { attempt, backoffMs: backoff })
      await sleep(backoff)
    }
  }

  throw lastError ?? new Error('withRetry: exhausted attempts')
}
