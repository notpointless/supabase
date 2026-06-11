import { NextApiRequest, NextApiResponse } from 'next'

import { consoleFetch, getProjectDataPlane } from '@/lib/console-bff'

// [console fork] Analytics / Logs endpoints.
//
// Each project's stack runs its own single-tenant Logflare (the `analytics` service, Postgres
// backed) plus a `vector` shipper. The browser's `data/` layer calls these `/platform/.../
// analytics/endpoints/<name>` routes; this BFF translates them into the project's Logflare via
// the control-plane proxy (`/api/v1/projects/:ref/analytics/query/:name`), which holds the
// project's private Logflare token. Two shapes:
//   - logs.all / logs.all.otel: the dashboard sends its OWN SQL (logs explorer, reports,
//     edge-function stats). We forward it verbatim and return Logflare's result.
//   - usage.* / service-health: the dashboard sends semantic params (interval, timestamps), and
//     Supabase Cloud's platform turns those into SQL. The self-host Logflare seeds those named
//     endpoints as BigQuery SQL that fails on the Postgres backend, so instead we fetch raw rows
//     (which Logflare answers reliably) and aggregate here, returning the exact shape each chart
//     expects.
//   - auth.metrics: derived from the project's own auth.users (no log pipeline needed).
// Anything else degrades to an honest empty series rather than erroring the chart.

type Row = Record<string, unknown>

const ok = (res: NextApiResponse, result: Row[]) => res.status(200).json({ result, error: null })

/** Run arbitrary analytics SQL against the project's Logflare (POST so large SQL survives). */
async function runLogflareSql(
  req: NextApiRequest,
  ref: string,
  sql: string,
  extra: Record<string, string | undefined> = {}
): Promise<Row[]> {
  const { data } = await consoleFetch<{ result?: Row[] }>(
    req,
    `/api/v1/projects/${encodeURIComponent(ref)}/analytics/query/logs.all`,
    { method: 'POST', body: JSON.stringify({ sql, ...extra }) }
  )
  return Array.isArray(data?.result) ? (data!.result as Row[]) : []
}

