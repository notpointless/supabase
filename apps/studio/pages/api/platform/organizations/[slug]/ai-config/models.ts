import { NextApiRequest, NextApiResponse } from 'next'

import { bff, consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] List the org's available OpenAI models (dynamic model picker). Proxies to the
// control plane, which calls OpenAI /v1/models with the org's key and returns chat-capable ids.
export default bff({
  GET: async (req: NextApiRequest, res: NextApiResponse) => {
    const slug = String(req.query.slug ?? '')
    const org = await resolveOrg(req, slug)
    if (!org?.id) return res.status(404).json({ error: { message: 'Organization not found' } })
    const { status, data } = await consoleGet<{ models?: string[]; message?: string }>(
      req,
      `/api/v1/organizations/${org.id}/ai-config/models`
    )
    if (status >= 400) {
      return res.status(status).json({ error: { message: data?.message ?? 'Failed to list models' } })
    }
    return res.status(200).json({ models: data?.models ?? [] })
  },
})
