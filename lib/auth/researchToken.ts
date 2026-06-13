export type ResearchAuthResult =
  | { ok: true }
  | { ok: false; status: 401; reason: string }

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// Auth for the external research agent (e.g. a scheduled Claude Code agent).
// Unlike verifyCronRequest, this does NOT require the x-vercel-cron header,
// because the caller is an arbitrary HTTPS client holding a shared secret.
export function verifyResearchRequest(request: Request): ResearchAuthResult {
  const expected = process.env.RESEARCH_API_TOKEN
  if (!expected) {
    return { ok: false, status: 401, reason: 'RESEARCH_API_TOKEN not configured' }
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

  return { ok: true }
}
