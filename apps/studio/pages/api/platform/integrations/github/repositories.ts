import type { NextApiRequest } from 'next'

import { bff, consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] List the repositories the connected user can access through the org's
// GitHub App installations. Was a stub returning [] (so the repo dropdown was always
// empty); proxy to the control plane's /organizations/{orgId}/github/repositories.
// Org-scoped: resolve from a `slug` query param if present, else the user's org.
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
    const empty = { repositories: [], partial_response_due_to_sso: false }
    const orgId = await resolveOrgId(req, req.query.slug ? String(req.query.slug) : undefined)
    if (!orgId) return res.status(200).json(empty)
    const { ok, data } = await consoleGet<any>(req, `/api/v1/organizations/${orgId}/github/repositories`)
    return res.status(200).json(ok ? (data ?? empty) : empty)
  },
})
