import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import bcrypt from 'bcryptjs'

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

export interface User {
  id: number
  username: string
  password_hash: string
  display_name: string
  role: 'admin' | 'user'
  can_view_inventory: number
  can_manage_data: number
  can_manage_picking_orders: number
  created_at: string
  updated_at: string
}

export interface PickingOrderItem {
  id: number
  order_no: string
  seq_no: number
  product_code: string
  description: string
  quantity: number
  unit: string
  unit_price_ex_tax: number
  tax_rate: string
  unit_price_inc_tax: number
  total_amount: number
  order_date: string
  required_date: string
  planner: string
  project_name: string
  required_factory: string
  is_picked: number
  picked_quantity: number | null
  pick_remark: string
  picked_at: string | null
  picked_by: string
  created_at: string
  updated_at: string
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'inventory-management.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

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

  const addColumnIfMissing = (table: string, col: string, colDef: string): void => {
    try {
      db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get()
    } catch {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${colDef}`)
    }
  }

  addColumnIfMissing('products', 'grade', "TEXT DEFAULT ''")
  addColumnIfMissing('products', 'description', "TEXT DEFAULT ''")
  addColumnIfMissing('products', 'material', "TEXT DEFAULT ''")
  addColumnIfMissing('products', 'special_note', "TEXT DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      quantity INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `)

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

  addColumnIfMissing('inventory_logs', 'operator_id', 'INTEGER DEFAULT NULL')
  addColumnIfMissing('inventory_logs', 'operator_name', "TEXT DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      can_view_inventory INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  addColumnIfMissing('users', 'can_view_inventory', 'INTEGER DEFAULT 0')
  addColumnIfMissing('users', 'can_manage_data', 'INTEGER DEFAULT 0')
  addColumnIfMissing('users', 'can_manage_picking_orders', 'INTEGER DEFAULT 0')

  db.exec(`
    CREATE TABLE IF NOT EXISTS picking_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL,
      seq_no INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      description TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT DEFAULT '',
      unit_price_ex_tax REAL DEFAULT 0,
      tax_rate TEXT DEFAULT '',
      unit_price_inc_tax REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      order_date TEXT DEFAULT '',
      required_date TEXT DEFAULT '',
      planner TEXT DEFAULT '',
      project_name TEXT DEFAULT '',
      required_factory TEXT DEFAULT '',
      is_picked INTEGER DEFAULT 0,
      picked_quantity REAL,
      pick_remark TEXT DEFAULT '',
      picked_at TEXT,
      picked_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(order_no, seq_no)
    );
    CREATE INDEX IF NOT EXISTS idx_picking_order_no ON picking_order_items(order_no);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS print_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      print_count INTEGER DEFAULT 1,
      label_type TEXT DEFAULT 'small',
      operator_id INTEGER,
      operator_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `)

  // Create default admin if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role, can_view_inventory) VALUES (?, ?, ?, ?, ?)"
    ).run('admin', hash, '管理员', 'admin', 1)
  }
}

export function getDatabase(): Database.Database {
  return db
}

// ==============================
// Products
// ==============================

export function searchProducts(query: string): Product[] {
  const keywords = query.trim().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return []

  const fields = ['code', 'description', 'name', 'spec', 'grade', 'surface_treatment', 'material', 'special_note']

  function getVariants(kw: string): string[] {
    const variants = [kw]
    if (kw.includes('*')) variants.push(kw.replace(/\*/g, '×'))
    else if (kw.includes('×')) variants.push(kw.replace(/×/g, '*'))
    return variants
  }

  const whereClauses: string[] = []
  const params: string[] = []

  for (const kw of keywords) {
    const variants = getVariants(kw)
    const conditions = fields.flatMap((f) => variants.map((v) => {
      params.push(`%${v}%`)
      return `${f} LIKE ?`
    }))
    whereClauses.push(`(${conditions.join(' OR ')})`)
  }

  const sql = `SELECT * FROM products WHERE ${whereClauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 100`
  const stmt = db.prepare(sql)
  return stmt.all(...params) as Product[]
}

