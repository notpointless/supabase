import { bff, consoleGet, consoleFetch, resolveOrg } from '@/lib/console-bff'

// [console fork] Org-level GitHub App credentials (App name + Client ID + Client Secret).
// Each organization registers its own GitHub App; the OAuth code exchange uses these.
// Proxies the control plane's /api/v1/organizations/{orgId}/github-app (slug -> orgId).
export default bff({
  GET: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ message: 'Organization not found' })
    const { data } = await consoleGet<any>(req, `/api/v1/organizations/${org.id}/github-app`)
    return res.status(200).json(data ?? { configured: false })
  },
  PUT: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ message: 'Organization not found' })
    const { ok, status, data } = await consoleFetch(req, `/api/v1/organizations/${org.id}/github-app`, {
      method: 'PUT',
      body: JSON.stringify(req.body ?? {}),
    })
    if (!ok) {
      return res
        .status(status && status >= 400 ? status : 502)
        .json({ message: (data as any)?.error?.message ?? (data as any)?.message ?? 'Failed to save GitHub App' })
    }
    return res.status(200).json(data ?? {})
  },
  DELETE: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ message: 'Organization not found' })
    const { ok, status, data } = await consoleFetch(req, `/api/v1/organizations/${org.id}/github-app`, {
      method: 'DELETE',
    })
    if (!ok) {
      return res
        .status(status && status >= 400 ? status : 502)
        .json({ message: (data as any)?.error?.message ?? 'Failed to remove GitHub App' })
    }
    return res.status(200).json(data ?? { configured: false })
  },
})
