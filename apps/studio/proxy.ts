import { NextResponse, type NextRequest } from 'next/server'

import { IS_PLATFORM } from '@/lib/constants'

export const config = {
  // Run on every path EXCEPT Next internals/assets, the setup wizard (avoid a redirect loop),
  // favicon, and any file with an extension. This still covers /api/* (the hosted guard below)
  // AND page routes (the first-run setup redirect).
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon.ico|setup|.*\\.).*)'],
}

// [Joshen] Return 404 for all next.js API endpoints EXCEPT the ones we use in hosted:
const HOSTED_SUPPORTED_API_URLS = [
  '/ai/sql/generate-v4',
  '/ai/sql/policy',
  '/ai/feedback/rate',
  '/ai/code/complete',
  '/ai/sql/cron-v2',
  '/ai/sql/title-v2',
  '/ai/sql/filter-v1',
  '/ai/onboarding/design',
  '/ai/feedback/classify',
  '/ai/docs',
  '/ai/sql/parse-client-code',
  '/get-ip-address',
  '/get-utc-time',
  '/get-deployment-commit',
  '/check-cname',
  '/edge-functions/test',
  '/edge-functions/body',
  '/generate-attachment-url',
  '/incident-status',
  '/incident-banner',
  '/status-override',
  '/api/integrations/stripe-sync',
  '/content/graphql',
  '/parse-query',
]

// [console fork] Paths we own in platform mode: better-auth (proxied to our
// control-plane via next.config rewrites) and the BFF that translates studio's
// /platform/* calls to our /api/v1. These must bypass the hosted 404 guard.
const CONSOLE_FORK_PREFIXES = ['/api/auth/', '/api/platform/', '/api/v1/', '/api/ai/']

// [console fork] Once the first admin is installed the instance can never revert, so cache the
// positive result in module scope and stop checking — after setup this is effectively free.
let isInstalled = false

// Ask the control plane directly (not our own basePath'd BFF) so this works regardless of the
// studio's basePath and avoids a server-fetching-its-own-route hop.
const CONSOLE_API_URL = process.env.CONSOLE_API_URL ?? 'http://localhost:3000'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // --- /api/* : the existing hosted 404 guard (unchanged behaviour) ---
  if (pathname.startsWith('/api/')) {
    if (CONSOLE_FORK_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return
    }
    if (IS_PLATFORM && !HOSTED_SUPPORTED_API_URLS.some((url) => pathname.endsWith(url))) {
      return Response.json(
        { success: false, message: 'Endpoint not supported on hosted' },
        { status: 404 }
      )
    }
    return
  }

  // --- page routes : first-run guard — send everything to the setup wizard until installed ---
  if (isInstalled) return
  try {
    const res = await fetch(`${CONSOLE_API_URL}/api/auth/install/status`, {
      headers: { accept: 'application/json' },
    })
    if (res.ok) {
      const data = (await res.json()) as { installed?: boolean }
      if (data?.installed === true) {
        isInstalled = true
      } else if (data?.installed === false) {
        const url = request.nextUrl.clone()
        url.pathname = '/setup/install'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  } catch {
    // Control plane unreachable — don't lock the UI; let the page render.
  }
}
