import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch, consoleGet } from '@/lib/console-bff'

// [console fork] Third-Party Auth integrations for a project. GET lists them, POST adds one
// (oidc_issuer_url / jwks_url / custom_jwks). Forwarded to the control-plane, which persists
// them on the project and reconfigures the stack to trust the issuer's keys.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')

  if (req.method === 'GET') {
    const { data } = await consoleGet<unknown[]>(req, `/api/v1/projects/${ref}/third-party-auth`)
    return res.status(200).json(Array.isArray(data) ? data : [])
  }

  if (req.method === 'POST') {
    const { ok, status, data } = await consoleFetch<any>(
      req,
      `/api/v1/projects/${ref}/third-party-auth`,
      { method: 'POST', body: JSON.stringify(req.body ?? {}) }
    )
    return res
      .status(ok ? 200 : status || 500)
      .json(data ?? { error: { message: 'Failed to add third-party auth integration' } })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}