/** Run a read-only SQL statement against the project's postgres-meta `/query` endpoint. */
async function runPgSql(
  dp: { baseUrl: string; serviceKey: string },
  query: string
): Promise<Row[] | null> {
  try {
    const upstream = await fetch(`${dp.baseUrl}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: dp.serviceKey,
        Authorization: `Bearer ${dp.serviceKey}`,
      },
      body: JSON.stringify({ query }),
    })
    if (!upstream.ok) return null
    const body = await upstream.json()
    return Array.isArray(body) ? (body as Row[]) : null
  } catch {
    return null
  }
}

// Logflare stores timestamps as microseconds since the epoch.
const usToMs = (us: unknown): number => Math.floor(Number(us) / 1000)

// Real auth metrics from the project's `auth.users` table (the Auth Overview).
async function authMetrics(dp: { baseUrl: string; serviceKey: string }): Promise<Row[]> {
  const rows = await runPgSql(
    dp,
    `select
       count(*)::int as active_users,
       count(*) filter (where created_at >= now() - interval '7 days')::int as sign_up_count
     from auth.users`
  )
  const r = rows?.[0] ?? {}
  const row = (period: 'current' | 'previous', activeUsers: number, signUps: number): Row => ({
    period,
    active_users: activeUsers,
    api_error_requests: 0,
    api_total_requests: 0,
    auth_total_errors: 0,
    auth_total_requests: 0,
    password_reset_requests: 0,
    sign_up_count: signUps,
  })
  return [
    row('current', Number(r.active_users ?? 0), Number(r.sign_up_count ?? 0)),
    row('previous', 0, 0),
  ]
}

// usage.api-counts: requests per time bucket, split by service, derived from the edge (Kong)
// logs which see every request path. Matches the UsageApiCounts shape the dashboard expects.
async function apiCounts(req: NextApiRequest, ref: string, interval?: string): Promise<Row[]> {
  const minutely = (interval ?? '').toLowerCase().includes('min')
  const bucketMs = minutely ? 60_000 : 3_600_000
  const rows = await runLogflareSql(
    req,
    ref,
    `select edge_logs.timestamp, request.path as path
     from edge_logs
     cross join unnest(metadata) as m
     cross join unnest(m.request) as request
     order by timestamp desc
     limit 10000`
  )
  const buckets = new Map<number, { rest: number; auth: number; storage: number; realtime: number }>()
  for (const r of rows) {
    const ms = usToMs(r.timestamp)
    if (!Number.isFinite(ms)) continue
    const b = Math.floor(ms / bucketMs) * bucketMs
    const cur = buckets.get(b) ?? { rest: 0, auth: 0, storage: 0, realtime: 0 }
    const path = String(r.path ?? '')
    if (path.startsWith('/rest')) cur.rest++
    else if (path.startsWith('/auth')) cur.auth++
    else if (path.startsWith('/storage')) cur.storage++
    else if (path.startsWith('/realtime')) cur.realtime++
    buckets.set(b, cur)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, c]) => ({
      timestamp: new Date(b).toISOString(),
      total_rest_requests: c.rest,
      total_auth_requests: c.auth,
      total_storage_requests: c.storage,
      total_realtime_requests: c.realtime,
    }))
}

// service-health: per-source activity + error counts. Logflare answers simple count(*) reliably;
// we count total per source and (for the edge gateway) errors via 5xx status, then shape it the
// way ProjectServiceHealthResponse expects. Sources with no traffic report zeros (healthy/idle).
const HEALTH_SOURCES: Array<[keyof ServiceRow, string]> = [
  ['edge_logs', 'edge_logs'],
  ['function_edge_logs', 'function_edge_logs'],
  ['storage_logs', 'storage_logs'],
  ['postgres_logs', 'postgres_logs'],
  ['auth_logs', 'auth_logs'],
  ['postgrest_logs', 'postgrest_logs'],
  ['realtime_logs', 'realtime_logs'],
]
type ServiceData = { error: number; ok: number; warning: number; total: number }
type ServiceRow = Record<string, ServiceData>
const zero = (): ServiceData => ({ error: 0, ok: 0, warning: 0, total: 0 })

async function serviceHealth(req: NextApiRequest, ref: string): Promise<Row[]> {
  const counts = await Promise.all(
    HEALTH_SOURCES.map(async ([, source]) => {
      const rows = await runLogflareSql(req, ref, `select count(*) as count from ${source}`)
      return Number(rows?.[0]?.count ?? 0)
    })
  )
  // edge gateway 5xx → errors
  let edgeErrors = 0
  try {
    const er = await runLogflareSql(
      req,
      ref,
      `select count(*) as count from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as response where response.status_code >= 500`
    )
    edgeErrors = Number(er?.[0]?.count ?? 0)
  } catch {
    /* ignore */
  }
  const row: ServiceRow = {
    postgres_logs: zero(),
    auth_logs: zero(),
    function_edge_logs: zero(),
    storage_logs: zero(),
    realtime_logs: zero(),
    postgrest_logs: zero(),
    edge_logs: zero(),
    supavisor_logs: zero(),
    function_logs: zero(),
    etl_replication_logs: zero(),
  }
  HEALTH_SOURCES.forEach(([key], i) => {
    const total = counts[i]
    row[key] = { total, ok: total, warning: 0, error: 0 }
  })
  if (row.edge_logs) {
    row.edge_logs.error = edgeErrors
    row.edge_logs.ok = Math.max(0, row.edge_logs.total - edgeErrors)
  }
  return [{ timestamp: new Date().toISOString(), ...row }]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ref = String(req.query.ref ?? '')
  const name = String(req.query.name ?? '')

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  try {
    // The logs explorer / reports / edge-function stats send their own SQL — forward verbatim.
    if (name === 'logs.all' || name === 'logs.all.otel') {
      const src = req.method === 'POST' ? (req.body ?? {}) : req.query
      const sql = String((src as any).sql ?? '')
      if (!sql) return ok(res, [])
      const result = await runLogflareSql(req, ref, sql, {
        iso_timestamp_start: (src as any).iso_timestamp_start
          ? String((src as any).iso_timestamp_start)
          : undefined,
        iso_timestamp_end: (src as any).iso_timestamp_end
          ? String((src as any).iso_timestamp_end)
          : undefined,
      })
      return ok(res, result)
    }

    if (name === 'usage.api-requests-count') {
      const rows = await runLogflareSql(req, ref, `select count(*) as count from edge_logs`)
      return ok(res, [{ count: Number(rows?.[0]?.count ?? 0) }])
    }

    if (name === 'usage.api-counts') {
      return ok(res, await apiCounts(req, ref, req.query.interval ? String(req.query.interval) : undefined))
    }

    if (name === 'service-health') {
      return ok(res, await serviceHealth(req, ref))
    }

    if (name === 'auth.metrics') {
      const dp = await getProjectDataPlane(req, ref)
      if (!dp) return ok(res, [])
      return ok(res, await authMetrics(dp))
    }

    // functions.* (the live chart uses logs.all) and anything else: honest empty series.
    return ok(res, [])
  } catch (err: any) {
    // Never error the chart — degrade to empty.
    return ok(res, [])
  }
}
