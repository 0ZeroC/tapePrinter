import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export interface Product {
  id?: number
  code: string
  description: string
  name: string
  spec: string
  grade: string
  surface_treatment: string
  material: string
  special_note: string
  created_at?: string
  updated_at?: string
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'tape-printer.db')
  db = new Database(dbPath)

  // 启用 WAL 模式提高性能
  db.pragma('journal_mode = WAL')

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      spec TEXT DEFAULT '',
      surface_treatment TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
  `)

  // 兼容旧数据库：自动添加缺失的列
  const addColumnIfMissing = (col: string): void => {
    try {
      db.prepare(`SELECT ${col} FROM products LIMIT 1`).get()
    } catch {
      db.exec(`ALTER TABLE products ADD COLUMN ${col} TEXT DEFAULT ''`)
    }
  }
  addColumnIfMissing('grade')
  addColumnIfMissing('description')
  addColumnIfMissing('material')
  addColumnIfMissing('special_note')

  // 创建库存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      quantity INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `)

  // 创建出入库记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      remark TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `)
}

export function getDatabase(): Database.Database {
  return db
}

/** 搜索物品 - 在所有字段中模糊搜索 */
export function searchProducts(query: string): Product[] {
  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE code LIKE ? OR description LIKE ? OR name LIKE ? OR spec LIKE ?
      OR grade LIKE ? OR surface_treatment LIKE ? OR material LIKE ? OR special_note LIKE ?
    ORDER BY updated_at DESC
    LIMIT 100
  `)
  const pattern = `%${query}%`
  return stmt.all(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern) as Product[]
}

/** 获取所有物品 */
export function getAllProducts(): Product[] {
  const stmt = db.prepare('SELECT * FROM products ORDER BY updated_at DESC')
  return stmt.all() as Product[]
}

/** 根据 ID 获取物品 */
export function getProductById(id: number): Product | undefined {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?')
  return stmt.get(id) as Product | undefined
}

/** 创建物品 */
export function createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Product {
  const stmt = db.prepare(`
    INSERT INTO products (code, description, name, spec, grade, surface_treatment, material, special_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    product.code,
    product.description || '',
    product.name,
    product.spec || '',
    product.grade || '',
    product.surface_treatment || '',
    product.material || '',
    product.special_note || ''
  )
  return getProductById(result.lastInsertRowid as number)!
}

