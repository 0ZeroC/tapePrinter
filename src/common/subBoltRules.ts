import { BUILTIN_SUB_BOLT_RULES_CSV } from './builtinSubBoltRulesCsv'

/** 解析单行 CSV，支持 RFC4180 双引号字段（字段内逗号、换行除外） */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else if (ch === '"') {
      inQuotes = true
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function escapeCsvField(value: string): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function normalizeHeaderKey(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase()
}

type SubBoltColKey =
  | 'material'
  | 'desc'
  | 'bolt'
  | 'mother'
  | 'flat97'
  | 'flat95'
  | 'spring'
  | 'factor'

const COL_NONE = -1

type ColIdx = Record<SubBoltColKey, number>

function resolveSubBoltColumnIndices(headerRow: string[]): ColIdx {
  const idx: ColIdx = {
    material: COL_NONE,
    desc: COL_NONE,
    bolt: COL_NONE,
    mother: COL_NONE,
    flat97: COL_NONE,
    flat95: COL_NONE,
    spring: COL_NONE,
    factor: COL_NONE
  }
  const nHeaders = headerRow.map((h) => normalizeHeaderKey(h))
  const patterns: { field: SubBoltColKey; aliases: string[] }[] = [
    { field: 'material', aliases: ['物料号', '物料编码', '物料代码', '产品编码', 'materialcode', 'productcode', 'itemcode', '编码'] },
    { field: 'desc', aliases: ['物料描述', '描述', '名称规格', 'description', '名称'] },
    { field: 'bolt', aliases: ['栓编码', '螺栓编码', '螺栓', '栓', 'bolt', 'boltcode'] },
    { field: 'mother', aliases: ['母编码', '螺母编码', '螺母', '母', 'mother', 'mothercode'] },
    { field: 'flat97', aliases: ['平垫97编码', '平垫97', '97平垫', 'flat97'] },
    { field: 'flat95', aliases: ['平垫95编码', '平垫95', '95平垫', 'flat95'] },
    { field: 'spring', aliases: ['弹垫编码', '弹垫', '弹簧垫', 'spring', 'springcode'] },
    { field: 'factor', aliases: ['是否双平', '双平列', '双平', '平垫倍数', 'doubleflat', 'factor'] }
  ]
  for (const { field, aliases } of patterns) {
    for (const al of aliases) {
      const na = normalizeHeaderKey(al)
      const c = nHeaders.findIndex((h, i) => h === na && !Object.values(idx).includes(i))
      if (c >= 0) {
        idx[field] = c
        break
      }
    }
  }
  return idx
}

/**
 * 将 Excel / 任意列序 CSV 的首个工作表矩阵，转为系统使用的标准副转只 CSV（UTF-8、逗号分隔）。
 * 表头支持中文或英文别名；未识别列按空处理；「是否双平」缺省为 1。
 */
export function convertSpreadsheetMatrixToSubBoltRulesCsv(matrix: string[][]): {
  csv: string
  errors: string[]
} {
  const errors: string[] = []
  if (!matrix || matrix.length < 2) {
    errors.push('表格至少需要表头与一行数据')
    return { csv: '', errors }
  }
  const headerRow = (matrix[0] ?? []).map((c) => String(c ?? '').trim())
  const col = resolveSubBoltColumnIndices(headerRow)
  if (col.material < 0) {
    errors.push('未找到「物料号」或「物料编码」列，请对照模板检查表头')
    return { csv: '', errors }
  }
  const headerOut = SUB_BOLT_RULES_CSV_HEADER_LINE.replace(/,\s*$/, '').trim()
  const lines: string[] = [headerOut]
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    const cell = (i: number) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '')
    const material = cell(col.material)
    if (!material) continue
    const desc = cell(col.desc)
    const bolt = cell(col.bolt)
    const mother = cell(col.mother)
    const f97 = cell(col.flat97)
    const f95 = cell(col.flat95)
    const spring = cell(col.spring)
    let factorRaw = cell(col.factor)
    if (!factorRaw) factorRaw = '1'
    const parsed = Number(factorRaw)
    const factorOut = parsed === 2 ? '2' : '1'
    if (factorRaw && parsed !== 1 && parsed !== 2) {
      errors.push(`第 ${r + 1} 行物料「${material}」：是否双平须为 1 或 2，当前为「${factorRaw}」`)
    }
    lines.push(
      [material, desc, bolt, mother, f97, f95, spring, factorOut].map((v) => escapeCsvField(v)).join(',')
    )
  }
  if (lines.length < 2) {
    errors.push('未解析到任何有效数据行（物料号不能为空）')
    return { csv: '', errors }
  }
  return { csv: lines.join('\n'), errors: errors.length > 0 ? errors : [] }
}

export interface SubBoltRule {
  boltCode?: string
  motherCode?: string
  flat97Code?: string
  flat95Code?: string
  springCode?: string
  doubleFlatFactor: number
}

/** 与内置 CSV 一致的表头，供下载空白模板 */
export const SUB_BOLT_RULES_CSV_HEADER_LINE =
  '物料号,物料描述,栓编码,母编码,平垫97编码,平垫95编码,弹垫编码,是否双平,'

export function getBuiltinSubBoltRulesCsv(): string {
  return BUILTIN_SUB_BOLT_RULES_CSV
}

/**
 * 解析副转只拆分规则 CSV（标准 8 列：物料号在首列；支持引号包裹字段）。
 * 物料号重复时以后出现的行覆盖先前的行。
 */
export function parseSubBoltRulesCsv(csv: string): {
  map: Record<string, SubBoltRule>
  errors: string[]
  rowCount: number
} {
  const errors: string[] = []
  const map: Record<string, SubBoltRule> = {}
  const text = csv.replace(/^\ufeff/, '').trim()
  if (!text) {
    errors.push('CSV 内容为空')
    return { map: {}, errors, rowCount: 0 }
  }
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) {
    errors.push('CSV 至少需要表头与一行数据')
    return { map: {}, errors, rowCount: 0 }
  }
  const headerCells = parseCsvLine(lines[0].trim())
  const headerJoin = headerCells.join('')
  if (!headerJoin.includes('物料') && !headerJoin.includes('栓')) {
    errors.push('表头不识别：请包含「物料号/物料编码」或「栓编码」等列名，或使用下载的模板')
  }
  let rowCount = 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCsvLine(line)
    while (cols.length < 8) cols.push('')
    const material = cols[0]?.trim()
    if (!material) continue
    const boltCode = cols[2]?.trim() || undefined
    const motherCode = cols[3]?.trim() || undefined
    const flat97Code = cols[4]?.trim() || undefined
    const flat95Code = cols[5]?.trim() || undefined
    const springCode = cols[6]?.trim() || undefined
    const factorRaw = cols[7]?.trim()
    const parsed = factorRaw ? Number(factorRaw) : NaN
    const doubleFlatFactor = parsed === 2 ? 2 : 1
    if (factorRaw && parsed !== 1 && parsed !== 2) {
      errors.push(`第 ${i + 1} 行物料「${material}」：是否双平列须为 1 或 2，当前为「${factorRaw}」`)
    }
    map[material] = {
      boltCode,
      motherCode,
      flat97Code,
      flat95Code,
      springCode,
      doubleFlatFactor
    }
    rowCount++
  }
  if (rowCount === 0) {
    errors.push('未解析到任何有效数据行（每行第一列为物料号）')
  }
  return { map, errors, rowCount }
}