export function getAllProducts(): Product[] {
  const stmt = db.prepare('SELECT * FROM products ORDER BY updated_at DESC')
  return stmt.all() as Product[]
}

export function getProductById(id: number): Product | undefined {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?')
  return stmt.get(id) as Product | undefined
}

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

export function deleteProduct(id: number): boolean {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
  txn()
  return true
}

export function deleteProducts(ids: number[]): number {
  const txn = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
      db.prepare('DELETE FROM products WHERE id = ?').run(id)
    }
  })
  txn()
  return ids.length
}

export function deleteAllProducts(): number {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM inventory').run()
    const result = db.prepare('DELETE FROM products').run()
    return result.changes
  })
  return txn() as number
}

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
// Inventory
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
  operator_id: number | null
  operator_name: string
  created_at: string
  product_code?: string
  product_name?: string
  product_spec?: string
  product_description?: string
}

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

export function getInventory(productId: number): number {
  const stmt = db.prepare('SELECT quantity FROM inventory WHERE product_id = ?')
  const row = stmt.get(productId) as { quantity: number } | undefined
  return row ? row.quantity : 0
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

export function setInventory(
  productId: number,
  newQuantity: number,
  remark: string,
  operatorId?: number,
  operatorName?: string
): void {
  const txn = db.transaction(() => {
    const currentQty = getInventory(productId)
    const diff = newQuantity - currentQty

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

    if (diff !== 0) {
      const type = diff > 0 ? 'in' : 'out'
      const logRemark = `[手动调整] ${remark || ''}`.trim()
      db.prepare(
        'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(productId, type, Math.abs(diff), logRemark, operatorId ?? null, operatorName ?? '')
    }
  })
  txn()
}

export function stockIn(
  productId: number,
  quantity: number,
  remark: string,
  operatorId?: number,
  operatorName?: string
): void {
  const txn = db.transaction(() => {
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
    db.prepare(
      'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, 'in', quantity, remark || '', operatorId ?? null, operatorName ?? '')
  })
  txn()
}

export function stockOut(
  productId: number,
  quantity: number,
  remark: string,
  operatorId?: number,
  operatorName?: string
): void {
  const txn = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(productId)
    if (existing) {
      db.prepare(
        'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
      ).run(quantity, productId)
    } else {
      db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
        productId,
        -quantity
      )
    }
    db.prepare(
      'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, 'out', quantity, remark || '', operatorId ?? null, operatorName ?? '')
  })
  txn()
}

export function importInventory(
  items: { code: string; quantity: number }[],
  operatorId?: number,
  operatorName?: string
): { success: number; failed: number; errors: string[] } {
  let success = 0
  let failed = 0
  const errors: string[] = []

  const findProduct = db.prepare('SELECT id FROM products WHERE code = ?')
  const findInventory = db.prepare('SELECT id FROM inventory WHERE product_id = ?')
  const insertInventory = db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)')
  const updateInventory = db.prepare(
    'UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
  )
  const insertLog = db.prepare(
    'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const txn = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.code) {
          failed++
          errors.push('物料号为空，跳过')
          continue
        }
        const product = findProduct.get(item.code) as { id: number } | undefined
        if (!product) {
          failed++
          errors.push(`物料号「${item.code}」不存在`)
          continue
        }
        const qty = Number(item.quantity)
        if (isNaN(qty)) {
          failed++
          errors.push(`物料号「${item.code}」的库存数量无效`)
          continue
        }

        const existing = findInventory.get(product.id)
        if (existing) {
          updateInventory.run(qty, product.id)
        } else {
          insertInventory.run(product.id, qty)
        }

        insertLog.run(
          product.id,
          qty >= 0 ? 'in' : 'out',
          Math.abs(qty),
          '[Excel导入库存]',
          operatorId ?? null,
          operatorName ?? ''
        )
        success++
      } catch (err) {
        failed++
        errors.push(`物料号「${item.code}」导入失败: ${(err as Error).message}`)
      }
    }
  })

  txn()
  return { success, failed, errors }
}

