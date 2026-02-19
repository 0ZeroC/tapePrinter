import { ipcMain, dialog, BrowserWindow } from 'electron'
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
  getInventoryLogs,
  type Product
} from './database'

export function registerIpcHandlers(): void {
  // 搜索物品
  ipcMain.handle('products:search', (_event, query: string) => {
    try {
      return { success: true, data: searchProducts(query) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 获取所有物品
  ipcMain.handle('products:getAll', () => {
    try {
      return { success: true, data: getAllProducts() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 创建物品
  ipcMain.handle(
    'products:create',
    (_event, product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const created = createProduct(product)
        return { success: true, data: created }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 更新物品
  ipcMain.handle(
    'products:update',
    (_event, id: number, product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        const updated = updateProduct(id, product)
        return { success: true, data: updated }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 删除物品
  ipcMain.handle('products:delete', (_event, id: number) => {
    try {
      const result = deleteProduct(id)
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 批量删除物品
  ipcMain.handle('products:deleteBatch', (_event, ids: number[]) => {
    try {
      const count = deleteProducts(ids)
      return { success: true, data: count }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 清空所有物品
  ipcMain.handle('products:deleteAll', () => {
    try {
      const count = deleteAllProducts()
      return { success: true, data: count }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 批量导入物品
  ipcMain.handle(
    'products:import',
    (_event, products: Omit<Product, 'id' | 'created_at' | 'updated_at'>[]) => {
      try {
        const result = importProducts(products)
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 入库
  ipcMain.handle(
    'inventory:stockIn',
    (_event, productId: number, quantity: number, remark: string) => {
      try {
        stockIn(productId, quantity, remark)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 出库
  ipcMain.handle(
    'inventory:stockOut',
    (_event, productId: number, quantity: number, remark: string) => {
      try {
        stockOut(productId, quantity, remark)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 获取库存
  ipcMain.handle('inventory:get', (_event, productId: number) => {
    try {
      const qty = getInventory(productId)
      return { success: true, data: qty }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 获取所有库存
  ipcMain.handle('inventory:getAll', () => {
    try {
      const list = getAllInventory()
      return { success: true, data: list }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 手动设置库存
  ipcMain.handle(
    'inventory:set',
    (_event, productId: number, newQuantity: number, remark: string) => {
      try {
        setInventory(productId, newQuantity, remark)
        return { success: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 获取出入库记录
  ipcMain.handle(
    'inventory:logs',
    (_event, productId?: number, type?: 'in' | 'out') => {
      try {
        const logs = getInventoryLogs(productId, type)
        return { success: true, data: logs }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
  )

  // 打开文件选择对话框
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Excel 文件', extensions: ['xlsx', 'xls', 'csv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled) return { success: true, data: null }
    return { success: true, data: result.filePaths[0] }
  })

  // 读取文件内容（用于 Excel 导入）
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const fs = await import('fs')
      const buffer = fs.readFileSync(filePath)
      return { success: true, data: buffer }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 打印标签
  ipcMain.handle('print:label', async (_event, options: { silent?: boolean }) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { success: false, error: '没有找到活动窗口' }

      return new Promise((resolve) => {
        win.webContents.print(
          {
            silent: options?.silent || false,
            printBackground: true
          },
          (success, failureReason) => {
            if (success) {
              resolve({ success: true })
            } else {
              resolve({ success: false, error: failureReason })
            }
          }
        )
      })
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
