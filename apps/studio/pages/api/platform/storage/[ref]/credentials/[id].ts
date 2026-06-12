import { NextApiRequest, NextApiResponse } from 'next'

// [console fork] The project's S3 access key is its single static S3-protocol credential
// (derived from the JWT secret, see ./index.ts) — it isn't a deletable record. Report success
// so the dashboard's delete action resolves cleanly without claiming a real deletion happened
// against a storage API that has no such endpoint in single-tenant mode.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  return res.status(200).json({ ok: true })
}
