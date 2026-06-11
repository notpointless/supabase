import { NextApiRequest, NextApiResponse } from 'next'

import { consoleGet } from '@/lib/console-bff'

// [console fork] List the project's edge functions from the control plane (reads the runtime
// functions volume — local for shared, over SSM for EC2).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const ref = String(req.query.ref ?? '')
  const { data } = await consoleGet<unknown[]>(req, `/api/v1/projects/${ref}/functions`)
  return res.status(200).json(Array.isArray(data) ? data : [])
}
