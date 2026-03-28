import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, extname, basename, resolve, relative } from 'path'
import { existsSync, mkdirSync, unlinkSync, writeFileSync, rmSync } from 'fs'
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
  /** 图纸份数（由 product_drawings 汇总） */
  drawings_count: number
  created_at?: string
  updated_at?: string
}

export interface ProductDrawingRow {
  id: number
  product_id: number
  file_relpath: string
  original_name: string
  sort_order: number
  created_at: string
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
  delivery_note_printed: number
  delivery_note_printed_at: string | null
  created_at: string
  updated_at: string
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'inventory-management.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  const getMeta = (key: string): string | null => {
    const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  const setMeta = (key: string, value: string): void => {
    db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
  }

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
  addColumnIfMissing('products', 'drawing_path', "TEXT DEFAULT ''")

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_drawings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      file_relpath TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_product_drawings_product ON product_drawings(product_id);
  `)

  const LEGACY_DRAWING_MIGRATED = 'legacy_product_drawing_path_migrated_v1'
  if (getMeta(LEGACY_DRAWING_MIGRATED) !== '1') {
    try {
      const legacyRows = db
        .prepare(
          `SELECT id, drawing_path FROM products WHERE drawing_path IS NOT NULL AND drawing_path != ''`
        )
        .all() as { id: number; drawing_path: string }[]
      const ins = db.prepare(`
        INSERT INTO product_drawings (product_id, file_relpath, original_name, sort_order)
        VALUES (?, ?, ?, 0)
      `)
      for (const row of legacyRows) {
        const abs = getProductDrawingAbsolutePath(row.drawing_path)
        if (abs && existsSync(abs)) {
          ins.run(row.id, row.drawing_path, basename(row.drawing_path))
        }
      }
      db.prepare(`UPDATE products SET drawing_path = '' WHERE drawing_path IS NOT NULL AND drawing_path != ''`).run()
      setMeta(LEGACY_DRAWING_MIGRATED, '1')
    } catch {
      // ignore migration errors
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      quantity INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `)

  addColumnIfMissing('inventory_logs', 'operator_id', 'INTEGER DEFAULT NULL')
  addColumnIfMissing('inventory_logs', 'operator_name', "TEXT DEFAULT ''")

  // 旧版本 inventory_logs.created_at 使用 UTC（CURRENT_TIMESTAMP）。这里做一次性迁移到本地时间，避免前端显示偏差。
  const MIGRATION_KEY = 'inventory_logs_created_at_localtime_migrated_v1'
  if (getMeta(MIGRATION_KEY) !== '1') {
    try {
      db.prepare(`
        UPDATE inventory_logs
        SET created_at = datetime(created_at, 'localtime')
        WHERE created_at IS NOT NULL
      `).run()
      setMeta(MIGRATION_KEY, '1')
    } catch {
      // ignore migration errors
    }
  }

  // 旧版本 inventory.updated_at 同样为 UTC，一次性迁移为本地时间（与出入库记录一致）
  const INV_UPDATED_MIGRATION_KEY = 'inventory_updated_at_localtime_migrated_v1'
  if (getMeta(INV_UPDATED_MIGRATION_KEY) !== '1') {
    try {
      db.prepare(`
        UPDATE inventory
        SET updated_at = datetime(updated_at, 'localtime')
        WHERE updated_at IS NOT NULL
      `).run()
      setMeta(INV_UPDATED_MIGRATION_KEY, '1')
    } catch {
      // ignore migration errors
    }
  }

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
      delivery_note_printed INTEGER DEFAULT 0,
      delivery_note_printed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(order_no, seq_no)
    );
    CREATE INDEX IF NOT EXISTS idx_picking_order_no ON picking_order_items(order_no);
  `)
  addColumnIfMissing('picking_order_items', 'delivery_note_printed', 'INTEGER DEFAULT 0')
  addColumnIfMissing('picking_order_items', 'delivery_note_printed_at', 'TEXT')

  // 拆分出库明细（按配货行保存子件及数量，供历史查询与还原）
  db.exec(`
    CREATE TABLE IF NOT EXISTS picking_order_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      picking_item_id INTEGER NOT NULL,
      component_code TEXT NOT NULL,
      quantity_pieces REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (picking_item_id) REFERENCES picking_order_items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_picking_splits_item ON picking_order_splits(picking_item_id);
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
// Product drawings (files under userData/product-drawings)
// ==============================

export function getProductDrawingsRoot(): string {
  return join(app.getPath('userData'), 'product-drawings')
}

export function getProductDrawingAbsolutePath(relPath: string): string | null {
  if (!relPath || relPath.includes('..')) return null
  const root = resolve(getProductDrawingsRoot())
  const full = resolve(join(root, relPath))
  const rel = relative(root, full)
  if (!rel || rel.startsWith('..') || rel === '..') return null
  return full
}

