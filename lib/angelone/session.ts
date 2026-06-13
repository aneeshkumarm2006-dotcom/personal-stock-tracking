import { generateSync as generateTotp } from 'otplib'

import { connectDB } from '@/lib/db/connect'
import {
  ANGEL_SESSION_SINGLETON_ID,
  AngelSession,
  type AngelSessionDoc,
} from '@/lib/db/models/AngelSession'

import { getSmartApi, type SmartApiResponse } from './client'
import { AuthError, classifyAngelError } from './errors'

const SESSION_MAX_AGE_MS = 23 * 60 * 60 * 1000

export type AngelTokens = {
  jwtToken: string
  refreshToken: string
  feedToken: string
}

export type ValidAngelSession = {
  jwtToken: string
  feedToken: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new AuthError(`${name} is not set in the environment.`)
  }
  return value
}

export async function loadSession(): Promise<AngelSessionDoc | null> {
  await connectDB()
  const doc = await AngelSession.findById(ANGEL_SESSION_SINGLETON_ID).lean<AngelSessionDoc>()
  return doc ?? null
}

export async function invalidateSession(): Promise<void> {
  await connectDB()
  await AngelSession.deleteOne({ _id: ANGEL_SESSION_SINGLETON_ID })
}

export async function saveSession(data: AngelTokens): Promise<void> {
  await connectDB()
  await AngelSession.findByIdAndUpdate(
    ANGEL_SESSION_SINGLETON_ID,
    {
      _id: ANGEL_SESSION_SINGLETON_ID,
      jwtToken: data.jwtToken,
      refreshToken: data.refreshToken,
      feedToken: data.feedToken,
      issuedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

function isFresh(issuedAt: Date | null | undefined): boolean {
  if (!issuedAt) return false
  return Date.now() - new Date(issuedAt).getTime() < SESSION_MAX_AGE_MS
}

function applyTokensToClient(tokens: AngelTokens): void {
  const client = getSmartApi()
  client.setAccessToken(tokens.jwtToken)
  client.setPublicToken(tokens.refreshToken)
}

function extractTokens(
  response: SmartApiResponse<{ jwtToken?: string; refreshToken?: string; feedToken?: string }>,
): AngelTokens {
  if (!response?.status || !response.data) {
    throw new AuthError(response?.message || 'Angel One auth response missing tokens', response)
  }
  const { jwtToken, refreshToken, feedToken } = response.data
  if (!jwtToken || !refreshToken || !feedToken) {
    throw new AuthError('Angel One auth response missing one or more tokens', response)
  }
  return { jwtToken, refreshToken, feedToken }
}

async function refreshWith(refreshToken: string): Promise<AngelTokens> {
  const client = getSmartApi()
  try {
    const response = await client.generateToken(refreshToken)
    return extractTokens(response)
  } catch (raw) {
    const err = classifyAngelError(raw)
    if (err instanceof AuthError) throw err
    throw new AuthError('Angel One generateToken failed', raw)
  }
}

async function fullLogin(): Promise<AngelTokens> {
  const clientCode = requireEnv('ANGEL_CLIENT_CODE')
  const mpin = requireEnv('ANGEL_MPIN')
  const totpSecret = requireEnv('ANGEL_TOTP_SECRET')

  const totp = generateTotp({ secret: totpSecret })
  const client = getSmartApi()

  try {
    const response = await client.generateSession(clientCode, mpin, totp)
    return extractTokens(response)
  } catch (raw) {
    const err = classifyAngelError(raw)
    if (err instanceof AuthError) throw err
    throw new AuthError('Angel One generateSession failed', raw)
  }
}

export async function getValidSession(): Promise<ValidAngelSession> {
  const existing = await loadSession()

  if (existing?.jwtToken && existing?.feedToken && isFresh(existing.issuedAt)) {
    applyTokensToClient({
      jwtToken: existing.jwtToken,
      refreshToken: existing.refreshToken ?? '',
      feedToken: existing.feedToken,
    })
    return { jwtToken: existing.jwtToken, feedToken: existing.feedToken }
  }

  let tokens: AngelTokens | null = null

  if (existing?.refreshToken) {
    try {
      tokens = await refreshWith(existing.refreshToken)
    } catch {
      tokens = null
    }
  }

  if (!tokens) {
    tokens = await fullLogin()
  }

  await saveSession(tokens)
  applyTokensToClient(tokens)
  return { jwtToken: tokens.jwtToken, feedToken: tokens.feedToken }
}
