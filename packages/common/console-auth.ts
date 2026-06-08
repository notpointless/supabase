/**
 * [console fork] better-auth-backed shim for the GoTrue client.
 *
 * The forked dashboard authenticates against our control-plane better-auth
 * (`/api/auth/*`, same-origin via a Next rewrite -> the backend). This module
 * implements the subset of the `@supabase/auth-js` AuthClient surface that the
 * dashboard actually consumes (see `common/auth.tsx` + the SignIn form),
 * translating better-auth's REST responses into GoTrue-shaped `{ data, error }`.
 *
 * Auth is cookie-based: the session cookie (`supabase-console.session`) rides
 * every same-origin request, so there is no client-accessible JWT. We synthesize
 * a GoTrue-ish session object whose `access_token` is a sentinel; real API auth
 * happens server-side (the BFF forwards the cookie).
 */

import QRCode from 'qrcode'

const AUTH_BASE = '/api/auth'

type GotrueUser = {
  id: string
  email: string
  app_metadata: Record<string, unknown>
  user_metadata: Record<string, unknown>
  aud: string
  role: string
  created_at: string
  updated_at: string
  factors: unknown[]
  // carry through useful better-auth fields
  [k: string]: unknown
}

type GotrueSession = {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  token_type: string
  user: GotrueUser
}

type AuthChangeEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED'
type Subscriber = (event: AuthChangeEvent, session: GotrueSession | null) => void

const isBrowser = typeof window !== 'undefined'

function toGotrueUser(u: any): GotrueUser {
  return {
    id: u?.id ?? '',
    email: u?.email ?? '',
    app_metadata: { provider: 'email', role: u?.role },
    user_metadata: {
      full_name: u?.name,
      firstName: u?.firstName,
      lastName: u?.lastName,
      username: u?.username,
    },
    aud: 'authenticated',
    role: 'authenticated',
    created_at: u?.createdAt ?? '',
    updated_at: u?.updatedAt ?? '',
    // MFA factors: better-auth exposes a boolean; the dashboard only checks
    // `factors.length`, so reflect the boolean as a single synthetic factor.
    factors: u?.twoFactorEnabled ? [{ id: 'totp', factor_type: 'totp', status: 'verified' }] : [],
    // Single email identity so the account email selector has an option.
    identities: u?.email
      ? [
          {
            identity_id: u.id,
            id: u.id,
            user_id: u.id,
            identity_data: { email: u.email, sub: u.id },
            provider: 'email',
            created_at: u?.createdAt,
            updated_at: u?.updatedAt,
            email: u.email,
          },
        ]
      : [],
    name: u?.name,
    firstName: u?.firstName,
    lastName: u?.lastName,
    username: u?.username,
    twoFactorEnabled: u?.twoFactorEnabled,
  }
}

function toGotrueSession(payload: any): GotrueSession | null {
  if (!payload || !payload.user || !payload.session) return null
  const expiresAtMs = payload.session.expiresAt ? new Date(payload.session.expiresAt).getTime() : 0
  return {
    // Sentinel — real auth is the http-only cookie; not a usable bearer token.
    access_token: 'console-cookie-session',
    refresh_token: '',
    expires_at: Math.floor(expiresAtMs / 1000),
    expires_in: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)),
    token_type: 'cookie',
    user: toGotrueUser(payload.user),
  }
}

