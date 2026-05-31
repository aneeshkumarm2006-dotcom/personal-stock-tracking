export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401; reason: string }

const VERCEL_CRON_HEADER = 'x-vercel-cron'

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export function verifyCronRequest(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return { ok: false, status: 401, reason: 'CRON_SECRET not configured' }
  }

  const header = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) {
    return { ok: false, status: 401, reason: 'Missing bearer token' }
  }
  const token = header.slice(prefix.length).trim()
  if (!constantTimeEquals(token, expected)) {
    return { ok: false, status: 401, reason: 'Invalid bearer token' }
  }

  // Additional guard: Vercel cron jobs set this header. Allow override via env
  // for local testing or alternative schedulers.
  const requireVercelHeader = process.env.CRON_REQUIRE_VERCEL_HEADER !== '0'
  if (requireVercelHeader && !request.headers.get(VERCEL_CRON_HEADER)) {
    return { ok: false, status: 401, reason: 'Missing x-vercel-cron header' }
  }

  return { ok: true }
}
