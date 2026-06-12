import { openai, createOpenAI } from '@ai-sdk/openai'
import { LanguageModel } from 'ai'

import { checkAwsCredentials, createRoutedBedrock } from './bedrock'
import {
  BedrockModel,
  getDefaultModelForProvider,
  Model,
  OpenAIModelEntry,
  OpenAIModelId,
  ProviderModelConfig,
  PROVIDERS,
} from './model.utils'

type ProviderOptions = Record<string, any>
type SystemProviderOptions = Record<string, any>

type ModelSuccess = {
  /** Spread directly into AI SDK calls: `streamText({ ...modelParams, ... })` */
  modelParams: { model: LanguageModel; providerOptions?: ProviderOptions }
  systemProviderOptions?: SystemProviderOptions
  error?: never
}

export type ModelError = {
  modelParams?: never
  systemProviderOptions?: never
  error: Error
}

type ModelResponse = ModelSuccess | ModelError

export type GetModelParams =
  | {
      provider: 'openai'
      /**
       * Specifies which OpenAI model to use and its reasoning effort.
       * Create entries via `openaiModelEntry()` — reasoning effort is validated against the model
       * at compile time. Use `DEFAULT_COMPLETION_MODEL` for simple endpoints (minimal reasoning).
       * Callers are responsible for resolving the correct entry (including throttling/entitlement
       * fallbacks) before calling getModel.
       */
      modelEntry: OpenAIModelEntry
      /**
       * [console fork] The organization's own OpenAI API key. When present, the model runs on the
       * org's OpenAI account (createOpenAI) instead of the global OPENAI_API_KEY env. Resolved
       * per-request from the control plane.
       */
      apiKey?: string
      /**
       * [console fork] An explicit model id chosen via the dynamic model picker (any id the org's
       * OpenAI account exposes). Overrides the static registry id; reasoning-effort provider
       * options are skipped for these since arbitrary models may not support them.
       */
      modelId?: string
    }
  | {
      provider: 'bedrock'
      /** Used for consistent hashing across Bedrock regions. */
      routingKey: string
    }

/**
 * Retrieves a LanguageModel from a specific provider and model entry.
 * Callers are responsible for resolving the correct model entry (including throttling/entitlement
 * fallbacks) before calling this function.
 * Returns systemProviderOptions that callers can attach to the system message.
 */
export async function getModel(params: GetModelParams): Promise<ModelResponse> {
  const { provider } = params

  const providerRegistry = PROVIDERS[provider]
  if (!providerRegistry) {
    return { error: new Error(`Unknown provider: ${provider}`) }
  }

  const models = providerRegistry.models as Record<Model, ProviderModelConfig>
  const modelEntry = params.provider === 'openai' ? params.modelEntry : undefined

  const useDefault = !modelEntry?.id || !models[modelEntry.id]

  const chosenModelId = useDefault ? getDefaultModelForProvider(provider) : modelEntry?.id

  if (provider === 'bedrock') {
    const hasAwsCredentials = await checkAwsCredentials()
    const hasAwsBedrockRoleArn = !!process.env.AWS_BEDROCK_ROLE_ARN
    if (!hasAwsBedrockRoleArn || !hasAwsCredentials) {
      return { error: new Error('AWS Bedrock credentials not available') }
    }
    const bedrock = createRoutedBedrock(params.routingKey)
    const model = await bedrock(chosenModelId as BedrockModel)
    const systemProviderOptions = (
      providerRegistry.models as Record<BedrockModel, ProviderModelConfig>
    )[chosenModelId as BedrockModel]?.systemProviderOptions
    return { modelParams: { model }, systemProviderOptions }
  }

  if (provider === 'openai') {
    // [console fork] Prefer the organization's own key (per-request) over the global env key.
    const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) {
      return {
        error: new Error(
          'No OpenAI API key configured. Add your organization’s OpenAI key in Organization settings → AI Assistant.'
        ),
      }
    }
    // Use the org's key when provided; otherwise the env-default provider.
    const provider_ = params.apiKey ? createOpenAI({ apiKey: params.apiKey }) : openai

    // A dynamically-picked model id (from the org's /models list) bypasses the static registry:
    // use it directly and skip reasoning-effort options that arbitrary models may not support.
    if (params.modelId) {
      return { modelParams: { model: provider_(params.modelId) } }
    }

    const baseProviderOptions = providerRegistry.providerOptions?.openai ?? {}
    const openaiProviderOptions = modelEntry?.reasoningEffort
      ? { ...baseProviderOptions, reasoningEffort: modelEntry.reasoningEffort }
      : baseProviderOptions
    return {
      modelParams: {
        model: provider_(chosenModelId as OpenAIModelId),
        providerOptions: { openai: openaiProviderOptions },
      },
      systemProviderOptions: models[chosenModelId as OpenAIModelId]?.systemProviderOptions,
    }
  }

  return { error: new Error(`Unsupported provider: ${provider}`) }
}
