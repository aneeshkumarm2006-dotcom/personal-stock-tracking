// Low-level HTTP client for indianapi.in (the Indian Stock Market API).
//
// Server-only: it reads INDIANAPI_KEY and must never be imported into a client
// component. Auth is a single `X-Api-Key` header. The free tier is rate-limited,
// so callers should cache aggressively (see lib/indianapi/fundamentals.ts).

const BASE_URL = 'https://stock.indianapi.in'

export class IndianApiError extends Error {
  readonly status: number
  override readonly cause?: unknown
  constructor(message: string, status: number, cause?: unknown) {
    super(message)
    this.name = 'IndianApiError'
    this.status = status
    if (cause !== undefined) this.cause = cause
  }
}

// The key is missing/invalid or the plan is out of quota in a way the provider
// signals as auth (401/403).
export class IndianApiAuthError extends IndianApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 401, cause)
    this.name = 'IndianApiAuthError'
  }
}

// 429 — too many requests for the current plan.
export class IndianApiRateLimitError extends IndianApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 429, cause)
    this.name = 'IndianApiRateLimitError'
  }
}

function apiKey(): string {
  const key = process.env.INDIANAPI_KEY?.trim()
  if (!key) {
    throw new IndianApiError('INDIANAPI_KEY is not configured', 500)
  }
  return key
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type IndianApiGetOptions = {
  // Total attempts = retries + 1. Retries cover transient network/5xx/429.
  retries?: number
  timeoutMs?: number
}

// GET a JSON endpoint. Resolves with the parsed body (including the provider's
// `{ "error": "..." }` shape on a logical miss — callers decide what counts as
// "not found"). Throws IndianApiAuthError / IndianApiRateLimitError /
// IndianApiError for transport- and auth-level failures.
export async function indianApiGet<T>(
  path: string,
  params: Record<string, string>,
  opts: IndianApiGetOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2
  const timeoutMs = opts.timeoutMs ?? 15_000

  const url = new URL(path, BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-Api-Key': apiKey(), Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timer)

      if (res.status === 401 || res.status === 403) {
        // Auth problems never get better on retry.
        throw new IndianApiAuthError(
          `indianapi.in auth failed (${res.status}) — check INDIANAPI_KEY`,
        )
      }
      if (res.status === 429) {
        if (attempt < retries) {
          await delay(800 * (attempt + 1))
          continue
        }
        throw new IndianApiRateLimitError('indianapi.in rate limit reached (429)')
      }
      if (!res.ok) {
        // 5xx is worth a retry; 4xx (other than the above) is not.
        if (res.status >= 500 && attempt < retries) {
          await delay(500 * (attempt + 1))
          continue
        }
        throw new IndianApiError(`indianapi.in HTTP ${res.status}`, res.status)
      }

      return (await res.json()) as T
    } catch (err) {
      clearTimeout(timer)
      lastError = err
      // Surface deterministic failures immediately.
      if (err instanceof IndianApiAuthError || err instanceof IndianApiRateLimitError) {
        throw err
      }
      if (err instanceof IndianApiError && err.status < 500) {
        throw err
      }
      // Transient (timeout/abort/network/5xx) → back off and retry.
      if (attempt < retries) {
        await delay(500 * (attempt + 1))
        continue
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'indianapi.in request failed'
  throw new IndianApiError(message, 502, lastError)
}
