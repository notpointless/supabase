import * as Sentry from '@sentry/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessToken, useParams } from 'common'
import { useRouter } from 'next/router'
import { useEffect, useEffectEvent, useState } from 'react'
import { toast } from 'sonner'
import { LogoLoader } from 'ui'

import { SignInMfaForm } from '@/components/interfaces/SignIn/SignInMfaForm'
import SignInLayout from '@/components/layouts/SignInLayout/SignInLayout'
import { useAddLoginEvent } from '@/data/misc/audit-login-mutation'
import useLatest from '@/hooks/misc/useLatest'
import { auth, buildPathWithParams, getReturnToPath } from '@/lib/gotrue'
import { useTrack } from '@/lib/telemetry/track'
import type { NextPageWithLayout } from '@/types'

const SignInMfaPage: NextPageWithLayout = () => {
  const router = useRouter()

  const queryClient = useQueryClient()
  const {
    // current methods for mfa are github and sso
    method: signInMethod = 'unknown',
  } = useParams()
  const signInMethodRef = useLatest(signInMethod)

  const track = useTrack()
  const onSignInTracked = useEffectEvent(() => {
    track('sign_in', {
      category: 'account',
      method: signInMethodRef.current,
    })
  })
  const { mutate: addLoginEvent } = useAddLoginEvent()

  const [loading, setLoading] = useState(true)

  // This useEffect redirects the user to MFA if they're already halfway signed in
  useEffect(() => {
    auth
      .initialize()
      .then(async ({ error }) => {
        if (error) {
          // OAuth/SSO callback failed — bounce back to /sign-in so the error renders under the
          // correct heading instead of "Two-factor authentication". The error is held in the
          // shared auth context and surfaces via useAuthError() on /sign-in.
          return router.replace({ pathname: '/sign-in', query: router.query })
        }

        // [console fork] Check the assurance level BEFORE the access token. A 2FA user who
        // just entered their password has no session/token yet (better-auth returns a
        // twoFactorRedirect and only issues the session after the code is verified). The
        // original token-first check bounced them straight back to /sign-in, so the MFA form
        // never showed. If a step-up is required, render the form regardless of token.
        const { data, error: aalError } = await auth.mfa.getAuthenticatorAssuranceLevel()
        if (aalError) {
          toast.error(
            `Failed to retrieve assurance level: ${aalError.message}. Please try signing in again`
          )
          setLoading(false)
          return router.push({ pathname: '/sign-in', query: router.query })
        }

        if (data.currentLevel !== data.nextLevel) {
          // Second factor required — show the MFA form.
          setLoading(false)
          return
        }

        // No step-up needed: a real session means sign-in is complete; otherwise the user
        // landed here without authenticating, so send them back to /sign-in.
        const token = await getAccessToken()
        if (token) {
          onSignInTracked()
          addLoginEvent({})
          await queryClient.resetQueries()
          router.push(getReturnToPath())
          return
        } else {
          const redirectTo = buildPathWithParams('/sign-in')
          router.replace(redirectTo)
          return
        }
      })
      .catch((error) => {
        Sentry.captureException(error)
        console.error('Auth initialization error:', error)
        toast.error('Failed to initialize authentication. Please try again.')
        setLoading(false)
        router.push({ pathname: '/sign-in', query: router.query })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 bg-alternative h-screen items-center justify-center">
        <LogoLoader />
      </div>
    )
  }

  return (
    <SignInLayout
      heading="Two-factor authentication"
      subheading="Enter the authentication code from your two-factor authentication app"
      logoLinkToMarketingSite={true}
    >
      <div className="flex flex-col gap-5">
        <SignInMfaForm />
      </div>
    </SignInLayout>
  )
}

export default SignInMfaPage
