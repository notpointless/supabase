import { NextApiRequest, NextApiResponse } from 'next'

import { consoleGet } from '@/lib/console-bff'

// [console fork] S3 access keys. Single-tenant self-hosted storage exposes NO access-key
// management API (the hosted /credentials route is multitenant-only), and all S3-protocol
// access to a project goes through ONE static credential pair that the storage container
// validates for sigv4. So "creating an S3 access key" here returns the project's existing
// S3-protocol credentials (derived from its JWT secret, server-side in the control plane).
// This is what the S3-vectors FDW + external S3 clients use to sign against /storage/v1/s3.

type S3Creds = { accessKeyId: string; secretAccessKey: string }

async function getCreds(req: NextApiRequest, ref: string): Promise<S3Creds | null> {
  const { ok, data } = await consoleGet<S3Creds>(
    req,
    `/api/v1/projects/${encodeURIComponent(ref)}/s3-credentials`
  )
  return ok && data?.accessKeyId ? data : null
}

const DESCRIPTION = 'Project S3 access key'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')

  if (req.method === 'GET') {
    const creds = await getCreds(req, ref)
    if (!creds) return res.status(200).json({ data: [] })
    return res.status(200).json({
      data: [
        {
          id: creds.accessKeyId,
          access_key: creds.accessKeyId,
          description: DESCRIPTION,
          created_at: new Date(0).toISOString(),
        },
      ],
    })
  }

  if (req.method === 'POST') {
    const creds = await getCreds(req, ref)
    if (!creds) {
      return res.status(503).json({ error: { message: 'Project is not provisioned' } })
    }
    const description =
      typeof (req.body as any)?.description === 'string' && (req.body as any).description.trim()
        ? (req.body as any).description
        : DESCRIPTION
    return res.status(200).json({
      id: creds.accessKeyId,
      access_key: creds.accessKeyId,
      secret_key: creds.secretAccessKey,
      description,
    })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}
