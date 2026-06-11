import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch, consoleGet } from '@/lib/console-bff'

// [console fork] The Storage settings page (file size limit, image transformation, S3 protocol,
// analytics + vector buckets). Supabase keeps this in its platform DB; we store the overrides on
// the project in the control-plane (so buildStack can apply fileSizeLimit -> FILE_SIZE_LIMIT on
// the storage container) and deep-merge over sensible self-host defaults here. Forwarding edits
// to the backend (which persists + reconfigures) — same model as auth-config.
//
// Self-host policy: nothing is plan-gated, so image transformation + S3 protocol are available.
// Vector buckets are ON for every project (the stack runs storage's pgvector-backed vector
// store — no AWS needed). Analytics (Iceberg) is EC2-only: storage's Iceberg catalog proxies
// AWS S3 Tables with sigv4, which shared local projects can't reach — the GET below flips it
// on for dedicated projects.
const DEFAULT = {
  fileSizeLimit: 52428800,
  features: {
    imageTransformation: { enabled: true },
    s3Protocol: { enabled: true },
    icebergCatalog: { enabled: false, maxCatalogs: 2 },
    vectorBuckets: { enabled: true },
  },
  capabilities: { list_v2: true },
  external: { upstreamTarget: 'main' },
}

type StorageConfig = typeof DEFAULT & Record<string, unknown>

// Deep-merge so a PATCH of just `{ features: { vectorBuckets: { enabled: true } } }` keeps the
// other feature flags intact.
function deepMerge<T extends Record<string, any>>(base: T, override: Record<string, any>): T {
  const out: Record<string, any> = Array.isArray(base) ? [...base] : { ...base }
  for (const [key, value] of Object.entries(override ?? {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object'
    ) {
      out[key] = deepMerge(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out as T
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')

  if (req.method === 'GET') {
    const [{ data: overrides }, { data: proj }] = await Promise.all([
      consoleGet<Record<string, unknown>>(req, `/api/v1/projects/${ref}/storage-config`),
      consoleGet<{ infrastructureType?: string }>(req, `/api/v1/projects/${ref}`),
    ])
    // Iceberg analytics buckets need AWS (S3 Tables catalog) — EC2-only.
    const isDedicated = !!proj?.infrastructureType && proj.infrastructureType !== 'shared'
    const base = deepMerge(DEFAULT, {
      features: { icebergCatalog: { enabled: isDedicated } },
    })
    return res.status(200).json(deepMerge(base, overrides ?? {}) as StorageConfig)
  }
  if (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST') {
    const { ok, status, data: merged } = await consoleFetch<Record<string, unknown>>(
      req,
      `/api/v1/projects/${ref}/storage-config`,
      { method: 'PATCH', body: JSON.stringify(req.body ?? {}) }
    )
    if (!ok) {
      return res
        .status(status || 500)
        .json({ error: { message: 'Failed to update storage configuration' } })
    }
    return res.status(200).json(deepMerge(DEFAULT, merged ?? {}) as StorageConfig)
  }
  res.setHeader('Allow', ['GET', 'PATCH'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}
