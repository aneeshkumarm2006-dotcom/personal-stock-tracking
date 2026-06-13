import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session'

const PUBLIC_PATHS = new Set(['/login'])
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/logout'])

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (PUBLIC_API_PATHS.has(pathname)) return true
  if (pathname.startsWith('/api/jobs/')) return true
  // Research agent feed: protected by its own bearer token, not the session cookie.
  if (pathname.startsWith('/api/research/')) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const valid = token ? await verifySessionToken(token) : false

  if (valid) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  if (pathname && pathname !== '/') {
    loginUrl.searchParams.set('redirect', `${pathname}${search ?? ''}`)
  }
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
}
