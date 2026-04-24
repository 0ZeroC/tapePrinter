import { buildSchemaPrompt } from './schema'
import { validateAssistantSql } from './sql-guard'
import { runReadonlySelect } from './query'
import { completeChat, type ChatMessage } from './llm'
import { getResolvedAssistantConfig, isAssistantConfigured } from './config'

export interface AssistantEvidence {
  sql: string
  rowCount: number
  rows: Record<string, unknown>[]
  note?: string
}

export interface AssistantChatResult {
  answer: string
  evidence: AssistantEvidence | null
  error?: string
}

function extractJsonWithSql(text: string): { sql: string; note?: string } {
  const t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const inner = fence ? fence[1].trim() : t
  const start = inner.indexOf('{')
  const end = inner.lastIndexOf('}')
  const slice = start >= 0 && end > start ? inner.slice(start, end + 1) : inner
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch {
    throw new Error('模型未返回合法 JSON，请重试或换模型')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模型 JSON 格式错误')
  }
  const sql = (parsed as { sql?: unknown }).sql
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('模型未给出 sql 字段')
  }
  const note = (parsed as { note?: unknown }).note
  return {
    sql: sql.trim(),
    note: typeof note === 'string' ? note : undefined
  }
}

function trimMessages(messages: ChatMessage[], maxPairs = 6): ChatMessage[] {
  if (messages.length <= maxPairs * 2 + 1) return messages
  const sys = messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages[0]?.role === 'system' ? messages.slice(1) : messages
  const tail = rest.slice(-(maxPairs * 2))
  return [...sys, ...tail]
}

export async function runAssistantChat(
  userMessages: { role: 'user' | 'assistant'; content: string }[],
  canViewInventory: boolean
): Promise<AssistantChatResult> {
  const config = getResolvedAssistantConfig()
  if (!isAssistantConfigured(config)) {
    return {
      answer: '',
      evidence: null,
      error: '尚未配置 AI（请管理员在「AI 设置」中填写模型与密钥或 Ollama 地址）'
    }
  }

  const schemaPrompt = buildSchemaPrompt(canViewInventory)
  const lastUser = [...userMessages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content?.trim()) {
    return { answer: '', evidence: null, error: '请输入问题' }
  }

  const convoForSql: ChatMessage[] = trimMessages(
    [
      { role: 'system', content: schemaPrompt },
      ...userMessages.map((m) => ({ role: m.role, content: m.content }))
    ],
    6
  )

  let sqlRaw: string
  let note: string | undefined
  try {
    const out1 = await completeChat(config, convoForSql)
    ;({ sql: sqlRaw, note } = extractJsonWithSql(out1))
  } catch (e) {
    return {
      answer: '',
      evidence: null,
      error: (e as Error).message || '生成查询失败'
    }
  }

  const checked = validateAssistantSql(sqlRaw, canViewInventory)
  if (!checked.ok) {
    return {
      answer: '',
      evidence: null,
      error: `SQL 未通过校验：${checked.error}`
    }
  }

  let rows: Record<string, unknown>[]
  let rowCount: number
  try {
    const q = runReadonlySelect(checked.sql)
    rows = q.rows
    rowCount = q.rowCount
  } catch (e) {
    return {
      answer: '',
      evidence: { sql: checked.sql, rowCount: 0, rows: [], note },
      error: `执行查询失败：${(e as Error).message}`
    }
  }

  const rowsForModel = rows.slice(0, 80)
  const summarySystem = `你是库存与配货业务助手。请严格根据下面提供的「查询结果」用中文回答用户问题；不得编造数字。若结果为空，说明无数据。可简要说明依据来自 SQL 查询。`
  const summaryUser = `用户问题：${lastUser.content}

执行的 SQL：
${checked.sql}

查询行数：${rowCount}

结果（最多 80 行 JSON）：
${JSON.stringify(rowsForModel, null, 0)}`

  let answer: string
  try {
    answer = await completeChat(config, [
      { role: 'system', content: summarySystem },
      { role: 'user', content: summaryUser }
    ])
  } catch (e) {
    return {
      answer: '',
      evidence: { sql: checked.sql, rowCount, rows: rows.slice(0, 30), note },
      error: `总结答案失败：${(e as Error).message}`
    }
  }

  return {
    answer: answer.trim(),
    evidence: {
      sql: checked.sql,
      rowCount,
      rows: rows.slice(0, 50),
      note
    }
  }
}
