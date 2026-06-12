import type { NextApiRequest } from 'next'

import { consoleGet, resolveOrg } from '@/lib/console-bff'

// [console fork] Resolve the organization's own OpenAI API key for an AI request, server-side.
// The key lives encrypted in the control plane; we fetch the decrypted value over the BFF channel
// (the browser's session cookie is forwarded) and use it to run the Assistant on the org's own
// OpenAI account. The key is used only to construct the model provider here — it is never sent to
// the browser. Resolves the org from an explicit slug, or from a projectRef's owning org. Returns
// undefined when no org context / no key is configured (callers then fall back to OPENAI_API_KEY).
export async function getOrgOpenAIKey(
  req: NextApiRequest,
  ctx: { orgSlug?: string; projectRef?: string }
): Promise<string | undefined> {
  try {
    let orgId: string | undefined

    if (ctx.orgSlug) {
      const org = await resolveOrg(req, ctx.orgSlug)
      orgId = org?.id
    }
    if (!orgId && ctx.projectRef) {
      const { data } = await consoleGet<{ organizationId?: string }>(
        req,
        `/api/v1/projects/${encodeURIComponent(ctx.projectRef)}`
      )
      orgId = data?.organizationId
    }
    if (!orgId) return undefined

    const { data } = await consoleGet<{ openaiApiKey: string | null }>(
      req,
      `/api/v1/organizations/${encodeURIComponent(orgId)}/ai-config/key`
    )
    return data?.openaiApiKey ?? undefined
  } catch {
    return undefined
  }
}
