import { bff } from '@/lib/console-bff'

// [console fork] POST /platform/profile/audit-login
// The dashboard fires this right after a successful sign-in to record a login event.
// The control plane already audits the auth request and tracks the session via
// better-auth, so there's nothing extra to persist here — acknowledge with 200. Without
// this route the call 404s and the sign-in form surfaces an "API error" toast despite a
// successful login.
export default bff({
  POST: async (_req, res) => {
    return res.status(200).json({})
  },
})
