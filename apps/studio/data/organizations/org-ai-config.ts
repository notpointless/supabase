import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { constructHeaders, fetchHandler } from '@/data/fetchers'
import { BASE_PATH } from '@/lib/constants'

// [console fork] Per-org AI assistant config (the org's OpenAI API key) — talks to the console
// BFF at /platform/organizations/{slug}/ai-config. The key is write-only (status is a boolean).

const base = (slug: string) => `${BASE_PATH}/api/platform/organizations/${slug}/ai-config`

async function jsonOrThrow(res: Response) {
  let body: any = null
  try {
    body = await res.json()
  } catch {}
  if (!res.ok) throw new Error(body?.error?.message ?? body?.message ?? `Request failed (${res.status})`)
  return body
}

// --- status ---------------------------------------------------------------
export type OrgAIConfig = { configured: boolean; updatedAt: string | null }

export const orgAiConfigKeys = {
  config: (slug?: string) => ['organization', slug, 'ai-config'] as const,
  models: (slug?: string) => ['organization', slug, 'ai-models'] as const,
}

export const useOrgAIConfigQuery = (slug?: string, opts: { enabled?: boolean } = {}) =>
  useQuery<OrgAIConfig>({
    queryKey: orgAiConfigKeys.config(slug),
    queryFn: async ({ signal }) => {
      const headers = await constructHeaders()
      return jsonOrThrow(await fetchHandler(base(slug!), { headers, signal }))
    },
    enabled: !!slug && (opts.enabled ?? true),
  })

// --- set / clear ----------------------------------------------------------
export const useSetOrgAIKeyMutation = (slug?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (openaiApiKey: string) => {
      const headers = await constructHeaders({ 'Content-Type': 'application/json' })
      return jsonOrThrow(
        await fetchHandler(base(slug!), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ openaiApiKey }),
        })
      )
    },
    onSuccess: () => {
      toast.success('OpenAI API key saved')
      qc.invalidateQueries({ queryKey: orgAiConfigKeys.config(slug) })
      qc.invalidateQueries({ queryKey: orgAiConfigKeys.models(slug) })
    },
    onError: (e: Error) => toast.error(`Failed to save key: ${e.message}`),
  })
}

export const useClearOrgAIKeyMutation = (slug?: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const headers = await constructHeaders()
      return jsonOrThrow(await fetchHandler(base(slug!), { method: 'DELETE', headers }))
    },
    onSuccess: () => {
      toast.success('OpenAI API key removed')
      qc.invalidateQueries({ queryKey: orgAiConfigKeys.config(slug) })
      qc.invalidateQueries({ queryKey: orgAiConfigKeys.models(slug) })
    },
    onError: (e: Error) => toast.error(`Failed to remove key: ${e.message}`),
  })
}

// --- dynamic model list ---------------------------------------------------
export const useOrgAIModelsQuery = (slug?: string, opts: { enabled?: boolean } = {}) =>
  useQuery<{ models: string[] }>({
    queryKey: orgAiConfigKeys.models(slug),
    queryFn: async ({ signal }) => {
      const headers = await constructHeaders()
      return jsonOrThrow(await fetchHandler(`${base(slug!)}/models`, { headers, signal }))
    },
    enabled: !!slug && (opts.enabled ?? true),
  })
