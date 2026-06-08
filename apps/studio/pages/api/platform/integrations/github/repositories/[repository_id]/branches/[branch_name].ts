import type { NextApiRequest } from 'next'

import { bff, consoleFetch, consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] Check whether a branch exists in a connected repo (used by the
// "Production branch name" field). Was missing entirely -> the query 404'd -> the form
// reported "Branch not found", blocking the connection. Proxy to the control plane's
// /organizations/{orgId}/github/repositories/{repoId}/branches/{branch}.
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
    const repositoryId = String(req.query.repository_id ?? '')
    const branchName = String(req.query.branch_name ?? '')
    if (!repositoryId || !branchName) {
      return res.status(400).json({ message: 'repository_id and branch_name are required' })
    }
    const orgId = await resolveOrgId(req, req.query.slug ? String(req.query.slug) : undefined)
    if (!orgId) return res.status(404).json({ message: 'No organization found' })
    const { ok, status, data } = await consoleFetch(
      req,
      `/api/v1/organizations/${orgId}/github/repositories/${encodeURIComponent(repositoryId)}/branches/${encodeURIComponent(branchName)}`,
      { method: 'GET' }
    )
    if (!ok) {
      return res
        .status(status && status >= 400 ? status : 502)
        .json({ message: (data as any)?.error?.message ?? (data as any)?.message ?? 'Branch not found' })
    }
    return res.status(200).json(data ?? {})
  },
})