async function authFetch(path: string, init?: RequestInit) {
  return fetch(`${AUTH_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
}

function makeConsoleGotrueShim() {
  let currentSession: GotrueSession | null = null
  // [console fork] True after a password sign-in that returned a `twoFactorRedirect` (a 2FA
  // user has no session until they verify a code). Drives getAuthenticatorAssuranceLevel +
  // listFactors so the dashboard shows the second-factor screen; cleared once verify-totp
  // establishes the session (or on sign-out).
  let mfaPending = false
  const subscribers = new Set<Subscriber>()

  const emit = (event: AuthChangeEvent) => {
    for (const cb of subscribers) {
      try {
        cb(event, currentSession)
      } catch {
        // a misbehaving subscriber must not break the others
      }
    }
  }

  const fetchSession = async (): Promise<GotrueSession | null> => {
    if (!isBrowser) return null
    try {
      const res = await authFetch('/get-session', { method: 'GET' })
      if (!res.ok) {
        currentSession = null
        return null
      }
      const json = await res.json().catch(() => null)
      currentSession = toGotrueSession(json)
      return currentSession
    } catch {
      currentSession = null
      return null
    }
  }

  const ok = <T,>(data: T) => ({ data, error: null as null })
  const fail = (message: string, status = 400) => ({
    data: { user: null, session: null },
    error: { message, status, name: 'AuthApiError', __isAuthError: true },
  })

  const shim = {
    async initialize() {
      await fetchSession()
      // defer so subscribers registered after initialize() still get the event
      if (isBrowser) setTimeout(() => emit('INITIAL_SESSION'), 0)
      return { error: null }
    },

    onAuthStateChange(cb: Subscriber) {
      subscribers.add(cb)
      // emit current state asynchronously, mirroring gotrue-js behavior
      if (isBrowser) setTimeout(() => cb('INITIAL_SESSION', currentSession), 0)
      return {
        data: {
          subscription: {
            id: Math.random().toString(36).slice(2),
            callback: cb,
            unsubscribe: () => {
              subscribers.delete(cb)
            },
          },
        },
      }
    },

    async getSession() {
      const session = await fetchSession()
      return ok({ session })
    },

    async getUser() {
      const session = await fetchSession()
      return session
        ? ok({ user: session.user })
        : { data: { user: null }, error: { message: 'No session', name: 'AuthApiError' } }
    },

    async refreshSession() {
      const session = await fetchSession()
      if (session) emit('TOKEN_REFRESHED')
      return ok({ session, user: session?.user ?? null })
    },

    async signInWithPassword(credentials: { email: string; password: string; options?: any }) {
      try {
        const res = await authFetch('/sign-in/email', {
          method: 'POST',
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          return fail(json?.message ?? 'Invalid login credentials', res.status)
        }
        // 2FA user: better-auth returns { twoFactorRedirect: true } and no session yet. Flag
        // it (no error) so SignInForm's AAL check routes to /sign-in-mfa instead of falling
        // through to the dashboard with no session (which bounces back to sign-in).
        if (json?.twoFactorRedirect) {
          mfaPending = true
          return ok({ user: null, session: null })
        }
        mfaPending = false
        const session = await fetchSession()
        emit('SIGNED_IN')
        return ok({ user: session?.user ?? toGotrueUser(json?.user), session })
      } catch (e: any) {
        return fail(e?.message ?? 'Failed to sign in', 500)
      }
    },

    // SSO sign-in. The dashboard's "Continue with SSO" form calls this with the email
    // domain (or a providerId) and expects `{ data: { url }, error }` — it redirects the
    // browser to `data.url` (the identity provider). Maps to the @better-auth/sso plugin's
    // POST /sign-in/sso, which returns the IdP authorize URL for the org's registered
    // provider matching the domain.
    async signInWithSSO(params: {
      domain?: string
      providerId?: string
      options?: { redirectTo?: string; captchaToken?: string }
    }) {
      try {
        const body: Record<string, unknown> = {}
        if (params.providerId) body.providerId = params.providerId
        else if (params.domain) body.domain = params.domain
        if (params.options?.redirectTo) body.callbackURL = params.options.redirectTo
        const res = await authFetch('/sign-in/sso', { method: 'POST', body: JSON.stringify(body) })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.url) {
          return fail(
            json?.message ?? json?.error?.message ?? 'No SSO provider is configured for this domain',
            res.status
          )
        }
        return ok({ url: json.url as string, provider: 'sso' })
      } catch (e: any) {
        return fail(e?.message ?? 'Failed to sign in with SSO', 500)
      }
    },

    // MFA namespace. The dashboard checks `currentLevel !== nextLevel` after
    // sign-in to decide whether to route to the second-factor screen. Until the
    // BFF surfaces two-factor status, report aal1==aal1 (no step-up needed).
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        // Pending 2FA: password accepted but the code hasn't been verified yet -> step-up
        // required (aal1 -> aal2) so the dashboard routes to the second-factor screen.
        if (mfaPending) {
          return ok({ currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] })
        }
        // A live session means any required second factor was already satisfied this session,
        // so current == next (no step-up). Reporting aal2-needed off the static
        // twoFactorEnabled flag would loop the dashboard back to the MFA screen forever.
        const session = await fetchSession()
        const level = (session?.user as any)?.twoFactorEnabled ? 'aal2' : 'aal1'
        return ok({ currentLevel: level, nextLevel: level, currentAuthenticationMethods: [] })
      },
      async listFactors() {
        const session = await fetchSession()
        // During pending 2FA there's no session yet, but the challenge screen still needs a
        // factor to verify against.
        const hasTotp = mfaPending || !!(session?.user as any)?.twoFactorEnabled
        const totp = hasTotp
          ? [{ id: 'totp', factor_type: 'totp', friendly_name: 'Authenticator app', status: 'verified' }]
          : []
        return ok({ all: totp, totp, phone: [] })
      },

      // Enroll a new TOTP factor. The "Add app" modal collects the account password (which
      // @better-auth requires to enable 2FA) + a friendly name. POST /two-factor/enable
      // returns an otpauth:// URI; we render it to a QR data-uri because the modal shows
      // <img src={totp.qr_code}>. The factor isn't fully active until challengeAndVerify
      // (verify-totp) confirms a code.
      async enroll(params: { factorType?: string; friendlyName?: string; password?: string }) {
        try {
          const res = await authFetch('/two-factor/enable', {
            method: 'POST',
            body: JSON.stringify({ password: params.password ?? '' }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || !json?.totpURI) {
            return fail(
              json?.message ??
                json?.error?.message ??
                'Could not start enrollment — check your password and try again.',
              res.status
            )
          }
          const uri: string = json.totpURI
          const secret = /[?&]secret=([^&]+)/i.exec(uri)?.[1] ?? ''
          const qr_code = await QRCode.toDataURL(uri, { margin: 1, width: 200 })
          return ok({
            id: 'totp',
            type: 'totp',
            friendly_name: params.friendlyName,
            totp: { qr_code, secret, uri },
          })
        } catch (e: any) {
          return fail(e?.message ?? 'Failed to enroll MFA factor', 500)
        }
      },

      // Remove TOTP / cancel an in-progress enrollment -> @better-auth /two-factor/disable
      // (also password-gated).
      async unenroll(params: { factorId?: string; password?: string }) {
        try {
          const res = await authFetch('/two-factor/disable', {
            method: 'POST',
            body: JSON.stringify({ password: params.password ?? '' }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) {
            return fail(
              json?.message ??
                json?.error?.message ??
                'Could not remove MFA — check your password and try again.',
              res.status
            )
          }
          return ok({ id: params.factorId })
        } catch (e: any) {
          return fail(e?.message ?? 'Failed to remove MFA factor', 500)
        }
      },

      // Verify the TOTP code at sign-in. The "Confirm your MFA" form (shown when
      // getAuthenticatorAssuranceLevel reports aal1->aal2) calls challengeAndVerify with the
      // factor id + 6-digit code. Map it to @better-auth's two-factor verify-totp, which
      // upgrades the session to aal2. The form only inspects `error`, so on success we
      // return the refreshed session.
      async challengeAndVerify(params: { factorId?: string; code: string }) {
        try {
          const res = await authFetch('/two-factor/verify-totp', {
            method: 'POST',
            body: JSON.stringify({ code: params.code }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || json?.error) {
            return fail(
              json?.message ?? json?.error?.message ?? 'Invalid two-factor authentication code',
              res.status
            )
          }
          // Code verified -> the session is now established (aal2); clear the pending flag.
          mfaPending = false
          const session = await fetchSession()
          emit('SIGNED_IN')
          return ok({ user: session?.user ?? null, session })
        } catch (e: any) {
          return fail(e?.message ?? 'Failed to verify two-factor code', 500)
        }
      },
    },

    async signOut() {
      try {
        await authFetch('/sign-out', { method: 'POST', body: '{}' })
      } catch {
        // ignore network errors on sign-out; clear local state regardless
      }
      currentSession = null
      mfaPending = false
      emit('SIGNED_OUT')
      return { error: null }
    },
  }

  // Any AuthClient method we haven't implemented (sign-up, OTP, password reset,
  // identity linking, etc.) resolves to a benign "not implemented" error instead
  // of throwing, so unrelated pages don't crash the app on load.
  return new Proxy(shim, {
    get(target, prop: string) {
      if (prop in target) return (target as any)[prop]
      return async () => ({
        data: { user: null, session: null },
        error: {
          message: `auth.${prop} is not implemented in the console fork`,
          name: 'AuthApiError',
        },
      })
    },
  })
}

export const consoleGotrueShim = makeConsoleGotrueShim()
