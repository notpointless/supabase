import { PermissionAction } from '@supabase/shared-types/out/constants'
import { useState } from 'react'
import { Badge, Button, Card, CardContent, CardFooter } from 'ui'
import { Input as PasswordInput } from 'ui-patterns/DataInputs/Input'
import { Admonition } from 'ui-patterns/admonition'

import {
  useClearOrgAIKeyMutation,
  useOrgAIConfigQuery,
  useOrgAIModelsQuery,
  useSetOrgAIKeyMutation,
} from '@/data/organizations/org-ai-config'
import { useAsyncCheckPermissions } from '@/hooks/misc/useCheckPermissions'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'

// [console fork] Organization-level OpenAI API key for the AI Assistant. Each org provides its own
// key so the Assistant (SQL generation, RLS policies, etc.) runs on the org's own OpenAI account.
// The key is write-only — we only ever show whether one is configured.
export const AIAssistantForm = () => {
  const { data: organization } = useSelectedOrganizationQuery()
  const slug = organization?.slug
  const { can: canUpdate } = useAsyncCheckPermissions(PermissionAction.UPDATE, 'organizations')

  const { data: config, isLoading } = useOrgAIConfigQuery(slug)
  const configured = !!config?.configured
  const { data: modelsData } = useOrgAIModelsQuery(slug, { enabled: configured })
  const models = modelsData?.models ?? []

  const { mutate: saveKey, isPending: isSaving } = useSetOrgAIKeyMutation(slug)
  const { mutate: clearKey, isPending: isClearing } = useClearOrgAIKeyMutation(slug)

  const [keyInput, setKeyInput] = useState('')

  const onSave = () => {
    if (!keyInput.trim()) return
    saveKey(keyInput.trim(), { onSuccess: () => setKeyInput('') })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-y-4 pt-6">
        <div className="flex flex-col gap-y-1">
          <div className="flex items-center gap-x-2">
            <p className="text-sm text-foreground">OpenAI API key</p>
            {!isLoading && (
              <Badge variant={configured ? 'success' : 'default'}>
                {configured ? 'Configured' : 'Not configured'}
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground-light">
            Provide your organization's OpenAI API key to enable the AI Assistant for every project
            in this organization. The key is stored encrypted and never shown again.
          </p>
        </div>

        <PasswordInput
          type="password"
          autoComplete="off"
          placeholder={configured ? 'A key is configured — enter a new one to replace it' : 'sk-...'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          disabled={!canUpdate || isSaving}
        />

        {configured && models.length > 0 && (
          <Admonition type="default" title={`${models.length} models available`}>
            <p className="text-xs text-foreground-light">
              Models the Assistant can use from your OpenAI account: {models.slice(0, 12).join(', ')}
              {models.length > 12 ? `, +${models.length - 12} more` : ''}
            </p>
          </Admonition>
        )}

        {!canUpdate && (
          <p className="text-sm text-foreground-lighter">
            You need additional permissions to manage this organization's AI settings.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-x-2 p-4 md:px-8">
        {configured && (
          <Button
            type="default"
            disabled={!canUpdate || isClearing}
            loading={isClearing}
            onClick={() => clearKey()}
          >
            Remove key
          </Button>
        )}
        <Button
          type="primary"
          disabled={!canUpdate || isSaving || !keyInput.trim()}
          loading={isSaving}
          onClick={onSave}
        >
          Save key
        </Button>
      </CardFooter>
    </Card>
  )
}
