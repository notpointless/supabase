import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch } from '@/lib/console-bff'

// [console fork] A single edge function: GET detail, PATCH metadata (name/verify_jwt),
// DELETE. Forwarded to the control plane.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')
  const slug = String(req.query.slug ?? '')
  const path = `/api/v1/projects/${ref}/functions/${encodeURIComponent(slug)}`

  if (req.method === 'GET') {
    const { ok, status, data } = await consoleFetch<any>(req, path, { method: 'GET' })
    return res.status(ok ? 200 : status || 404).json(data ?? { error: { message: 'Not found' } })
  }
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { ok, status, data } = await consoleFetch<any>(req, path, {
      method: 'PATCH',
      body: JSON.stringify(req.body ?? {}),
    })
    return res
      .status(ok ? 200 : status || 500)
      .json(data ?? { error: { message: 'Failed to update edge function' } })
  }
  if (req.method === 'DELETE') {
    const { ok, status, data } = await consoleFetch<any>(req, path, { method: 'DELETE' })
    return res
      .status(ok ? 200 : status || 500)
      .json(data ?? { error: { message: 'Failed to delete edge function' } })
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}
