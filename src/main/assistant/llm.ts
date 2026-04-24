import type { ResolvedAssistantConfig } from './config'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

async function readResponseText(res: Response): Promise<string> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text.slice(0, 500) || `HTTP ${res.status}`)
  }
  return text
}

export async function completeChat(
  config: ResolvedAssistantConfig,
  messages: ChatMessage[]
): Promise<string> {
  if (config.provider === 'ollama') {
    const url = `${config.ollamaHost}/api/chat`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false
      })
    })
    const raw = await readResponseText(res)
    let parsed: { message?: { content?: string } }
    try {
      parsed = JSON.parse(raw) as { message?: { content?: string } }
    } catch {
      throw new Error('Ollama 返回非 JSON')
    }
    const content = parsed.message?.content
    if (!content) throw new Error('Ollama 未返回内容')
    return content
  }

  const base = config.openaiBaseUrl.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2
    })
  })
  const raw = await readResponseText(res)
  let parsed: { choices?: { message?: { content?: string } }[] }
  try {
    parsed = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }
  } catch {
    throw new Error('API 返回非 JSON')
  }
  const content = parsed.choices?.[0]?.message?.content
  if (!content) throw new Error('模型未返回内容')
  return content
}
