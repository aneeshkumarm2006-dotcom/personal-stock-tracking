export const SESSION_COOKIE_NAME = 'pst_session'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const TOKEN_VERSION = 'v1'

export interface SessionPayload {
  exp: number
}

function getSecret(): string {
  const secret = process.env.APP_AUTH_SECRET
  if (!secret) {
    throw new Error('APP_AUTH_SECRET is not configured')
  }
  return secret
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const normalized = padded + '='.repeat(padLength)
  if (typeof atob === 'function') {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  return Uint8Array.from(Buffer.from(normalized, 'base64'))
}

function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    stringToBytes(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function sign(payloadB64: string): Promise<string> {
  const key = await importKey(getSecret())
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    stringToBytes(payloadB64) as BufferSource,
  )
  return bytesToBase64Url(new Uint8Array(signature))
}

function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return mismatch === 0
}

export async function createSessionToken(
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = bytesToBase64Url(stringToBytes(payloadJson))
  const signature = await sign(`${TOKEN_VERSION}.${payloadB64}`)
  return `${TOKEN_VERSION}.${payloadB64}.${signature}`
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [version, payloadB64, signatureB64] = parts as [string, string, string]
  if (version !== TOKEN_VERSION) return false

  let expectedSignature: string
  try {
    expectedSignature = await sign(`${version}.${payloadB64}`)
  } catch {
    return false
  }

  const provided = base64UrlToBytes(signatureB64)
  const expected = base64UrlToBytes(expectedSignature)
  if (!constantTimeEquals(provided, expected)) return false

  let payload: SessionPayload
  try {
    payload = JSON.parse(bytesToString(base64UrlToBytes(payloadB64)))
  } catch {
    return false
  }

  if (typeof payload.exp !== 'number') return false
  return payload.exp > Math.floor(Date.now() / 1000)
}

export function buildSessionCookie(
  token: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): string {
  const isProd = process.env.NODE_ENV === 'production'
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

export function buildSessionClearCookie(): string {
  const isProd = process.env.NODE_ENV === 'production'
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ]
  if (isProd) attrs.push('Secure')
  return attrs.join('; ')
}

export function constantTimeEqualsString(a: string, b: string): boolean {
  return constantTimeEquals(stringToBytes(a), stringToBytes(b))
}