export function removeProductDrawingFile(relPath: string): void {
  const full = getProductDrawingAbsolutePath(relPath)
  if (!full || !existsSync(full)) return
  try {
    unlinkSync(full)
  } catch {
    // ignore
  }
}

function sanitizeDrawingStem(name: string): string {
  const stem = basename(name, extname(name)).replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_')
  return stem.slice(0, 120) || 'drawing'
}

export function writeProductDrawingFile(productId: number, buffer: Buffer, originalName: string): string {
  const root = getProductDrawingsRoot()
  const dir = join(root, String(productId))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  let ext = extname(originalName).toLowerCase()
  if (!ext || ext.length > 12) ext = '.bin'
  const stem = sanitizeDrawingStem(originalName)
  const filename = `${Date.now()}_${stem}${ext}`
  const rel = `${productId}/${filename}`
  writeFileSync(join(root, rel), buffer)
  return rel
}

export function touchProductUpdatedAt(productId: number): void {
  db.prepare(`UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(productId)
}

export function listProductDrawings(productId: number): ProductDrawingRow[] {
  return db
    .prepare(
      `SELECT * FROM product_drawings WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(productId) as ProductDrawingRow[]
}

export function getProductDrawingRow(drawingId: number): ProductDrawingRow | undefined {
  return db.prepare('SELECT * FROM product_drawings WHERE id = ?').get(drawingId) as
    | ProductDrawingRow
    | undefined
}

export function addProductDrawingRecord(
  productId: number,
  buffer: Buffer,
  originalName: string
): ProductDrawingRow {
  const rel = writeProductDrawingFile(productId, buffer, originalName)
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM product_drawings WHERE product_id = ?`
    )
    .get(productId) as { n: number }
  const nextOrder = row?.n ?? 0
  const ins = db.prepare(`
    INSERT INTO product_drawings (product_id, file_relpath, original_name, sort_order)
    VALUES (?, ?, ?, ?)
  `)
  const result = ins.run(productId, rel, basename(originalName), nextOrder)
  touchProductUpdatedAt(productId)
  return db.prepare('SELECT * FROM product_drawings WHERE id = ?').get(result.lastInsertRowid) as ProductDrawingRow
}

export function deleteProductDrawingRecord(drawingId: number): boolean {
  const row = getProductDrawingRow(drawingId)
  if (!row) return false
  removeProductDrawingFile(row.file_relpath)
  db.prepare('DELETE FROM product_drawings WHERE id = ?').run(drawingId)
  touchProductUpdatedAt(row.product_id)
  return true
}

export function deleteAllDrawingsForProductId(productId: number): void {
  const rows = db
    .prepare('SELECT file_relpath FROM product_drawings WHERE product_id = ?')
    .all(productId) as { file_relpath: string }[]
  for (const r of rows) {
    removeProductDrawingFile(r.file_relpath)
  }
  db.prepare('DELETE FROM product_drawings WHERE product_id = ?').run(productId)
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
      return `p.${f} LIKE ?`
    }))
    whereClauses.push(`(${conditions.join(' OR ')})`)
  }

  const sql = `SELECT p.*,
    CAST((SELECT COUNT(1) FROM product_drawings d WHERE d.product_id = p.id) AS INTEGER) AS drawings_count
    FROM products p WHERE ${whereClauses.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 100`
  const stmt = db.prepare(sql)
  return stmt.all(...params) as Product[]
}

export function getAllProducts(): Product[] {
  const stmt = db.prepare(`
    SELECT p.*,
      CAST((SELECT COUNT(1) FROM product_drawings d WHERE d.product_id = p.id) AS INTEGER) AS drawings_count
    FROM products p
    ORDER BY p.updated_at DESC
  `)
  return stmt.all() as Product[]
}

export function getProductById(id: number): Product | undefined {
  const stmt = db.prepare(`
    SELECT p.*,
      CAST((SELECT COUNT(1) FROM product_drawings d WHERE d.product_id = p.id) AS INTEGER) AS drawings_count
    FROM products p WHERE p.id = ?
  `)
  return stmt.get(id) as Product | undefined
}

export function createProduct(
  product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'drawings_count'>
): Product {
  const stmt = db.prepare(`
    INSERT INTO products (code, description, name, spec, grade, surface_treatment, material, special_note, drawing_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    product.code,
    product.description || '',
    product.name,
    product.spec || '',
    product.grade || '',
    product.surface_treatment || '',
    product.material || '',
    product.special_note || '',
    ''
  )
  return getProductById(result.lastInsertRowid as number)!
}

export function updateProduct(
  id: number,
  product: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'drawings_count'>
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
    deleteAllDrawingsForProductId(id)
    db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
  txn()
  return true
}

export function deleteProducts(ids: number[]): number {
  const txn = db.transaction(() => {
    for (const id of ids) {
      deleteAllDrawingsForProductId(id)
      db.prepare('DELETE FROM inventory WHERE product_id = ?').run(id)
      db.prepare('DELETE FROM products WHERE id = ?').run(id)
    }
  })
  txn()
  return ids.length
}

export function deleteAllProducts(): number {
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM product_drawings').run()
    db.prepare('DELETE FROM inventory').run()
    const result = db.prepare('DELETE FROM products').run()
    try {
      const dr = getProductDrawingsRoot()
      if (existsSync(dr)) {
        rmSync(dr, { recursive: true, force: true })
      }
    } catch {
      // ignore
    }
    return result.changes
  })
  return txn() as number
}