export function deleteInventoryLogs(ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const stmt = db.prepare(`DELETE FROM inventory_logs WHERE id IN (${placeholders})`)
  const result = stmt.run(...ids)
  return result.changes
}

export function revokeInventoryLog(logId: number): void {
  const txn = db.transaction(() => {
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId) as InventoryLog | undefined
    if (!log) throw new Error('记录不存在')

    const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(log.product_id)
    if (log.type === 'in') {
      if (existing) {
        db.prepare(
          'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
        ).run(log.quantity, log.product_id)
      } else {
        db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
          log.product_id, -log.quantity
        )
      }
    } else {
      if (existing) {
        db.prepare(
          'UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
        ).run(log.quantity, log.product_id)
      } else {
        db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
          log.product_id, log.quantity
        )
      }
    }

    db.prepare('DELETE FROM inventory_logs WHERE id = ?').run(logId)
  })
  txn()
}

export function batchStockIn(
  items: { code: string; quantity: number; remark: string }[],
  operatorId?: number,
  operatorName?: string
): { success: number; failed: number; errors: string[] } {
  let success = 0
  let failed = 0
  const errors: string[] = []

  const findProduct = db.prepare('SELECT id FROM products WHERE code = ?')
  const findInventory = db.prepare('SELECT id FROM inventory WHERE product_id = ?')
  const insertInventory = db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)')
  const addInventory = db.prepare(
    'UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
  )
  const insertLog = db.prepare(
    'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const txn = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.code) { failed++; errors.push('物料号为空，跳过'); continue }
        const product = findProduct.get(item.code) as { id: number } | undefined
        if (!product) { failed++; errors.push(`物料号「${item.code}」不存在`); continue }
        const qty = Number(item.quantity)
        if (isNaN(qty) || qty <= 0) { failed++; errors.push(`物料号「${item.code}」的数量无效`); continue }

        const existing = findInventory.get(product.id)
        if (existing) {
          addInventory.run(qty, product.id)
        } else {
          insertInventory.run(product.id, qty)
        }
        insertLog.run(product.id, 'in', qty, item.remark || '[Excel批量入库]', operatorId ?? null, operatorName ?? '')
        success++
      } catch (err) {
        failed++
        errors.push(`物料号「${item.code}」入库失败: ${(err as Error).message}`)
      }
    }
  })
  txn()
  return { success, failed, errors }
}

export function batchStockOut(
  items: { code: string; quantity: number; remark: string }[],
  operatorId?: number,
  operatorName?: string
): { success: number; failed: number; errors: string[] } {
  let success = 0
  let failed = 0
  const errors: string[] = []

  const findProduct = db.prepare('SELECT id FROM products WHERE code = ?')
  const findInventory = db.prepare('SELECT id FROM inventory WHERE product_id = ?')
  const insertInventory = db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)')
  const subInventory = db.prepare(
    'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
  )
  const insertLog = db.prepare(
    'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const txn = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.code) { failed++; errors.push('物料号为空，跳过'); continue }
        const product = findProduct.get(item.code) as { id: number } | undefined
        if (!product) { failed++; errors.push(`物料号「${item.code}」不存在`); continue }
        const qty = Number(item.quantity)
        if (isNaN(qty) || qty <= 0) { failed++; errors.push(`物料号「${item.code}」的数量无效`); continue }

        const existing = findInventory.get(product.id)
        if (existing) {
          subInventory.run(qty, product.id)
        } else {
          insertInventory.run(product.id, -qty)
        }
        insertLog.run(product.id, 'out', qty, item.remark || '[Excel批量出库]', operatorId ?? null, operatorName ?? '')
        success++
      } catch (err) {
        failed++
        errors.push(`物料号「${item.code}」出库失败: ${(err as Error).message}`)
      }
    }
  })
  txn()
  return { success, failed, errors }
}

