import { LOCAL_STORAGE_KEYS, safeLocalStorage } from 'common'

import { makeRandomString } from './helpers'

const GITHUB_INTEGRATION_APP_NAME =
  process.env.NEXT_PUBLIC_GITHUB_INTEGRATION_APP_NAME ||
  (process.env.NEXT_PUBLIC_IS_NIMBUS !== undefined
    ? 'supabase-snap'
    : process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod'
      ? `supabase`
      : process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
        ? `supabase-staging`
        : `supabase-local-testing`)

const GITHUB_INTEGRATION_CLIENT_ID =
  process.env.NEXT_PUBLIC_GITHUB_INTEGRATION_CLIENT_ID ||
  (process.env.NEXT_PUBLIC_IS_NIMBUS !== undefined
    ? 'Iv23li2pAiqDGgaSrP8q'
    : process.env.NEXT_PUBLIC_ENVIRONMENT === 'prod'
      ? `Iv1.b91a6d8eaa272168`
      : process.env.NEXT_PUBLIC_ENVIRONMENT === 'staging'
        ? `Iv1.2681ab9a0360d8ad`
        : `Iv1.5022a3b44d150fbf`)

export const GITHUB_INTEGRATION_INSTALLATION_URL = `https://github.com/apps/${GITHUB_INTEGRATION_APP_NAME}/installations/new`
export const GITHUB_INTEGRATION_REVOKE_AUTHORIZATION_URL = `https://github.com/settings/connections/applications/${GITHUB_INTEGRATION_CLIENT_ID}`

// [console fork] GitHub credentials are per-organization (registered via Org Settings →
// General → GitHub App). Pass the org's app `{ clientId, appName }` so the OAuth
// authorize + installation URLs match the App whose secret the control plane uses to
// exchange the code. Falls back to the build-time client id/app name when not provided.
export function openInstallGitHubIntegrationWindow(
  type: 'install' | 'authorize',
  app?: { clientId?: string; appName?: string },
  closeCallback?: () => void
) {
  const clientId = app?.clientId || GITHUB_INTEGRATION_CLIENT_ID
  const appName = app?.appName || GITHUB_INTEGRATION_APP_NAME
  const authorizationUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}`
  const installationUrl = `https://github.com/apps/${appName}/installations/new`

  const w = 600
  const h = 800

  const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY

  const width = window.innerWidth
    ? window.innerWidth
    : document.documentElement.clientWidth
      ? document.documentElement.clientWidth
      : screen.width
  const height = window.innerHeight
    ? window.innerHeight
    : document.documentElement.clientHeight
      ? document.documentElement.clientHeight
      : screen.height

  let windowUrl: string | undefined
  if (type === 'install') {
    windowUrl = installationUrl
  } else {
    const state = makeRandomString(32)
    safeLocalStorage.setItem(LOCAL_STORAGE_KEYS.GITHUB_AUTHORIZATION_STATE, state)
    windowUrl = `${authorizationUrl}&state=${state}&prompt=select_account`
  }

  const systemZoom = width / window.screen.availWidth
  const left = (width - w) / 2 / systemZoom + dualScreenLeft
  const top = (height - h) / 2 / systemZoom + dualScreenTop
  const newWindow = window.open(
    windowUrl,
    'GitHub',
    `scrollbars=yes,resizable=no,status=no,location=no,toolbar=no,menubar=no,
     width=${w / systemZoom}, 
     height=${h / systemZoom}, 
     top=${top}, 
     left=${left}
     `
  )
  if (newWindow) {
    if (closeCallback) {
      // Poll to check if window is closed
      const checkClosed = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkClosed)
          closeCallback()
        }
      }, 500) // Check every 500ms

      // Add a timeout to prevent infinite polling
      setTimeout(() => {
        clearInterval(checkClosed)
      }, 300000) // 5 minutes timeout
    }
    newWindow.focus()
  }
}

export const getGitHubProfileImgUrl = (username: string) => {
  return `https://github.com/${username}.png?size=96`
}