export function importProducts(
  products: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'drawings_count'>[]
): { success: number; failed: number; errors: string[] } {
  const upsertStmt = db.prepare(`
    INSERT INTO products (code, description, name, spec, grade, surface_treatment, material, special_note, drawing_path)
    VALUES (@code, @description, @name, @spec, @grade, @surface_treatment, @material, @special_note, '')
    ON CONFLICT(code) DO UPDATE SET
      description = excluded.description,
      name = excluded.name,
      spec = excluded.spec,
      grade = excluded.grade,
      surface_treatment = excluded.surface_treatment,
      material = excluded.material,
      special_note = excluded.special_note,
      updated_at = CURRENT_TIMESTAMP
  `)

  let success = 0
  let failed = 0
  const errors: string[] = []

  const insertMany = db.transaction(
    (items: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'drawings_count'>[]) => {
      for (const item of items) {
        try {
          if (!item.code || !item.name) {
            failed++
            errors.push(`编码或名称为空: ${JSON.stringify(item)}`)
            continue
          }
          upsertStmt.run({
            code: item.code,
            description: item.description || '',
            name: item.name,
            spec: item.spec || '',
            grade: item.grade || '',
            surface_treatment: item.surface_treatment || '',
            material: item.material || '',
            special_note: item.special_note || ''
          })
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
  if (!row) return 0
  // better-sqlite3 可能返回 BigInt，与 number 运算会抛错，统一为 number
  return Number(row.quantity)
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
        `UPDATE inventory SET quantity = ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
      ).run(newQuantity, productId)
    } else {
      db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
        productId,
        newQuantity
      )
    }

    if (diff !== 0) {
      const type = diff > 0 ? 'in' : 'out'
      const logRemark = `[手动调整] ${remark || ''}`.trim()
      db.prepare(
        `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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
        `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
      ).run(quantity, productId)
    } else {
      db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
        productId,
        quantity
      )
    }
    db.prepare(
      `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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
        `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
      ).run(quantity, productId)
    } else {
      db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
        productId,
        -quantity
      )
    }
    db.prepare(
      `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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
  const insertInventory = db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`)
  const updateInventory = db.prepare(
    `UPDATE inventory SET quantity = ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
  )
  const insertLog = db.prepare(
    `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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

/**
 * 修改入库明细的数量与备注，并同步调整当前库存（差额 = 新数量 - 原数量）
 */
export function updateInventoryInLog(logId: number, newQuantity: number, newRemark: string): void {
  const nq = Number(newQuantity)
  if (!Number.isFinite(nq) || nq <= 0) {
    throw new Error('数量无效')
  }
  const txn = db.transaction(() => {
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId) as InventoryLog | undefined
    if (!log) throw new Error('记录不存在')
    if (log.type !== 'in') throw new Error('只能修改入库记录')

    const oldQty = Number(log.quantity)
    if (!Number.isFinite(oldQty)) {
      throw new Error('记录数据异常')
    }
    const delta = nq - oldQty
    if (delta !== 0) {
      // 与出库/打印一致：允许负库存，不校验 currentInv + delta
      const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(log.product_id)
      if (existing) {
        db.prepare(
          `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
        ).run(delta, log.product_id)
      } else {
        db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
          log.product_id,
          delta
        )
      }
    }
    db.prepare('UPDATE inventory_logs SET quantity = ?, remark = ? WHERE id = ?').run(
      nq,
      newRemark || '',
      logId
    )
  })
  txn()
}

/**
 * 撤销库存日志
 * 若该条为配货拆出库（remark 含 [配货拆出库]），则：
 * - 一并撤销该拆分对应的所有子件出库记录
 * - 恢复所有子件库存
 * - 重置配货单中对应行的已出库状态
 */
