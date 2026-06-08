import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

import { BASE_PATH } from '@/lib/constants'
import type { ResponseError } from '@/types'

export type GitHubAppConfig = {
  configured: boolean
  app_name?: string
  client_id?: string
}

export type GitHubAppVariables = { slug?: string }

export async function getGitHubApp({ slug }: GitHubAppVariables, signal?: AbortSignal) {
  if (!slug) throw new Error('slug is required')
  const res = await fetch(`${BASE_PATH}/api/platform/organizations/${slug}/github-app`, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Failed to load GitHub App configuration')
  }
  return (await res.json()) as GitHubAppConfig
}

export const githubAppKeys = {
  config: (slug?: string) => ['organizations', slug, 'github-app'] as const,
}

export const useGitHubAppQuery = <TData = GitHubAppConfig>(
  { slug }: GitHubAppVariables,
  options: Omit<UseQueryOptions<GitHubAppConfig, ResponseError, TData>, 'queryKey' | 'queryFn'> = {}
) =>
  useQuery<GitHubAppConfig, ResponseError, TData>({
    queryKey: githubAppKeys.config(slug),
    queryFn: ({ signal }) => getGitHubApp({ slug }, signal),
    enabled: typeof slug !== 'undefined',
    ...options,
  })