export function getInventoryLogs(
  productId?: number,
  type?: 'in' | 'out'
): InventoryLog[] {
  let sql = `
    SELECT l.*, p.code as product_code, p.name as product_name, p.spec as product_spec, p.description as product_description
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
  sql += ' ORDER BY l.created_at DESC LIMIT 500'
  const stmt = db.prepare(sql)
  return stmt.all(...params) as InventoryLog[]
}

// ==============================
// Print with inventory deduction
// ==============================

export function printAndDeductInventory(
  productId: number,
  quantity: number,
  printCount: number,
  labelType: string,
  operatorId: number,
  operatorName: string,
  skipDeduct: boolean = false
): void {
  const totalPieces = quantity * printCount
  const totalDeductInThousands = totalPieces / 1000
  const txn = db.transaction(() => {
    if (!skipDeduct) {
      const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(productId)
      if (existing) {
        db.prepare(
          'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
        ).run(totalDeductInThousands, productId)
      } else {
        db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)').run(
          productId,
          -totalDeductInThousands
        )
      }

      db.prepare(
        'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(
        productId,
        'out',
        totalDeductInThousands,
        `[打印出库] ${printCount}张${labelType === 'small' ? '小标签' : '大标签'}, 每张${quantity}只, 共${totalPieces}只=${totalDeductInThousands}千`,
        operatorId,
        operatorName
      )
    }

    db.prepare(
      'INSERT INTO print_logs (product_id, quantity, print_count, label_type, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(productId, quantity, printCount, labelType, operatorId, operatorName)
  })
  txn()
}

// ==============================
// Users
// ==============================

export function getUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
}

export function getAllUsers(): Omit<User, 'password_hash'>[] {
  return db.prepare(
    'SELECT id, username, display_name, role, can_view_inventory, can_manage_data, can_manage_picking_orders, created_at, updated_at FROM users ORDER BY created_at ASC'
  ).all() as Omit<User, 'password_hash'>[]
}

export function createUser(
  username: string,
  password: string,
  displayName: string,
  role: 'admin' | 'user',
  canViewInventory: number,
  canManageData: number = 0,
  canManagePickingOrders: number = 0
): User {
  const hash = bcrypt.hashSync(password, 10)
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, can_view_inventory, can_manage_data, can_manage_picking_orders) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(username, hash, displayName, role, canViewInventory, canManageData, canManagePickingOrders)
  return getUserById(result.lastInsertRowid as number)!
}

export function updateUser(
  id: number,
  data: { display_name?: string; role?: string; can_view_inventory?: number; can_manage_data?: number; can_manage_picking_orders?: number; password?: string }
): User | undefined {
  if (data.password) {
    const hash = bcrypt.hashSync(data.password, 10)
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id)
  }
  if (data.display_name !== undefined) {
    db.prepare('UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.display_name, id)
  }
  if (data.role !== undefined) {
    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.role, id)
  }
  if (data.can_view_inventory !== undefined) {
    db.prepare('UPDATE users SET can_view_inventory = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.can_view_inventory, id)
  }
  if (data.can_manage_data !== undefined) {
    db.prepare('UPDATE users SET can_manage_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.can_manage_data, id)
  }
  if (data.can_manage_picking_orders !== undefined) {
    db.prepare('UPDATE users SET can_manage_picking_orders = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.can_manage_picking_orders, id)
  }
  return getUserById(id)
}

export function deleteUser(id: number): boolean {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return true
}

export function changePassword(id: number, oldPassword: string, newPassword: string): boolean {
  const user = getUserById(id)
  if (!user) return false
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) return false
  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id)
  return true
}

export function verifyPassword(username: string, password: string): User | null {
  const user = getUserByUsername(username)
  if (!user) return null
  if (!bcrypt.compareSync(password, user.password_hash)) return null
  return user
}

// ==============================
// Picking Orders
// ==============================

export function getPickingOrderItems(orderNo: string): PickingOrderItem[] {
  return db.prepare(
    'SELECT * FROM picking_order_items WHERE order_no = ? ORDER BY seq_no ASC'
  ).all(orderNo) as PickingOrderItem[]
}

export function getPickingOrderItemById(id: number): PickingOrderItem | undefined {
  return db.prepare('SELECT * FROM picking_order_items WHERE id = ?').get(id) as PickingOrderItem | undefined
}

type NewPickingOrderItem = Omit<PickingOrderItem, 'id' | 'is_picked' | 'picked_quantity' | 'pick_remark' | 'picked_at' | 'picked_by' | 'created_at' | 'updated_at'>

export function addPickingOrderItem(item: NewPickingOrderItem): PickingOrderItem {
  const result = db.prepare(`
    INSERT INTO picking_order_items
    (order_no, seq_no, product_code, description, quantity, unit, unit_price_ex_tax, tax_rate, unit_price_inc_tax, total_amount, order_date, required_date, planner, project_name, required_factory)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.order_no, item.seq_no, item.product_code, item.description || '',
    item.quantity, item.unit || '', item.unit_price_ex_tax || 0, item.tax_rate || '',
    item.unit_price_inc_tax || 0, item.total_amount || 0, item.order_date || '',
    item.required_date || '', item.planner || '', item.project_name || '', item.required_factory || ''
  )
  return getPickingOrderItemById(result.lastInsertRowid as number)!
}

