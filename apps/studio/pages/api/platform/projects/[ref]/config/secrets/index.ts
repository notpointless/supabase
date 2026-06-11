import { bff } from '@/lib/console-bff'

// [console fork] /platform/projects/{ref}/config/secrets is the hosted platform's JWT-SECRET
// ROTATION surface (the dashboard's jwt-secret-update mutation PATCHes here). This console
// derives every project credential from the JWT secret (anon/service keys, Logflare tokens,
// S3-protocol keys), so rotation is a re-provision-level operation we don't support yet —
// say so clearly instead of a generic 405 (and never fake success: a silent 200 would leave
// users believing their secret rotated).
export default bff({
  GET: async (_req, res) => res.status(200).json([]),
  POST: async (_req, res) => res.status(200).json([]),
  PATCH: async (_req, res) =>
    res.status(400).json({
      error: {
        message:
          'JWT secret rotation is not supported on this console — every project credential derives from it. Create a new project to get fresh secrets.',
      },
    }),
})
