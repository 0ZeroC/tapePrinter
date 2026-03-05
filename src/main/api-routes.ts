import { Router } from 'express'
import multer from 'multer'
import {
  searchProducts,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProducts,
  deleteAllProducts,
  importProducts,
  stockIn,
  stockOut,
  getInventory,
  getAllInventory,
  setInventory,
  importInventory,
  getInventoryLogs,
  deleteInventoryLogs,
  revokeInventoryLog,
  batchStockIn,
  batchStockOut,
  printAndDeductInventory,
  verifyPassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  getUserById,
  getPickingOrderItems,
  getPickingOrderItemById,
  getPickingOrderList,
  getAllPickingOrderItems,
  getPickingOrderItemsByOrderNos,
  addPickingOrderItem,
  updatePickingOrderItem,
  deletePickingOrderItem,
  deletePickingOrderByOrderNo,
  batchDeletePickingOrdersByOrderNos,
  deleteAllPickingOrders,
  importPickingOrderItems,
  confirmPickingItems,
  resetPickingItems,
  getPickingOrderSplits,
  type Product
} from './database'
import {
  signToken,
  authMiddleware,
  adminMiddleware,
  inventoryViewMiddleware,
  dataManageMiddleware,
  pickingOrderManageMiddleware,
  type AuthRequest,
  type JwtPayload
} from './auth'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

function ok(data?: unknown) {
  return { success: true, data }
}

function fail(error: string) {
  return { success: false, error }
}

// ==============================
// Auth
// ==============================

router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      res.json(fail('请输入用户名和密码'))
      return
    }
    const user = verifyPassword(username, password)
    if (!user) {
      res.json(fail('用户名或密码错误'))
      return
    }
    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role as 'admin' | 'user',
      canViewInventory: user.can_view_inventory === 1 || user.role === 'admin',
      canManageData: user.can_manage_data === 1 || user.role === 'admin'
    }
    const token = signToken(payload)
    res.json(ok({ token, user: payload }))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/auth/me', authMiddleware, (req: AuthRequest, res) => {
  const user = getUserById(req.user!.userId)
  if (!user) {
    res.status(401).json(fail('用户不存在'))
    return
  }
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role as 'admin' | 'user',
    canViewInventory: user.can_view_inventory === 1 || user.role === 'admin',
    canManageData: user.can_manage_data === 1 || user.role === 'admin'
  }
  res.json(ok(payload))
})

router.post('/auth/change-password', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      res.json(fail('请输入旧密码和新密码'))
      return
    }
    if (newPassword.length < 4) {
      res.json(fail('新密码至少4位'))
      return
    }
    const result = changePassword(req.user!.userId, oldPassword, newPassword)
    if (!result) {
      res.json(fail('旧密码错误'))
      return
    }
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// Users (admin only)
// ==============================

router.get('/users', authMiddleware, adminMiddleware, (_req, res) => {
  try {
    res.json(ok(getAllUsers()))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { username, password, display_name, role, can_view_inventory, can_manage_data } = req.body
    if (!username || !password) {
      res.json(fail('用户名和密码不能为空'))
      return
    }
    const user = createUser(
      username,
      password,
      display_name || username,
      role || 'user',
      can_view_inventory ? 1 : 0,
      can_manage_data ? 1 : 0
    )
    const { password_hash: _, ...safe } = user as any
    res.json(ok(safe))
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('UNIQUE')) {
      res.json(fail('用户名已存在'))
    } else {
      res.json(fail(msg))
    }
  }
})

router.put('/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { display_name, role, can_view_inventory, can_manage_data, password } = req.body
    const data: any = {}
    if (display_name !== undefined) data.display_name = display_name
    if (role !== undefined) data.role = role
    if (can_view_inventory !== undefined) data.can_view_inventory = can_view_inventory ? 1 : 0
    if (can_manage_data !== undefined) data.can_manage_data = can_manage_data ? 1 : 0
    if (password) data.password = password
    const user = updateUser(id, data)
    if (!user) {
      res.json(fail('用户不存在'))
      return
    }
    const { password_hash: _, ...safe } = user as any
    res.json(ok(safe))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id)
    if (id === req.user!.userId) {
      res.json(fail('不能删除自己'))
      return
    }
    deleteUser(id)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// Products
