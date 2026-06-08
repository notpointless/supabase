import type { NextApiRequest } from 'next'

import { bff, consoleFetch, consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] GitHub OAuth authorization for an org's GitHub App.
//   GET  -> is the current user authorized for this org? (drives the Connect vs connected UI)
//   POST -> exchange the OAuth `code` for a user token (using the org's client id/secret) and
//           store it. This is what the /integrations/github/authorize callback popup calls;
//           without it the exchange 405'd and the popup showed "Unable to authorize".
// The connection is org-scoped. We resolve the org from a `slug` if the caller sends one,
// otherwise fall back to the user's organization (covers the common single-org setup).
async function resolveOrgId(req: NextApiRequest, slug?: string): Promise<string | null> {
  if (slug) {
    const org = await resolveOrg(req, slug)
    if (org) return org.id
  }
  const { data: orgs } = await consoleGet<Array<{ id: string }>>(req, '/api/auth/organization/list')
  return Array.isArray(orgs) && orgs.length > 0 ? orgs[0].id : null
}

export default bff({
  GET: async (req, res) => {
    const orgId = await resolveOrgId(req, req.query.slug ? String(req.query.slug) : undefined)
    if (!orgId) return res.status(200).json(null)
    const { ok, data } = await consoleGet<any>(req, `/api/v1/organizations/${orgId}/github/authorization`)
    return res.status(200).json(ok ? (data ?? null) : null)
  },
  POST: async (req, res) => {
    const code = String((req.body as any)?.code ?? '')
    if (!code) return res.status(400).json({ message: 'code is required' })
    const orgId = await resolveOrgId(req, (req.body as any)?.slug ? String((req.body as any).slug) : undefined)
    if (!orgId) {
      return res.status(400).json({ message: 'No organization found to attach the GitHub connection to' })
    }
    const { ok, status, data } = await consoleFetch(
      req,
      `/api/v1/organizations/${orgId}/github/authorization`,
      { method: 'POST', body: JSON.stringify({ code }) }
    )
    if (!ok) {
      return res.status(status && status >= 400 ? status : 502).json({
        message: (data as any)?.error?.message ?? (data as any)?.message ?? 'Failed to authorize GitHub',
      })
    }
    return res.status(200).json(data ?? {})
  },
})
