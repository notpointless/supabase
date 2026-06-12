import { NextApiRequest, NextApiResponse } from 'next'

import { bff, consoleFetch, resolveOrg } from '@/lib/console-bff'

// [console fork] Per-org AI assistant config (the org's OpenAI API key). Proxies to the control
// plane. The raw key is never returned — GET reports a `configured` boolean; PUT sets it; DELETE
// clears it. Resolves the org slug (the dashboard routes by slug) to the backend org id.
async function withOrgId(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: (orgId: string) => Promise<void>
) {
  const slug = String(req.query.slug ?? '')
  const org = await resolveOrg(req, slug)
  if (!org?.id) return res.status(404).json({ error: { message: 'Organization not found' } })
  return fn(org.id)
}

export default bff({
  GET: (req, res) =>
    withOrgId(req, res, async (orgId) => {
      const { status, data } = await consoleFetch<any>(req, `/api/v1/organizations/${orgId}/ai-config`, {
        method: 'GET',
      })
      return res.status(status >= 400 ? status : 200).json(data ?? { configured: false })
    }),
  PUT: (req, res) =>
    withOrgId(req, res, async (orgId) => {
      const { status, data } = await consoleFetch<any>(req, `/api/v1/organizations/${orgId}/ai-config`, {
        method: 'PUT',
        body: JSON.stringify({ openaiApiKey: (req.body as any)?.openaiApiKey ?? '' }),
      })
      if (status >= 400) {
        return res.status(status).json({ error: { message: data?.message ?? data?.error ?? 'Failed to save key' } })
      }
      return res.status(200).json(data ?? { configured: true })
    }),
  DELETE: (req, res) =>
    withOrgId(req, res, async (orgId) => {
      const { status, data } = await consoleFetch<any>(req, `/api/v1/organizations/${orgId}/ai-config`, {
        method: 'DELETE',
      })
      return res.status(status >= 400 ? status : 200).json(data ?? { configured: false })
    }),
})