/** 更新物品 */
export function updateProduct(
  id: number,
  product: Omit<Product, 'id' | 'created_at' | 'updated_at'>
): Product | undefined {
  const stmt = db.prepare(`
    UPDATE products
    SET code = ?, description = ?, name = ?, spec = ?, grade = ?,
        surface_treatment = ?, material = ?, special_note = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  stmt.run(
    product.code,
    product.description || '',
    product.name,
    product.spec || '',
    product.grade || '',
    product.surface_treatment || '',
    product.material || '',
    product.special_note || '',
    id
  )
  return getProductById(id)
}

/** 删除物品（同时清理关联的库存和出入库记录） */
export function deleteProduct(id: number): boolean {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM inventory_logs WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
  txn()
  return true
}

/** 批量删除物品 */
export function deleteProducts(ids: number[]): number {
  const txn = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM inventory_logs WHERE product_id = ?').run(id)
      db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
      db.prepare('DELETE FROM products WHERE id = ?').run(id)
    }
  })
  txn()
  return ids.length
}

/** 清空所有物品数据 */
export function deleteAllProducts(): number {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM inventory_logs').run()
    db.prepare('DELETE FROM inventory').run()
    const result = db.prepare('DELETE FROM products').run()
    return result.changes
  })
  return txn() as number
}

/** 批量导入物品 */
export function importProducts(
  products: Omit<Product, 'id' | 'created_at' | 'updated_at'>[]
): { success: number; failed: number; errors: string[] } {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO products (code, description, name, spec, grade, surface_treatment, material, special_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let success = 0
  let failed = 0
  const errors: string[] = []

  const insertMany = db.transaction(
    (items: Omit<Product, 'id' | 'created_at' | 'updated_at'>[]) => {
      for (const item of items) {
        try {
          if (!item.code || !item.name) {
            failed++
            errors.push(`编码或名称为空: ${JSON.stringify(item)}`)
            continue
          }
          insertStmt.run(
            item.code,
            item.description || '',
            item.name,
            item.spec || '',
            item.grade || '',
            item.surface_treatment || '',
            item.material || '',
            item.special_note || ''
          )
          success++
        } catch (err) {
          failed++
          errors.push(`导入失败 [${item.code}]: ${(err as Error).message}`)
        }
      }
    }
  )

  insertMany(products)
  return { success, failed, errors }
}

// ==============================
// 出入库相关
// ==============================

export interface InventoryRecord {
  id: number
  product_id: number
  quantity: number
  updated_at: string
}

export interface InventoryLog {
  id: number
  product_id: number
  type: 'in' | 'out'
  quantity: number
  remark: string
  created_at: string
  // 关联查询字段
  product_code?: string
  product_name?: string
  product_spec?: string
}

/** 获取某产品当前库存 */
export function getInventory(productId: number): number {
  const stmt = db.prepare('SELECT quantity FROM inventory WHERE product_id = ?')
  const row = stmt.get(productId) as { quantity: number } | undefined
  return row ? row.quantity : 0
}

/** 获取所有产品的库存（关联产品信息） */
export interface InventoryWithProduct {
  product_id: number
  quantity: number
  updated_at: string
  code: string
  description: string
  name: string
  spec: string
  grade: string
  surface_treatment: string
  material: string
  special_note: string
}

export function getAllInventory(): InventoryWithProduct[] {
  const stmt = db.prepare(`
    SELECT i.product_id, i.quantity, i.updated_at,
           p.code, p.description, p.name, p.spec, p.grade,
           p.surface_treatment, p.material, p.special_note
    FROM inventory i
    LEFT JOIN products p ON i.product_id = p.id
    ORDER BY i.updated_at DESC
  `)
  return stmt.all() as InventoryWithProduct[]
}

/** 手动设置库存数量 */
export function setInventory(productId: number, newQuantity: number, remark: string): void {
  const txn = db.transaction(() => {
    const currentQty = getInventory(productId)
    const diff = newQuantity - currentQty

    // 更新或插入库存记录
    const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(productId)
    if (existing) {
      db.prepare(
        'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
      ).run(newQuantity, productId)
    } else {
      db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
        productId,
        newQuantity
      )
    }

    // 写入日志，记录手动调整
    if (diff !== 0) {
      const type = diff > 0 ? 'in' : 'out'
      const logRemark = `[手动调整] ${remark || ''}`.trim()
      db.prepare(
        'INSERT INTO inventory_logs (product_id, type, quantity, remark) VALUES (?, ?, ?, ?)'
      ).run(productId, type, Math.abs(diff), logRemark)
    }
  })
  txn()
}

/** 入库 */
export function stockIn(productId: number, quantity: number, remark: string): void {
  const txn = db.transaction(() => {
    // 更新或插入库存记录
    const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(productId)
    if (existing) {
      db.prepare(
        'UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
      ).run(quantity, productId)
    } else {
      db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
        productId,
        quantity
      )
    }
    // 写入日志
    db.prepare(
      'INSERT INTO inventory_logs (product_id, type, quantity, remark) VALUES (?, ?, ?, ?)'
    ).run(productId, 'in', quantity, remark || '')
  })
  txn()
}

/** 出库 */
export function stockOut(productId: number, quantity: number, remark: string): void {
  const txn = db.transaction(() => {
    const currentQty = getInventory(productId)
    if (currentQty < quantity) {
      throw new Error(`库存不足，当前库存 ${currentQty}，需要出库 ${quantity}`)
    }
    db.prepare(
      'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
    ).run(quantity, productId)
    // 写入日志
    db.prepare(
      'INSERT INTO inventory_logs (product_id, type, quantity, remark) VALUES (?, ?, ?, ?)'
    ).run(productId, 'out', quantity, remark || '')
  })
  txn()
}

/** 查询出入库记录 */
export function getInventoryLogs(
  productId?: number,
  type?: 'in' | 'out'
): InventoryLog[] {
  let sql = `
    SELECT l.*, p.code as product_code, p.name as product_name, p.spec as product_spec
    FROM inventory_logs l
    LEFT JOIN products p ON l.product_id = p.id
    WHERE 1=1
  `
  const params: unknown[] = []
  if (productId) {
    sql += ' AND l.product_id = ?'
    params.push(productId)
  }
  if (type) {
    sql += ' AND l.type = ?'
    params.push(type)
  }
  sql += ' ORDER BY l.created_at DESC LIMIT 200'
  const stmt = db.prepare(sql)
  return stmt.all(...params) as InventoryLog[]
}
