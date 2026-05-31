export class AuthError extends Error {
  override readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'AuthError'
    if (cause !== undefined) this.cause = cause
  }
}

export class RateLimitError extends Error {
  override readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'RateLimitError'
    if (cause !== undefined) this.cause = cause
  }
}

export class NetworkError extends Error {
  override readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
    if (cause !== undefined) this.cause = cause
  }
}

const RATE_LIMIT_ERROR_CODES = new Set(['AB1004'])
const AUTH_ERROR_CODES = new Set(['AG8001', 'AG8002', 'AG8003', 'AB8050', 'AB8051', 'AB1010'])

type ErrorLike = {
  status?: number
  statusCode?: number
  errorCode?: string
  message?: string
}

export function classifyAngelError(raw: unknown): Error {
  if (raw instanceof AuthError || raw instanceof RateLimitError || raw instanceof NetworkError) {
    return raw
  }

  const err = (raw ?? {}) as ErrorLike
  const status = err.status ?? err.statusCode
  const code = err.errorCode
  const msg = err.message || 'Angel One request failed'

  if (status === 429 || (code && RATE_LIMIT_ERROR_CODES.has(code))) {
    return new RateLimitError(msg, raw)
  }
  if (status === 401 || status === 403 || (code && AUTH_ERROR_CODES.has(code))) {
    return new AuthError(msg, raw)
  }
  return new NetworkError(msg, raw)
}
