import { ASSISTANT_TABLES_ALL, ASSISTANT_TABLES_NO_INVENTORY } from './schema'

const MAX_LIMIT = 500

const FORBIDDEN = [
  /\bpragma\b/i,
  /\battach\b/i,
  /\bdetach\b/i,
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\bcreate\b/i,
  /\balter\b/i,
  /\btruncate\b/i,
  /\breplace\s+into\b/i,
  /\bvacuum\b/i,
  /\brollback\b/i,
  /\bcommit\b/i,
  /\bbegin\b/i,
  /\bsavepoint\b/i,
  /\brelease\b/i,
  /\bexplain\b/i,
  /\bwith\s+recursive\b/i
]

function stripSqlComments(sql: string): string {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ')
  s = s.replace(/--[^\n]*/g, ' ')
  return s
}

/** 去掉字符串字面量，便于关键词检测 */
function stripStringLiterals(sql: string): string {
  let s = sql
  s = s.replace(/'([^']|'')*'/g, ' ')
  s = s.replace(/"([^"]|"")*"/g, ' ')
  return s
}

function extractTableCandidates(sqlNoStrings: string): Set<string> {
  const set = new Set<string>()
  const re = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sqlNoStrings)) !== null) {
    const name = m[1].toLowerCase()
    if (name !== 'select' && name !== 'where' && name !== 'on' && name !== 'and' && name !== 'or') {
      set.add(name)
    }
  }
  return set
}

export interface SqlGuardResult {
  ok: true
  sql: string
}

export interface SqlGuardError {
  ok: false
  error: string
}

export function validateAssistantSql(
  raw: string,
  canViewInventory: boolean
): SqlGuardResult | SqlGuardError {
  let sql = raw.trim()
  if (!sql) {
    return { ok: false, error: 'SQL 为空' }
  }
  sql = sql.replace(/^\uFEFF/, '')
  const parts = sql.split(';').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    return { ok: false, error: '不允许多条 SQL 语句' }
  }
  sql = parts[0] || sql.replace(/;\s*$/, '')
  sql = stripSqlComments(sql).trim()
  if (!sql) {
    return { ok: false, error: 'SQL 为空' }
  }

  if (!/^\s*select\b/i.test(sql)) {
    return { ok: false, error: '只允许 SELECT 查询' }
  }

  const stripped = stripStringLiterals(sql)
  for (const re of FORBIDDEN) {
    if (re.test(stripped)) {
      return { ok: false, error: 'SQL 包含不允许的关键字' }
    }
  }
  if (/\bsqlite_/i.test(stripped)) {
    return { ok: false, error: '禁止访问 sqlite_ 系统对象' }
  }
  if (/\busers\b/i.test(stripped) || /\bapp_meta\b/i.test(stripped)) {
    return { ok: false, error: '禁止访问该表' }
  }

  const allowed = new Set<string>(
    canViewInventory
      ? [...ASSISTANT_TABLES_ALL]
      : [...ASSISTANT_TABLES_NO_INVENTORY]
  )
  const candidates = extractTableCandidates(stripped)
  for (const t of candidates) {
    if (!allowed.has(t)) {
      return { ok: false, error: `不允许使用表: ${t}` }
    }
  }

  if (!/\blimit\s+\d+/i.test(sql)) {
    sql = `${sql.replace(/;\s*$/, '')} LIMIT ${MAX_LIMIT}`
  } else {
    const lim = sql.match(/\blimit\s+(\d+)/i)
    if (lim && parseInt(lim[1], 10) > MAX_LIMIT) {
      sql = sql.replace(/\blimit\s+\d+/i, `LIMIT ${MAX_LIMIT}`)
    }
  }

  return { ok: true, sql }
}
