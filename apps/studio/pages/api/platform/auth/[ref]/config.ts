import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch, consoleGet } from '@/lib/console-bff'

// [console fork] GET/PATCH the project's GoTrue auth config for the Authentication
// settings pages. Supabase stores this in its platform DB; we store it on the project in
// the control-plane (so `buildStack` can apply it to GoTrue — signups, OAuth providers,
// the OAuth server, etc.). This BFF merges a sensible self-host default (so every Auth
// settings sub-page renders) with the project's saved overrides, and forwards edits to the
// backend, which persists them and reconfigures the running stack.
const defaultConfig = (siteUrl: string) => ({
  SITE_URL: siteUrl,
  URI_ALLOW_LIST: '',
  DISABLE_SIGNUP: false,
  JWT_EXP: 3600,
  REFRESH_TOKEN_ROTATION_ENABLED: true,
  SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: 10,
  SECURITY_CAPTCHA_ENABLED: false,
  SECURITY_CAPTCHA_PROVIDER: 'hcaptcha',
  SECURITY_CAPTCHA_SECRET: '',
  SECURITY_MANUAL_LINKING_ENABLED: false,
  SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION: false,
  SESSIONS_TIMEBOX: 0,
  SESSIONS_INACTIVITY_TIMEOUT: 0,
  SESSIONS_SINGLE_PER_USER: false,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_REQUIRED_CHARACTERS: '',
  PASSWORD_HIBP_ENABLED: false,
  RATE_LIMIT_EMAIL_SENT: 30,
  RATE_LIMIT_SMS_SENT: 30,
  RATE_LIMIT_VERIFY: 30,
  RATE_LIMIT_TOKEN_REFRESH: 150,
  RATE_LIMIT_OTP: 30,
  RATE_LIMIT_ANONYMOUS_USERS: 30,

  // Email / mailer
  EXTERNAL_EMAIL_ENABLED: true,
  MAILER_AUTOCONFIRM: true,
  MAILER_OTP_EXP: 3600,
  MAILER_OTP_LENGTH: 6,
  MAILER_SECURE_EMAIL_CHANGE_ENABLED: true,
  SMTP_ADMIN_EMAIL: '',
  SMTP_HOST: '',
  SMTP_PORT: '',
  SMTP_USER: '',
  SMTP_PASS: '',
  SMTP_SENDER_NAME: '',
  SMTP_MAX_FREQUENCY: 60,

  // Phone
  EXTERNAL_PHONE_ENABLED: false,
  SMS_AUTOCONFIRM: false,
  SMS_OTP_EXP: 60,
  SMS_OTP_LENGTH: 6,
  SMS_PROVIDER: 'twilio',

  // Anonymous
  EXTERNAL_ANONYMOUS_USERS_ENABLED: false,

  // MFA
  MFA_MAX_ENROLLED_FACTORS: 10,
  MFA_TOTP_ENROLL_ENABLED: true,
  MFA_TOTP_VERIFY_ENABLED: true,
  MFA_PHONE_ENROLL_ENABLED: false,
  MFA_PHONE_VERIFY_ENABLED: false,
  MFA_WEB_AUTHN_ENROLL_ENABLED: false,
  MFA_WEB_AUTHN_VERIFY_ENABLED: false,

  // Hooks
  HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: false,
  HOOK_SEND_SMS_ENABLED: false,
  HOOK_SEND_EMAIL_ENABLED: false,
  HOOK_MFA_VERIFICATION_ATTEMPT_ENABLED: false,
  HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED: false,

  // OAuth 2.1 authorization server (the project-internal "OAuth Server" page)
  OAUTH_SERVER_ENABLED: false,
  OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION: false,

  // OAuth providers — all disabled by default on self-host
  ...Object.fromEntries(
    [
      'APPLE', 'AZURE', 'BITBUCKET', 'DISCORD', 'FACEBOOK', 'FIGMA', 'GITHUB', 'GITLAB',
      'GOOGLE', 'KAKAO', 'KEYCLOAK', 'LINKEDIN_OIDC', 'NOTION', 'TWITCH', 'TWITTER',
      'SLACK_OIDC', 'SPOTIFY', 'WORKOS', 'ZOOM',
    ].flatMap((p) => [
      [`EXTERNAL_${p}_ENABLED`, false],
      [`EXTERNAL_${p}_CLIENT_ID`, ''],
      [`EXTERNAL_${p}_SECRET`, ''],
    ])
  ),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')
  let siteUrl = 'http://localhost:8082'
  try {
    const { data: project } = await consoleGet<any>(req, `/api/v1/projects/${ref}`)
    siteUrl = project?.connection?.apiUrl ?? siteUrl
  } catch {
    /* fall back to default */
  }

  if (req.method === 'GET') {
    // defaults <- persisted overrides (from the control-plane), so saved toggles survive.
    const { data: overrides } = await consoleGet<Record<string, unknown>>(
      req,
      `/api/v1/projects/${ref}/auth-config`
    )
    return res.status(200).json({ ...defaultConfig(siteUrl), ...(overrides ?? {}) })
  }
  if (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST') {
    // Persist + reconfigure on the control-plane; it returns the merged override set.
    const { ok, status, data: merged } = await consoleFetch<Record<string, unknown>>(
      req,
      `/api/v1/projects/${ref}/auth-config`,
      { method: 'PATCH', body: JSON.stringify(req.body ?? {}) }
    )
    if (!ok) {
      return res
        .status(status || 500)
        .json({ error: { message: 'Failed to update auth configuration' } })
    }
    return res.status(200).json({ ...defaultConfig(siteUrl), ...(merged ?? {}) })
  }
  res.setHeader('Allow', ['GET', 'PATCH'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}
