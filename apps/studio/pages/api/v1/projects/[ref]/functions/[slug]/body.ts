import { NextApiRequest, NextApiResponse } from 'next'

import { consoleGet } from '@/lib/console-bff'

type FilesResponse = {
  files: { name: string; content: string }[]
  metadata: { entrypoint_path?: string; import_map_path?: string | null }
}

// [console fork] The function editor expects the source as multipart/form-data: one metadata
// part (no filename, JSON) + one part per file (with a filename). The control plane returns the
// files as JSON; we adapt that to the multipart shape the studio's parser reads.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const ref = String(req.query.ref ?? '')
  const slug = String(req.query.slug ?? '')

  const { ok, data } = await consoleGet<FilesResponse>(
    req,
    `/api/v1/projects/${ref}/functions/${encodeURIComponent(slug)}/files`
  )
  if (!ok || !data) {
    return res.status(404).json({ error: { message: 'Function not found' } })
  }

  const boundary = '----consoleEdgeFn' + Date.now().toString(36)
  const chunks: Buffer[] = []
  const push = (s: string) => chunks.push(Buffer.from(s, 'utf8'))

  // metadata part (no filename -> parsed as metadata)
  push(`--${boundary}\r\n`)
  push('Content-Disposition: form-data; name="metadata"\r\n\r\n')
  push(
    JSON.stringify({
      deno2_entrypoint_path: data.metadata?.entrypoint_path ?? 'index.ts',
      entrypoint_path: data.metadata?.entrypoint_path ?? 'index.ts',
      import_map_path: data.metadata?.import_map_path ?? null,
    })
  )
  push('\r\n')

  // one part per file (with filename -> parsed as a file)
  for (const f of data.files ?? []) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="file"; filename="${f.name.replace(/"/g, '')}"\r\n`)
    push('Content-Type: application/typescript\r\n\r\n')
    push(f.content)
    push('\r\n')
  }
  push(`--${boundary}--\r\n`)

  res.setHeader('Content-Type', `multipart/form-data; boundary=${boundary}`)
  return res.status(200).send(Buffer.concat(chunks))
}
