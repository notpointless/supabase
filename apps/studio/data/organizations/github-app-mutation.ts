import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'

import { BASE_PATH } from '@/lib/constants'
import type { ResponseError } from '@/types'
import { githubAppKeys, type GitHubAppConfig } from './github-app-query'

export type UpdateGitHubAppVariables = {
  slug: string
  appName: string
  clientId: string
  clientSecret: string
}

export async function updateGitHubApp({ slug, appName, clientId, clientSecret }: UpdateGitHubAppVariables) {
  const res = await fetch(`${BASE_PATH}/api/platform/organizations/${slug}/github-app`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appName, clientId, clientSecret }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Failed to save GitHub App credentials')
  }
  return (await res.json()) as GitHubAppConfig
}

export const useUpdateGitHubAppMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<GitHubAppConfig, ResponseError, UpdateGitHubAppVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<GitHubAppConfig, ResponseError, UpdateGitHubAppVariables>({
    mutationFn: updateGitHubApp,
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: githubAppKeys.config(variables.slug) })
      await onSuccess?.(data, variables, context)
    },
    onError(error, variables, context) {
      if (onError === undefined) {
        throw error
      } else {
        onError(error, variables, context)
      }
    },
    ...options,
  })
}
