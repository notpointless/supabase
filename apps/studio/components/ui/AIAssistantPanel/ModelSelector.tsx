import { Check, ChevronsUpDown } from 'lucide-react'
import { useRouter } from 'next/router'
import { useState } from 'react'
import {
  Badge,
  Button,
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from 'ui'

import { useCheckEntitlements } from '@/hooks/misc/useCheckEntitlements'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { useOrgAIModelsQuery } from '@/data/organizations/org-ai-config'
import { ASSISTANT_MODELS, isAdvanceOnlyModelId } from '@/lib/ai/model.utils'
import type { AssistantModelId } from '@/lib/ai/model.utils'

interface ModelSelectorProps {
  selectedModel: AssistantModelId
  onSelectModel: (model: AssistantModelId) => void
}

export const ModelSelector = ({ selectedModel, onSelectModel }: ModelSelectorProps) => {
  const router = useRouter()
  const { data: organization } = useSelectedOrganizationQuery()
  const { hasAccess: hasAccessToAdvanceModel, isLoading: isLoadingEntitlements } =
    useCheckEntitlements('assistant.advance_model')

  const [open, setOpen] = useState(false)

  const slug = organization?.slug ?? '_'

  // [console fork] When the org has its own OpenAI key, list the models it actually exposes
  // (fetched live) instead of the fixed built-in list — and skip plan gating (it's the org's
  // own account). The chosen id is passed straight through to the Assistant request.
  const { data: orgModels } = useOrgAIModelsQuery(organization?.slug)
  const dynamicModels = orgModels?.models ?? []
  const useDynamic = dynamicModels.length > 0

  const upgradeHref = `/org/${slug}/billing?panel=subscriptionPlan&source=ai-assistant-model`

  const handleSelectModel = (modelId: AssistantModelId) => {
    if (isLoadingEntitlements && isAdvanceOnlyModelId(modelId)) {
      return
    }
    if (isAdvanceOnlyModelId(modelId) && !hasAccessToAdvanceModel) {
      setOpen(false)
      void router.push(upgradeHref)
      return
    }

    onSelectModel(modelId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="default"
          className="text-foreground-light"
          iconRight={<ChevronsUpDown strokeWidth={1} size={12} />}
        >
          {selectedModel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56 max-h-80 overflow-auto" align="start" side="top">
        <Command>
          <CommandList>
            <CommandGroup>
              {useDynamic
                ? dynamicModels.map((id) => (
                    <CommandItem
                      key={id}
                      value={id}
                      onSelect={() => {
                        onSelectModel(id as AssistantModelId)
                        setOpen(false)
                      }}
                      className="flex justify-between"
                    >
                      <span>{id}</span>
                      {selectedModel === id && <Check className="h-3.5 w-3.5" />}
                    </CommandItem>
                  ))
                : ASSISTANT_MODELS.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      disabled={isLoadingEntitlements && isAdvanceOnlyModelId(m.id)}
                      onSelect={() => handleSelectModel(m.id)}
                      className="flex justify-between"
                    >
                      <span>{m.id}</span>
                      {isAdvanceOnlyModelId(m.id) &&
                      !hasAccessToAdvanceModel &&
                      !isLoadingEntitlements ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Badge role="button" variant="warning">
                                Upgrade
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {m.id} is available on Pro plans and above
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        selectedModel === m.id && <Check className="h-3.5 w-3.5" />
                      )}
                    </CommandItem>
                  ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
