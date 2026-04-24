import {
  getAssistantSettingsStored,
  type AssistantProvider,
  type AssistantSettingsStored
} from '../database'

export interface ResolvedAssistantConfig {
  provider: AssistantProvider
  openaiBaseUrl: string
  openaiApiKey: string
  model: string
  ollamaHost: string
}

function envProvider(): AssistantProvider | null {
  const p = (process.env.ASSISTANT_PROVIDER || '').toLowerCase()
  if (p === 'openai' || p === 'openai_compatible') return 'openai_compatible'
  if (p === 'ollama') return 'ollama'
  return null
}

function trimOrEmpty(s: unknown): string {
  return typeof s === 'string' ? s.trim() : ''
}

/** 应用内存储优先，缺省用环境变量 */
export function getResolvedAssistantConfig(): ResolvedAssistantConfig {
  const stored = getAssistantSettingsStored()
  const ep = envProvider()
  const provider: AssistantProvider =
    stored?.provider ?? ep ?? 'ollama'

  const openaiBaseUrl =
    trimOrEmpty(stored?.openai_base_url) ||
    trimOrEmpty(process.env.OPENAI_BASE_URL) ||
    'https://api.openai.com/v1'

  const openaiApiKey =
    trimOrEmpty(stored?.openai_api_key) || trimOrEmpty(process.env.OPENAI_API_KEY) || ''

  const model =
    trimOrEmpty(stored?.model) ||
    trimOrEmpty(process.env.ASSISTANT_MODEL) ||
    (provider === 'ollama' ? 'llama3.2' : 'gpt-4o-mini')

  const ollamaHost =
    trimOrEmpty(stored?.ollama_host) ||
    trimOrEmpty(process.env.OLLAMA_HOST) ||
    'http://127.0.0.1:11434'

  return {
    provider,
    openaiBaseUrl: openaiBaseUrl.replace(/\/$/, ''),
    openaiApiKey,
    model,
    ollamaHost: ollamaHost.replace(/\/$/, '')
  }
}

export function isAssistantConfigured(config: ResolvedAssistantConfig): boolean {
  if (config.provider === 'ollama') {
    return !!config.ollamaHost && !!config.model
  }
  return !!config.openaiBaseUrl && !!config.openaiApiKey && !!config.model
}

export function toPublicSettings(stored: AssistantSettingsStored | null): {
  provider: AssistantProvider
  openai_base_url: string
  model: string
  ollama_host: string
  api_key_configured: boolean
  api_key_hint: string
} {
  const key = trimOrEmpty(stored?.openai_api_key)
  const hint =
    key.length >= 4 ? `…${key.slice(-4)}` : key.length > 0 ? '已配置' : ''
  return {
    provider: stored?.provider ?? 'ollama',
    openai_base_url: trimOrEmpty(stored?.openai_base_url),
    model: trimOrEmpty(stored?.model),
    ollama_host: trimOrEmpty(stored?.ollama_host),
    api_key_configured: key.length > 0,
    api_key_hint: hint
  }
}

export function mergeAssistantPut(
  existing: AssistantSettingsStored | null,
  body: Partial<{
    provider: AssistantProvider
    openai_base_url: string
    openai_api_key: string
    model: string
    ollama_host: string
  }>
): AssistantSettingsStored {
  const newKey =
    body.openai_api_key !== undefined && trimOrEmpty(body.openai_api_key) !== ''
      ? trimOrEmpty(body.openai_api_key)
      : (existing?.openai_api_key ?? '')
  const next: AssistantSettingsStored = {
    provider: body.provider ?? existing?.provider ?? 'ollama',
    openai_base_url: trimOrEmpty(body.openai_base_url ?? existing?.openai_base_url),
    openai_api_key: newKey,
    model: trimOrEmpty(body.model ?? existing?.model),
    ollama_host: trimOrEmpty(body.ollama_host ?? existing?.ollama_host)
  }
  return next
}