// ==============================

router.get('/products/search', authMiddleware, (req, res) => {
  try {
    const q = (req.query.q as string) || ''
    res.json(ok(searchProducts(q)))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/products', authMiddleware, dataManageMiddleware, (_req, res) => {
  try {
    res.json(ok(getAllProducts()))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/products', authMiddleware, dataManageMiddleware, (req, res) => {
  try {
    const product = createProduct(req.body)
    res.json(ok(product))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.put('/products/:id', authMiddleware, dataManageMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const product = updateProduct(id, req.body)
    res.json(ok(product))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/products/:id', authMiddleware, dataManageMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    deleteProduct(id)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/products/batch-delete', authMiddleware, dataManageMiddleware, (req, res) => {
  try {
    const { ids } = req.body
    const count = deleteProducts(ids)
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/products', authMiddleware, adminMiddleware, (_req, res) => {
  try {
    const count = deleteAllProducts()
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/products/import', authMiddleware, dataManageMiddleware, (req, res) => {
  try {
    const products = req.body as Omit<Product, 'id' | 'created_at' | 'updated_at'>[]
    const result = importProducts(products)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// Inventory
// ==============================

router.get('/inventory', authMiddleware, inventoryViewMiddleware, (_req, res) => {
  try {
    res.json(ok(getAllInventory()))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/inventory/logs', authMiddleware, inventoryViewMiddleware, (req, res) => {
  try {
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined
    const type = req.query.type as 'in' | 'out' | undefined
    res.json(ok(getInventoryLogs(productId, type)))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/logs/batch-delete', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      res.json(fail('请选择要删除的记录'))
      return
    }
    const count = deleteInventoryLogs(ids)
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/inventory/:productId', authMiddleware, inventoryViewMiddleware, (req, res) => {
  try {
    const productId = parseInt(req.params.productId)
    res.json(ok(getInventory(productId)))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/stock-in', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { productId, quantity, remark } = req.body
    stockIn(productId, quantity, remark, req.user!.userId, req.user!.displayName)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/stock-out', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { productId, quantity, remark } = req.body
    stockOut(productId, quantity, remark, req.user!.userId, req.user!.displayName)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/logs/:id/revoke', authMiddleware, inventoryViewMiddleware, (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id)
    revokeInventoryLog(id, req.user!.userId, req.user!.displayName)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/batch-stock-in', authMiddleware, (req: AuthRequest, res) => {
  try {
    const items = req.body as { code: string; quantity: number; remark: string }[]
    if (!Array.isArray(items) || items.length === 0) {
      res.json(fail('导入数据为空'))
      return
    }
    const result = batchStockIn(items, req.user!.userId, req.user!.displayName)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/batch-stock-out', authMiddleware, (req: AuthRequest, res) => {
  try {
    const items = req.body as { code: string; quantity: number; remark: string }[]
    if (!Array.isArray(items) || items.length === 0) {
      res.json(fail('导入数据为空'))
      return
    }
    const result = batchStockOut(items, req.user!.userId, req.user!.displayName)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/inventory/import', authMiddleware, inventoryViewMiddleware, (req: AuthRequest, res) => {
  try {
    const items = req.body as { code: string; quantity: number }[]
    if (!Array.isArray(items) || items.length === 0) {
      res.json(fail('导入数据为空'))
      return
    }
    const result = importInventory(items, req.user!.userId, req.user!.displayName)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.put('/inventory/:productId', authMiddleware, inventoryViewMiddleware, (req: AuthRequest, res) => {
  try {
    const productId = parseInt(req.params.productId)
    const { quantity, remark } = req.body
    setInventory(productId, quantity, remark, req.user!.userId, req.user!.displayName)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// Print (with inventory deduction)
// ==============================

router.post('/print', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { productId, quantity, printCount, labelType, skipInventory } = req.body
    printAndDeductInventory(
      productId,
      quantity,
      printCount,
      labelType || 'small',
      req.user!.userId,
      req.user!.displayName,
      !!skipInventory
    )
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// File upload (Excel import)
// ==============================

router.post('/upload/excel', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.json(fail('没有上传文件'))
      return
    }
    const buffer = req.file.buffer
    res.json(ok({ buffer: buffer.toString('base64') }))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

// ==============================
// Picking Orders
// ==============================

router.get('/picking-orders', authMiddleware, (req, res) => {
  try {
    const orderNo = (req.query.orderNo as string || '').trim()
    if (!orderNo) {
      res.json(ok([]))
      return
    }
    res.json(ok(getPickingOrderItems(orderNo)))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/picking-orders/order-list', authMiddleware, (req, res) => {
  try {
    res.json(ok(getPickingOrderList()))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/picking-orders/export-data', authMiddleware, (req, res) => {
  try {
    const orderNosParam = req.query.orderNos as string
    if (orderNosParam) {
      const orderNos = orderNosParam.split(',').map((s) => s.trim()).filter(Boolean)
      res.json(ok(getPickingOrderItemsByOrderNos(orderNos)))
    } else {
      res.json(ok(getAllPickingOrderItems()))
    }
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/picking-orders/batch-delete', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const { orderNos } = req.body
    if (!Array.isArray(orderNos) || orderNos.length === 0) {
      res.json(fail('请选择要删除的订单号'))
      return
    }
    const count = batchDeletePickingOrdersByOrderNos(orderNos.map((s: string) => String(s).trim()).filter(Boolean))
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/picking-orders/all', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const count = deleteAllPickingOrders()
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/picking-orders', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const item = addPickingOrderItem(req.body)
    res.json(ok(item))
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('UNIQUE')) {
      res.json(fail('该订单下已存在相同序号的物料'))
    } else {
      res.json(fail(msg))
    }
  }
})

router.put('/picking-orders/:id', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const item = updatePickingOrderItem(id, req.body)
    if (!item) {
      res.json(fail('记录不存在'))
      return
    }
    res.json(ok(item))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/picking-orders/by-order/:orderNo', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const orderNo = decodeURIComponent(req.params.orderNo)
    const count = deletePickingOrderByOrderNo(orderNo)
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.delete('/picking-orders/:id', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    deletePickingOrderItem(id)
    res.json(ok())
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/picking-orders/import', authMiddleware, pickingOrderManageMiddleware, (req, res) => {
  try {
    const body = req.body
    const itemList = Array.isArray(body?.items) ? body.items : (Array.isArray(body) ? body : [])
    if (itemList.length === 0) {
      res.json(fail('导入数据为空'))
      return
    }
    const overwrite = body?.overwriteMode === true
    const result = importPickingOrderItems(itemList, overwrite)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/picking-orders/confirm-pick', authMiddleware, (req: AuthRequest, res) => {
  try {
    const items = req.body as {
      id: number
      pickedQty: number
      remark: string
      components?: { code: string; quantity: number }[]
    }[]
    if (!Array.isArray(items) || items.length === 0) {
      res.json(fail('请选择要出库的物料'))
      return
    }
    const itemsWithPicker = items.map((item) => ({
      ...item,
      pickedBy: req.user!.displayName || req.user!.username
    }))
    const result = confirmPickingItems(itemsWithPicker, req.user!.userId, req.user!.displayName)
    res.json(ok(result))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.post('/picking-orders/reset-pick', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      res.json(fail('请选择要重置的记录'))
      return
    }
    const count = resetPickingItems(ids, req.user!.userId, req.user!.displayName)
    res.json(ok(count))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/picking-orders/:id/splits', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (Number.isNaN(id)) {
      res.json(fail('ID 无效'))
      return
    }
    const rows = getPickingOrderSplits(id)
    res.json(ok(rows))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

router.get('/picking-orders/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const item = getPickingOrderItemById(id)
    if (!item) {
      res.json(fail('记录不存在'))
      return
    }
    res.json(ok(item))
  } catch (err) {
    res.json(fail((err as Error).message))
  }
})

export default router