export function revokeInventoryLog(
  logId: number,
  operatorId?: number,
  operatorName?: string
): void {
  const extractPickingOrderNo = (remark: string): string | null => {
    const withLabel = remark.match(/订单号[:：]\s*([^\s，,;；]+)/)
    if (withLabel) return withLabel[1]
    const shortLabel = remark.match(/单号([^\s，,;；]+)/)
    if (shortLabel) return shortLabel[1]
    return null
  }

  const extractPickingSeqNo = (remark: string): number | null => {
    const match = remark.match(/序号(\d+)/)
    if (!match) return null
    const seqNo = parseInt(match[1], 10)
    return Number.isNaN(seqNo) ? null : seqNo
  }

  const txn = db.transaction(() => {
    const log = db.prepare('SELECT * FROM inventory_logs WHERE id = ?').get(logId) as InventoryLog | undefined
    if (!log) throw new Error('记录不存在')

    // 配货拆出库：按单号+序号找到配货行，恢复全部子件并重置配货状态
    if (log.type === 'out' && (log.remark || '').includes('[配货拆出库]')) {
      const m = (log.remark || '').match(/\[配货拆出库\]\s*单号([^\s]+)\s+序号(\d+)/)
      if (m) {
        const orderNo = m[1]
        const seqNo = parseInt(m[2], 10)
        const pickItem = db.prepare(
          'SELECT id FROM picking_order_items WHERE order_no = ? AND seq_no = ? AND is_picked = 1'
        ).get(orderNo, seqNo) as { id: number } | undefined
        if (pickItem) {
          resetPickingItems([pickItem.id], operatorId, operatorName)
          const orderMarker = '单号' + orderNo
          const seqMarker = '序号' + seqNo + ' '
          const relatedLogs = db.prepare(
            `SELECT id FROM inventory_logs WHERE type = 'out' AND remark LIKE '%[配货拆出库]%' 
             AND instr(remark, ?) > 0 AND instr(remark, ?) > 0`
          ).all(orderMarker, seqMarker) as { id: number }[]
          for (const r of relatedLogs) {
            db.prepare('DELETE FROM inventory_logs WHERE id = ?').run(r.id)
          }
          return
        }
      }
    }

    // 普通撤销：仅撤销单条
    const existing = db.prepare('SELECT id FROM inventory WHERE product_id = ?').get(log.product_id)
    if (log.type === 'in') {
      if (existing) {
        db.prepare(
          `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
        ).run(log.quantity, log.product_id)
      } else {
        db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
          log.product_id, -log.quantity
        )
      }
    } else {
      if (existing) {
        db.prepare(
          `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
        ).run(log.quantity, log.product_id)
      } else {
        db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
          log.product_id, log.quantity
        )
      }

      // 普通配货出库撤销：回滚对应配货行状态
      if ((log.remark || '').includes('[配货出库]')) {
        const remarkText = log.remark || ''
        const orderNo = extractPickingOrderNo(remarkText)
        if (orderNo) {
          const seqNo = extractPickingSeqNo(remarkText)
          const product = db.prepare('SELECT code FROM products WHERE id = ?').get(log.product_id) as { code: string } | undefined
          if (product?.code) {
            let pickItem: PickingOrderItem | undefined
            if (seqNo !== null) {
              pickItem = db.prepare(
                `SELECT * FROM picking_order_items
                 WHERE order_no = ? AND seq_no = ? AND product_code = ?
                 LIMIT 1`
              ).get(orderNo, seqNo, product.code) as PickingOrderItem | undefined
            } else {
              pickItem = db.prepare(
                `SELECT * FROM picking_order_items
                 WHERE order_no = ? AND product_code = ? AND (is_picked = 1 OR COALESCE(picked_quantity, 0) > 0)
                 ORDER BY is_picked DESC, updated_at DESC, id DESC
                 LIMIT 1`
              ).get(orderNo, product.code) as PickingOrderItem | undefined
            }

            if (pickItem) {
              const revokedQtyPieces = log.quantity * 1000
              const currentPickedQty = pickItem.picked_quantity ?? 0
              const nextPickedQty = Math.max(0, currentPickedQty - revokedQtyPieces)
              if (nextPickedQty <= 0) {
                db.prepare(`
                  UPDATE picking_order_items
                  SET is_picked = 0, picked_quantity = NULL, pick_remark = '', picked_at = NULL, picked_by = '',
                      updated_at = datetime('now', 'localtime')
                  WHERE id = ?
                `).run(pickItem.id)
              } else {
                const isPicked = nextPickedQty >= pickItem.quantity ? 1 : 0
                db.prepare(`
                  UPDATE picking_order_items
                  SET is_picked = ?, picked_quantity = ?, updated_at = datetime('now', 'localtime')
                  WHERE id = ?
                `).run(isPicked, nextPickedQty, pickItem.id)
              }
            }
          }
        }
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
  const insertInventory = db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`)
  const addInventory = db.prepare(
    `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
  )
  const insertLog = db.prepare(
    `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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
  const insertInventory = db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`)
  const subInventory = db.prepare(
    `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
  )
  const insertLog = db.prepare(
    `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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

const STATS_YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function parseYmdLocal(ymd: string): Date {
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10))
  if (![y, mo, d].every((n) => Number.isFinite(n))) {
    throw new Error('日期无效')
  }
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    throw new Error('日期无效')
  }
  return dt
}

export interface WeeklyOutboundRow {
  description: string
  quantity: number
}

export interface WeeklyInboundRemarkRow {
  remark: string
  count: number
}

export interface WeeklyInventoryStats {
  topOutbound: WeeklyOutboundRow[]
  topInbound: WeeklyOutboundRow[]
  topInboundRemarks: WeeklyInboundRemarkRow[]
}

/** 按日历日（含起止日全天）筛选流水，汇总出入库排行；created_at 为本地时间字符串 */
export function getInventoryRankingStats(startDate: string, endDate: string): WeeklyInventoryStats {
  const s = startDate.trim()
  const e = endDate.trim()
  if (!STATS_YMD_RE.test(s) || !STATS_YMD_RE.test(e)) {
    throw new Error('日期须为 YYYY-MM-DD')
  }
  const start = parseYmdLocal(s)
  const end = parseYmdLocal(e)
  if (start > end) {
    throw new Error('开始日期不能晚于结束日期')
  }
  const spanDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
  if (spanDays > 366 * 5) {
    throw new Error('查询区间最长 5 年')
  }

  const topOutbound = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(p.description), ''), p.name, p.code) AS description,
              SUM(l.quantity) AS quantity
       FROM inventory_logs l
       JOIN products p ON p.id = l.product_id
       WHERE l.type = 'out'
         AND date(l.created_at) >= date(?)
         AND date(l.created_at) <= date(?)
       GROUP BY l.product_id
       ORDER BY quantity DESC
       LIMIT 50`
    )
    .all(s, e) as WeeklyOutboundRow[]

  const topInbound = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(p.description), ''), p.name, p.code) AS description,
              SUM(l.quantity) AS quantity
       FROM inventory_logs l
       JOIN products p ON p.id = l.product_id
       WHERE l.type = 'in'
         AND date(l.created_at) >= date(?)
         AND date(l.created_at) <= date(?)
       GROUP BY l.product_id
       ORDER BY quantity DESC
       LIMIT 50`
    )
    .all(s, e) as WeeklyOutboundRow[]

  const topInboundRemarks = db
    .prepare(
      `SELECT l.remark AS remark, COUNT(*) AS count
       FROM inventory_logs l
       WHERE l.type = 'in'
         AND date(l.created_at) >= date(?)
         AND date(l.created_at) <= date(?)
         AND TRIM(COALESCE(l.remark, '')) != ''
       GROUP BY l.remark
       ORDER BY count DESC
       LIMIT 50`
    )
    .all(s, e) as WeeklyInboundRemarkRow[]

  return { topOutbound, topInbound, topInboundRemarks }
}

