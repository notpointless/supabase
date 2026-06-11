import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch } from '@/lib/console-bff'

// [console fork] Deploy is sent as multipart/form-data (file parts + a metadata JSON part), so
// we must NOT let Next parse/serialize it as JSON — forward the RAW body + content-type to the
// control plane, which parses the multipart and writes the files to the runtime functions volume.
export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const ref = String(req.query.ref ?? '')
  const slug = String(req.query.slug ?? '')

  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks)

  const { ok, status, data } = await consoleFetch<any>(
    req,
    `/api/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': req.headers['content-type'] ?? 'application/octet-stream' },
      body: raw,
    }
  )
  if (!ok) {
    return res
      .status(status || 500)
      .json(data ?? { error: { message: 'Failed to deploy edge function' } })
  }
  return res.status(200).json(data)
}
