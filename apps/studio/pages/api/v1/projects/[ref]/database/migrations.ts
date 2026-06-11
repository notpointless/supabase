import { NextApiRequest, NextApiResponse } from 'next'

import { bff, getProjectDataPlane } from '@/lib/console-bff'

// [console fork] Database migrations (Management-API shape), served from the project's own
// `supabase_migrations.schema_migrations` table — the same table the GitHub deploy pipeline
// and branch merge write to. GET lists applied migrations; PUT applies a new migration
// (runs the SQL + records the version in one transaction) — the dashboard's branch-merge
// flow calls this. Works for shared + EC2 (both go through the project's Kong/pg-meta).

type DataPlane = { baseUrl: string; serviceKey: string }

async function runPg(dp: DataPlane, query: string): Promise<{ ok: boolean; body: any }> {
  const upstream = await fetch(`${dp.baseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: dp.serviceKey,
      Authorization: `Bearer ${dp.serviceKey}`,
    },
    body: JSON.stringify({ query }),
  })
  const text = await upstream.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { ok: upstream.ok, body }
}

const ENSURE_TABLE = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], inserted_at timestamptz default now());`

const quote = (v: string | null | undefined) =>
  v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`

export default bff({
  GET: async (req: NextApiRequest, res: NextApiResponse) => {
    const ref = String(req.query.ref ?? '')
    const dp = await getProjectDataPlane(req, ref)
    if (!dp) return res.status(200).json([])
    const { ok, body } = await runPg(
      dp,
      `select version, name from supabase_migrations.schema_migrations order by version asc`
    )
    // Projects created before the migrations init script won't have the table — empty list.
    return res.status(200).json(ok && Array.isArray(body) ? body : [])
  },
  PUT: async (req: NextApiRequest, res: NextApiResponse) => {
    const ref = String(req.query.ref ?? '')
    const { query, name } = (req.body ?? {}) as { query?: string; name?: string }
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: { message: 'query is required' } })
    }
    const dp = await getProjectDataPlane(req, ref)
    if (!dp) return res.status(503).json({ error: { message: 'Project is not running' } })

    await runPg(dp, ENSURE_TABLE)
    // Version format matches the CLI/deploy pipeline: yyyyMMddHHmmss (UTC).
    const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const stmt = `begin;
${query}
;
insert into supabase_migrations.schema_migrations(version, name, statements)
values (${quote(version)}, ${quote(name ?? null)}, array[${quote(query)}])
on conflict (version) do nothing;
commit;`
    const { ok, body } = await runPg(dp, stmt)
    if (!ok) {
      const message =
        (body && typeof body === 'object' && (body.message || body.error)) ||
        'Failed to apply migration'
      return res.status(400).json({ error: { message: String(message) } })
    }
    return res.status(200).json({ version, name: name ?? null })
  },
})