export interface InventoryTrendPoint {
  time: string
  balance: number
}

/** 按流水重算某物料每次变动后的库存，用于走势折线图（不限 500 条） */
export function getInventoryTrendPoints(productId: number): InventoryTrendPoint[] {
  const row = db.prepare('SELECT quantity, updated_at FROM inventory WHERE product_id = ?').get(productId) as
    | { quantity: number; updated_at: string }
    | undefined
  const current = row?.quantity ?? 0

  const logs = db
    .prepare(
      `SELECT type, quantity, created_at FROM inventory_logs
       WHERE product_id = ? ORDER BY datetime(created_at) ASC`
    )
    .all(productId) as { type: string; quantity: number; created_at: string }[]

  if (logs.length === 0) {
    const t = row?.updated_at ?? new Date().toISOString().slice(0, 19).replace('T', ' ')
    return [{ time: t, balance: current }]
  }

  let sumDelta = 0
  for (const log of logs) {
    sumDelta += log.type === 'in' ? log.quantity : -log.quantity
  }
  let balance = current - sumDelta
  const points: InventoryTrendPoint[] = []
  for (const log of logs) {
    balance += log.type === 'in' ? log.quantity : -log.quantity
    points.push({ time: log.created_at, balance })
  }
  return points
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
          `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
        ).run(totalDeductInThousands, productId)
      } else {
        db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`).run(
          productId,
          -totalDeductInThousands
        )
      }

      db.prepare(
        `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
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
  db.prepare('DELETE FROM picking_order_splits WHERE picking_item_id = ?').run(id)
  db.prepare('DELETE FROM picking_order_items WHERE id = ?').run(id)
  return true
}

export function deletePickingOrderByOrderNo(orderNo: string): number {
  db.prepare(
    'DELETE FROM picking_order_splits WHERE picking_item_id IN (SELECT id FROM picking_order_items WHERE order_no = ?)'
  ).run(orderNo)
  const result = db.prepare('DELETE FROM picking_order_items WHERE order_no = ?').run(orderNo)
  return result.changes
}

export interface PickingOrderSummary {
  order_no: string
  total_count: number
  picked_count: number
  pending_count: number
}

export function getPickingOrderList(): PickingOrderSummary[] {
  const rows = db.prepare(`
    SELECT order_no,
           COUNT(*) as total_count,
           SUM(CASE WHEN is_picked = 1 THEN 1 ELSE 0 END) as picked_count,
           SUM(CASE WHEN is_picked = 0 THEN 1 ELSE 0 END) as pending_count
    FROM picking_order_items
    GROUP BY order_no
    ORDER BY order_no ASC
  `).all() as { order_no: string; total_count: number; picked_count: number; pending_count: number }[]
  return rows
}

export function getAllPickingOrderItems(): PickingOrderItem[] {
  return db.prepare(
    'SELECT * FROM picking_order_items ORDER BY order_no ASC, seq_no ASC'
  ).all() as PickingOrderItem[]
}

export function getPickingOrderItemsByOrderNos(orderNos: string[]): PickingOrderItem[] {
  if (orderNos.length === 0) return []
  const placeholders = orderNos.map(() => '?').join(',')
  return db.prepare(
    `SELECT * FROM picking_order_items WHERE order_no IN (${placeholders}) ORDER BY order_no ASC, seq_no ASC`
  ).all(...orderNos) as PickingOrderItem[]
}

export function markDeliveryNotePrinted(ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const result = db.prepare(
    `UPDATE picking_order_items
     SET delivery_note_printed = 1,
         delivery_note_printed_at = datetime('now', 'localtime'),
         updated_at = datetime('now', 'localtime')
     WHERE id IN (${placeholders})`
  ).run(...ids)
  return result.changes
}

export function batchDeletePickingOrdersByOrderNos(orderNos: string[]): number {
  if (orderNos.length === 0) return 0
  const placeholders = orderNos.map(() => '?').join(',')
  const deleteSplitsStmt = db.prepare(
    `DELETE FROM picking_order_splits WHERE picking_item_id IN (SELECT id FROM picking_order_items WHERE order_no IN (${placeholders}))`
  )
  const deleteItemsStmt = db.prepare('DELETE FROM picking_order_items WHERE order_no = ?')
  let total = 0
  const txn = db.transaction(() => {
    deleteSplitsStmt.run(...orderNos)
    for (const no of orderNos) {
      const r = deleteItemsStmt.run(no)
      total += r.changes
    }
  })
  txn()
  return total
}

export function deleteAllPickingOrders(): number {
  db.prepare('DELETE FROM picking_order_splits').run()
  const result = db.prepare('DELETE FROM picking_order_items').run()
  return result.changes
}

export function importPickingOrderItems(
  items: NewPickingOrderItem[],
  overwriteMode = false
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

  const deleteSplitsForUnpickedByOrderNo = db.prepare(
    'DELETE FROM picking_order_splits WHERE picking_item_id IN (SELECT id FROM picking_order_items WHERE order_no = ? AND is_picked = 0)'
  )
  const deleteUnpickedByOrderNo = db.prepare(
    'DELETE FROM picking_order_items WHERE order_no = ? AND is_picked = 0'
  )

  const txn = db.transaction(() => {
    if (overwriteMode && items.length > 0) {
      const orderNos = [...new Set(items.map((i) => i.order_no).filter(Boolean))]
      for (const no of orderNos) {
        deleteSplitsForUnpickedByOrderNo.run(no)
        deleteUnpickedByOrderNo.run(no)
      }
    }
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
  items: {
    id: number
    pickedQty: number
    remark: string
    pickedBy: string
    components?: { code: string; quantity: number }[]
  }[],
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
  const insertInventory = db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`)
  const subInventory = db.prepare(
    `UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
  )
  const insertLog = db.prepare(
    `INSERT INTO inventory_logs (product_id, type, quantity, remark, operator_id, operator_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`
  )
  const markPicked = db.prepare(`
    UPDATE picking_order_items
    SET is_picked = 1, picked_quantity = ?, pick_remark = ?, picked_at = datetime('now', 'localtime'), picked_by = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)
  // 部分出库：累加 picked_quantity，未配齐时 is_picked 保持 0
  const markPartialPicked = db.prepare(`
    UPDATE picking_order_items
    SET picked_quantity = ?, pick_remark = ?, picked_at = datetime('now', 'localtime'), picked_by = ?,
        is_picked = CASE WHEN ? >= quantity THEN 1 ELSE 0 END,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  // 拆分明细表：同一配货行多次确认时，始终以最后一次为准，先清空再重新写入
  const clearSplits = db.prepare('DELETE FROM picking_order_splits WHERE picking_item_id = ?')
  const insertSplit = db.prepare(
    'INSERT INTO picking_order_splits (picking_item_id, component_code, quantity_pieces) VALUES (?, ?, ?)'
  )

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

      const components = Array.isArray(item.components)
        ? item.components.filter(
            (c) => c && typeof c.code === 'string' && !isNaN(Number(c.quantity)) && Number(c.quantity) > 0
          )
        : []

      if (components.length > 0) {
        // 先清空该配货行的历史拆分记录，再写入本次的子件明细
        clearSplits.run(pickItem.id)

        for (const comp of components) {
          const compProduct = findProduct.get(comp.code) as { id: number } | undefined
          const qtyCompPieces = Number(comp.quantity)
          const qtyCompThousands = qtyCompPieces / 1000

          // 按“只”保存到拆分明细表，便于历史还原
          insertSplit.run(pickItem.id, comp.code, qtyCompPieces)

          if (compProduct) {
            const existing = findInventory.get(compProduct.id)
            if (existing) {
              subInventory.run(qtyCompThousands, compProduct.id)
            } else {
              insertInventory.run(compProduct.id, -qtyCompThousands)
            }
            const baseRemark = `[配货拆出库] 单号${pickItem.order_no} 序号${pickItem.seq_no} 原编码${pickItem.product_code} -> 子件${comp.code} 数量${qtyCompPieces}只=${qtyCompThousands}千`
            const remarkText = item.remark ? `${baseRemark}; ${item.remark}` : baseRemark
            insertLog.run(
              compProduct.id,
              'out',
              qtyCompThousands,
              remarkText,
              operatorId ?? null,
              operatorName ?? ''
            )
          } else {
            inventoryErrors.push(
              `物料「${comp.code}」(拆分自单号${pickItem.order_no} 序号${pickItem.seq_no}) 不在库存系统中，已标记配货但未扣减库存`
            )
          }
        }
        const qty = item.pickedQty > 0 ? item.pickedQty : pickItem.quantity
        markPicked.run(qty, item.remark || '', item.pickedBy, item.id)
        success++
      } else {
        // 普通出库（不拆）：支持部分出库，累加 picked_quantity
        clearSplits.run(pickItem.id)

        const orderQty = pickItem.quantity
        const alreadyPicked = pickItem.picked_quantity ?? 0
        const thisOutQty = item.pickedQty > 0 ? item.pickedQty : (orderQty - alreadyPicked)
        const inventoryOutQty = thisOutQty / 1000
        const newCumulative = alreadyPicked + thisOutQty
        const isComplete = newCumulative >= orderQty

        const product = findProduct.get(pickItem.product_code) as { id: number } | undefined
        if (product) {
          const existing = findInventory.get(product.id)
          if (existing) {
            subInventory.run(inventoryOutQty, product.id)
          } else {
            insertInventory.run(product.id, -inventoryOutQty)
          }
          const remarkBase = item.remark || `单号${pickItem.order_no} 本次${thisOutQty}${pickItem.unit || '只'}`
          const remarkWithSeq = remarkBase.includes('序号') ? remarkBase : `${remarkBase}，序号${pickItem.seq_no}`
          const remarkText = `[配货出库] ${remarkWithSeq}`
          insertLog.run(product.id, 'out', inventoryOutQty, remarkText, operatorId ?? null, operatorName ?? '')
        } else {
          inventoryErrors.push(`物料「${pickItem.product_code}」不在库存系统中，已标记配货但未扣减库存`)
        }
        if (isComplete) {
          markPicked.run(orderQty, item.remark || '', item.pickedBy, pickItem.id)
        } else {
          markPartialPicked.run(newCumulative, item.remark || '', item.pickedBy, newCumulative, pickItem.id)
        }
        success++
      }
    }
  })
  txn()
  return { success, failed, errors, inventoryErrors }
}

// 查询某一配货行的历史拆分明细（按“只”为单位）
export function getPickingOrderSplits(
  pickingItemId: number
): { component_code: string; quantity_pieces: number }[] {
  const stmt = db.prepare(
    'SELECT component_code, quantity_pieces FROM picking_order_splits WHERE picking_item_id = ? ORDER BY id ASC'
  )
  return stmt.all(pickingItemId) as { component_code: string; quantity_pieces: number }[]
}

/**
 * 重置配货项（撤销出库），恢复库存并清除配货状态
 * - 拆分出库：按 picking_order_splits 中记录的子件，逐条恢复库存
 * - 普通出库：恢复主物料库存
 * 恢复后清除拆分明细、重置 is_picked 等，以便用户更改拆分明细后重新配货
 */
export function resetPickingItems(
  ids: number[],
  operatorId?: number,
  operatorName?: string
): number {
  if (ids.length === 0) return 0

  const getItem = db.prepare('SELECT * FROM picking_order_items WHERE id = ?')
  const getSplits = db.prepare(
    'SELECT component_code, quantity_pieces FROM picking_order_splits WHERE picking_item_id = ? ORDER BY id ASC'
  )
  const getOutLogsBySplitMarkers = db.prepare(`
    SELECT id, product_id, quantity
    FROM inventory_logs
    WHERE type = 'out' AND remark LIKE '%[配货拆出库]%'
      AND instr(remark, ?) > 0
      AND instr(remark, ?) > 0
  `)
  const getOutLogsByOrderAndProduct = db.prepare(`
    SELECT id, product_id, quantity
    FROM inventory_logs
    WHERE type = 'out' AND product_id = ? AND remark LIKE '%[配货出库]%'
      AND (
        instr(remark, ?) > 0 OR instr(remark, ?) > 0
      )
  `)
  const getOutLogsByOrderProductAndSeq = db.prepare(`
    SELECT id, product_id, quantity
    FROM inventory_logs
    WHERE type = 'out' AND product_id = ? AND remark LIKE '%[配货出库]%'
      AND instr(remark, ?) > 0
      AND instr(remark, ?) > 0
  `)
  const deleteLogById = db.prepare('DELETE FROM inventory_logs WHERE id = ?')
  const findProduct = db.prepare('SELECT id FROM products WHERE code = ?')
  const findInventory = db.prepare('SELECT id FROM inventory WHERE product_id = ?')
  const insertInventory = db.prepare(`INSERT INTO inventory (product_id, quantity, updated_at) VALUES (?, ?, datetime('now', 'localtime'))`)
  const addInventory = db.prepare(
    `UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now', 'localtime') WHERE product_id = ?`
  )
  const deleteSplits = db.prepare('DELETE FROM picking_order_splits WHERE picking_item_id = ?')
  const resetItem = db.prepare(`
    UPDATE picking_order_items
    SET is_picked = 0, picked_quantity = NULL, pick_remark = '', picked_at = NULL, picked_by = '', updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  const resetPartialItem = db.prepare(`
    UPDATE picking_order_items
    SET picked_quantity = NULL, pick_remark = '', picked_at = NULL, picked_by = '', updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  const txn = db.transaction(() => {
    let count = 0
    for (const id of ids) {
      const item = getItem.get(id) as PickingOrderItem | undefined
      if (!item) continue

      // 部分出库（is_picked=0 但 picked_quantity>0）：恢复库存并清除累计出库
      if (item.is_picked === 0 && (item.picked_quantity ?? 0) > 0) {
        const prod = findProduct.get(item.product_code) as { id: number } | undefined
        if (prod) {
          const orderMarkerA = `订单号：${item.order_no}`
          const orderMarkerB = `单号${item.order_no}`
          const seqMarker = `序号${item.seq_no}`
          const relatedLogsBySeq = getOutLogsByOrderProductAndSeq.all(
            prod.id,
            orderMarkerA,
            seqMarker
          ) as { id: number; product_id: number; quantity: number }[]
          const relatedLogs = (relatedLogsBySeq.length > 0 ? relatedLogsBySeq : getOutLogsByOrderAndProduct.all(
            prod.id,
            orderMarkerA,
            orderMarkerB
          )) as { id: number; product_id: number; quantity: number }[]
          const restoreQty = relatedLogs.reduce((sum, row) => sum + row.quantity, 0)
          if (restoreQty > 0) {
            const existing = findInventory.get(prod.id)
            if (existing) {
              addInventory.run(restoreQty, prod.id)
            } else {
              insertInventory.run(prod.id, restoreQty)
            }
            for (const row of relatedLogs) {
              deleteLogById.run(row.id)
            }
          }
        }
        resetPartialItem.run(id)
        count++
        continue
      }

      if (item.is_picked !== 1) continue

      const splits = getSplits.all(id) as { component_code: string; quantity_pieces: number }[]

      if (splits.length > 0) {
        // 拆分出库：恢复库存并删除该配货行对应的拆分出库日志
        const orderMarker = '单号' + item.order_no
        const seqMarker = '序号' + item.seq_no + ' '
        const relatedLogs = getOutLogsBySplitMarkers.all(orderMarker, seqMarker) as {
          id: number
          product_id: number
          quantity: number
        }[]
        if (relatedLogs.length > 0) {
          const restoreMap = new Map<number, number>()
          for (const row of relatedLogs) {
            restoreMap.set(row.product_id, (restoreMap.get(row.product_id) || 0) + row.quantity)
          }
          for (const [productId, restoreQty] of restoreMap.entries()) {
            const existing = findInventory.get(productId)
            if (existing) {
              addInventory.run(restoreQty, productId)
            } else {
              insertInventory.run(productId, restoreQty)
            }
          }
          for (const row of relatedLogs) {
            deleteLogById.run(row.id)
          }
        }
      } else {
        // 普通出库：恢复库存并删除对应出库日志
        const prod = findProduct.get(item.product_code) as { id: number } | undefined
        if (prod) {
          const orderMarkerA = `订单号：${item.order_no}`
          const orderMarkerB = `单号${item.order_no}`
          const seqMarker = `序号${item.seq_no}`
          const relatedLogsBySeq = getOutLogsByOrderProductAndSeq.all(
            prod.id,
            orderMarkerA,
            seqMarker
          ) as { id: number; product_id: number; quantity: number }[]
          const relatedLogs = (relatedLogsBySeq.length > 0 ? relatedLogsBySeq : getOutLogsByOrderAndProduct.all(
            prod.id,
            orderMarkerA,
            orderMarkerB
          )) as { id: number; product_id: number; quantity: number }[]
          const restoreQty = relatedLogs.reduce((sum, row) => sum + row.quantity, 0)
          if (restoreQty > 0) {
            const existing = findInventory.get(prod.id)
            if (existing) {
              addInventory.run(restoreQty, prod.id)
            } else {
              insertInventory.run(prod.id, restoreQty)
            }
            for (const row of relatedLogs) {
              deleteLogById.run(row.id)
            }
          }
        }
      }

      deleteSplits.run(id)
      resetItem.run(id)
      count++
    }
    return count
  })

  return txn()
}
