import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { getInventoryDatabasePath } from '../database'

export function runReadonlySelect(sql: string): {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
} {
  const path = getInventoryDatabasePath()
  if (!existsSync(path)) {
    throw new Error('数据库文件不存在')
  }
  const ro = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const stmt = ro.prepare(sql)
    const rows = stmt.all() as Record<string, unknown>[]
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { rows, columns, rowCount: rows.length }
  } finally {
    ro.close()
  }
}
