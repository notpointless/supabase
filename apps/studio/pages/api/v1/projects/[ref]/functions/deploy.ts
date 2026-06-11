import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch } from '@/lib/console-bff'

// [console fork] Deploy (create/overwrite) an edge function. Slug in ?slug=, body
// { file: [{name, content}], metadata }. Forwarded to the control plane, which writes the
// files to the runtime functions volume (local for shared, over SSM for EC2).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const ref = String(req.query.ref ?? '')
  const slug = String(req.query.slug ?? '')
  const { ok, status, data } = await consoleFetch<any>(
    req,
    `/api/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
    { method: 'POST', body: JSON.stringify(req.body ?? {}) }
  )
  if (!ok) {
    return res
      .status(status || 500)
      .json(data ?? { error: { message: 'Failed to deploy edge function' } })
  }
  return res.status(200).json(data)
}
