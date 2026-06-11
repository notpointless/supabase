import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch } from '@/lib/console-bff'

// [console fork] Delete a Third-Party Auth integration; the control-plane removes it from the
// project and reconfigures the stack to stop trusting that issuer's keys.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const ref = String(req.query.ref ?? '')
  const tpaId = String(req.query.tpa_id ?? '')
  const { ok, status, data } = await consoleFetch<any>(
    req,
    `/api/v1/projects/${ref}/third-party-auth/${encodeURIComponent(tpaId)}`,
    { method: 'DELETE' }
  )
  return res
    .status(ok ? 200 : status || 500)
    .json(data ?? { error: { message: 'Failed to delete third-party auth integration' } })
}