export function updatePickingOrderItem(id: number, data: Partial<NewPickingOrderItem>): PickingOrderItem | undefined {
  const fieldMap: Record<string, string> = {
    order_no: 'order_no', seq_no: 'seq_no', product_code: 'product_code',
    description: 'description', quantity: 'quantity', unit: 'unit',
    unit_price_ex_tax: 'unit_price_ex_tax', tax_rate: 'tax_rate',
    unit_price_inc_tax: 'unit_price_inc_tax', total_amount: 'total_amount',
    order_date: 'order_date', required_date: 'required_date', planner: 'planner',
    project_name: 'project_name', required_factory: 'required_factory'
  }
  const fields: string[] = []
  const values: unknown[] = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      fields.push(`${col} = ?`)
      values.push((data as Record<string, unknown>)[key])
    }
  }
  if (fields.length === 0) return getPickingOrderItemById(id)
  fields.push(`updated_at = datetime('now', 'localtime')`)
  values.push(id)
  db.prepare(`UPDATE picking_order_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getPickingOrderItemById(id)
}

export function deletePickingOrderItem(id: number): boolean {
  db.prepare('DELETE FROM picking_order_items WHERE id = ?').run(id)
  return true
}

export function deletePickingOrderByOrderNo(orderNo: string): number {
  const result = db.prepare('DELETE FROM picking_order_items WHERE order_no = ?').run(orderNo)
  return result.changes
}

export function importPickingOrderItems(
  items: NewPickingOrderItem[]
): { success: number; failed: number; errors: string[] } {
  let success = 0
  let failed = 0
  const errors: string[] = []

  const checkExisting = db.prepare(
    'SELECT id, is_picked FROM picking_order_items WHERE order_no = ? AND seq_no = ?'
  )
  const insertStmt = db.prepare(`
    INSERT INTO picking_order_items
    (order_no, seq_no, product_code, description, quantity, unit, unit_price_ex_tax, tax_rate, unit_price_inc_tax, total_amount, order_date, required_date, planner, project_name, required_factory)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateStmt = db.prepare(`
    UPDATE picking_order_items SET
    product_code = ?, description = ?, quantity = ?, unit = ?, unit_price_ex_tax = ?, tax_rate = ?,
    unit_price_inc_tax = ?, total_amount = ?, order_date = ?, required_date = ?, planner = ?,
    project_name = ?, required_factory = ?, updated_at = datetime('now', 'localtime')
    WHERE order_no = ? AND seq_no = ? AND is_picked = 0
  `)

  const txn = db.transaction(() => {
    for (const item of items) {
      try {
        if (!item.order_no || !item.product_code) {
          failed++
          errors.push(`单号或编码为空，序号: ${item.seq_no}`)
          continue
        }
        if (isNaN(item.quantity) || item.quantity < 0) {
          failed++
          errors.push(`单号${item.order_no} 序号${item.seq_no} 数量无效`)
          continue
        }
        const existing = checkExisting.get(item.order_no, item.seq_no) as { id: number; is_picked: number } | undefined
        if (existing) {
          if (existing.is_picked === 1) {
            success++
          } else {
            updateStmt.run(
              item.product_code, item.description || '', item.quantity, item.unit || '',
              item.unit_price_ex_tax || 0, item.tax_rate || '', item.unit_price_inc_tax || 0,
              item.total_amount || 0, item.order_date || '', item.required_date || '',
              item.planner || '', item.project_name || '', item.required_factory || '',
              item.order_no, item.seq_no
            )
            success++
          }
        } else {
          insertStmt.run(
            item.order_no, item.seq_no, item.product_code, item.description || '',
            item.quantity, item.unit || '', item.unit_price_ex_tax || 0, item.tax_rate || '',
            item.unit_price_inc_tax || 0, item.total_amount || 0, item.order_date || '',
            item.required_date || '', item.planner || '', item.project_name || '', item.required_factory || ''
          )
          success++
        }
      } catch (err) {
        failed++
        errors.push(`单号${item.order_no} 序号${item.seq_no} 导入失败: ${(err as Error).message}`)
      }
    }
  })
  txn()
  return { success, failed, errors }
}

