import { NextApiRequest, NextApiResponse } from 'next'

import { bff, getProjectDataPlane } from '@/lib/console-bff'

// [console fork] "Generate Types" — proxied to the project's own postgres-meta typescript
// generator (kong /pg/generators/typescript). Works for shared + EC2.
export default bff({
  GET: async (req: NextApiRequest, res: NextApiResponse) => {
    const ref = String(req.query.ref ?? '')
    const included = String(req.query.included_schemas ?? 'public')
    const dp = await getProjectDataPlane(req, ref)
    if (!dp) return res.status(200).json({ types: '' })

    const url = `${dp.baseUrl}/pg/generators/typescript?included_schemas=${encodeURIComponent(included)}`
    const upstream = await fetch(url, {
      headers: { apikey: dp.serviceKey, Authorization: `Bearer ${dp.serviceKey}` },
    })
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: { message: 'Failed to generate TypeScript types' } })
    }
    let types = await upstream.text()
    // pg-meta may return the source raw or as a JSON-encoded string — normalise to raw.
    if (types.startsWith('"')) {
      try {
        types = JSON.parse(types)
      } catch {
        /* keep raw */
      }
    }
    return res.status(200).json({ types })
  },
})
