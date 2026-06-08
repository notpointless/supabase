import type { NextApiRequest } from 'next'

import { bff, consoleFetch, consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] Per-organization SSO providers. SSO is org-scoped: every handler resolves the
// org from the {slug} and talks to /api/v1/organizations/{orgId}/sso, and the providerId is
// derived from the org id so each org maps to its own single provider.
//   GET    -> the org's SSO provider (or null)
//   POST   -> register a provider for this org
//   PUT    -> update it (delete + re-register the same providerId)
//   DELETE -> remove it
// NOTE: the SAML registration (form metadata -> better-auth samlConfig) can only be validated
// against a real identity provider. The plumbing is wired and any backend/IdP error surfaces
// verbatim instead of a 405.

const providerIdFor = (orgId: string) => `sso-${orgId}`

function registerBody(orgId: string, body: any) {
  const domains = (Array.isArray(body?.domains) ? body.domains : []).filter(Boolean)
  const samlConfig: Record<string, any> = {}
  if (body?.metadata_xml_url) samlConfig.metadataUrl = body.metadata_xml_url
  if (body?.metadata_xml_file) samlConfig.idpMetadata = { metadata: body.metadata_xml_file }
  return { providerId: providerIdFor(orgId), domain: domains[0] ?? '', samlConfig }
}

async function findProviderId(req: NextApiRequest, orgId: string): Promise<string | null> {
  const { data } = await consoleGet<any>(req, `/api/v1/organizations/${orgId}/sso`)
  const providers = Array.isArray(data) ? data : (data?.providers ?? [])
  return providers[0]?.providerId ?? providers[0]?.id ?? null
}

const fail = (res: any, status: number | undefined, data: any, fallback: string) =>
  res
    .status(status && status >= 400 ? status : 502)
    .json({ message: (data as any)?.error?.message ?? (data as any)?.message ?? fallback })

export default bff({
  GET: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } })

    const { data } = await consoleGet<any>(req, `/api/v1/organizations/${org.id}/sso`)
    const providers = Array.isArray(data) ? data : (data?.providers ?? [])
    const provider = providers[0]
    if (!provider) return res.status(200).json(null)

    return res.status(200).json({
      id: provider.id ?? provider.providerId,
      saml: provider.saml ?? null,
      domains: provider.domains ?? [],
      created_at: provider.createdAt ?? null,
    })
  },
  POST: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } })
    const { ok, status, data } = await consoleFetch(req, `/api/v1/organizations/${org.id}/sso`, {
      method: 'POST',
      body: JSON.stringify(registerBody(org.id, req.body)),
    })
    if (!ok) return fail(res, status, data, 'Failed to register SSO provider')
    return res.status(200).json(data ?? {})
  },
  PUT: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } })
    // better-auth's register doesn't upsert, so drop the existing provider first.
    const existing = await findProviderId(req, org.id)
    if (existing) {
      await consoleFetch(req, `/api/v1/organizations/${org.id}/sso/${encodeURIComponent(existing)}`, {
        method: 'DELETE',
      })
    }
    const { ok, status, data } = await consoleFetch(req, `/api/v1/organizations/${org.id}/sso`, {
      method: 'POST',
      body: JSON.stringify(registerBody(org.id, req.body)),
    })
    if (!ok) return fail(res, status, data, 'Failed to update SSO provider')
    return res.status(200).json(data ?? {})
  },
  DELETE: async (req, res) => {
    const org = await resolveOrg(req, String(req.query.slug ?? ''))
    if (!org) return res.status(404).json({ error: { message: 'Organization not found' } })
    const providerId = (await findProviderId(req, org.id)) ?? providerIdFor(org.id)
    const { ok, status, data } = await consoleFetch(
      req,
      `/api/v1/organizations/${org.id}/sso/${encodeURIComponent(providerId)}`,
      { method: 'DELETE' }
    )
    if (!ok) return fail(res, status, data, 'Failed to remove SSO provider')
    return res.status(200).json(data ?? {})
  },
})