export function confirmPickingItems(
  items: { id: number; pickedQty: number; remark: string; pickedBy: string }[],
  operatorId?: number,
  operatorName?: string
): { success: number; failed: number; errors: string[]; inventoryErrors: string[] } {
  let success = 0
  let failed = 0
  const errors: string[] = []
  const inventoryErrors: string[] = []

  const getItem = db.prepare('SELECT * FROM picking_order_items WHERE id = ?')
  const findProduct = db.prepare('SELECT id FROM products WHERE code = ?')
  const findInventory = db.prepare('SELECT id FROM inventory WHERE product_id = ?')
  const insertInventory = db.prepare('INSERT INTO inventory (product_id, quantity) VALUES (?, ?)')
  const subInventory = db.prepare(
    'UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?'
  )
  const insertLog = db.prepare(
    'INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const markPicked = db.prepare(`
    UPDATE picking_order_items
    SET is_picked = 1, picked_quantity = ?, pick_remark = ?, picked_at = datetime('now', 'localtime'), picked_by = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  const txn = db.transaction(() => {
    for (const item of items) {
      const pickItem = getItem.get(item.id) as PickingOrderItem | undefined
      if (!pickItem) {
        failed++
        errors.push(`ID ${item.id} 不存在`)
        continue
      }
      if (pickItem.is_picked === 1) {
        failed++
        errors.push(`${pickItem.product_code} 序号${pickItem.seq_no} 已出库，跳过`)
        continue
      }
      const qty = item.pickedQty > 0 ? item.pickedQty : pickItem.quantity
      const product = findProduct.get(pickItem.product_code) as { id: number } | undefined
      if (product) {
        const existing = findInventory.get(product.id)
        if (existing) {
          subInventory.run(qty, product.id)
        } else {
          insertInventory.run(product.id, -qty)
        }
        const remarkText = item.remark
          ? `[配货出库] ${item.remark}`
          : `[配货出库] 单号${pickItem.order_no}`
        insertLog.run(product.id, 'out', qty, remarkText, operatorId ?? null, operatorName ?? '')
      } else {
        inventoryErrors.push(`物料「${pickItem.product_code}」不在库存系统中，已标记配货但未扣减库存`)
      }
      markPicked.run(qty, item.remark || '', item.pickedBy, item.id)
      success++
    }
  })
  txn()
  return { success, failed, errors, inventoryErrors }
}

export function resetPickingItems(ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const result = db.prepare(
    `UPDATE picking_order_items SET is_picked = 0, picked_quantity = NULL, pick_remark = '', picked_at = NULL, picked_by = '', updated_at = datetime('now', 'localtime') WHERE id IN (${placeholders})`
  ).run(...ids)
  return result.changes
}
