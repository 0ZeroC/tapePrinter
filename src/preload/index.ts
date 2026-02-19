import { contextBridge, ipcRenderer } from 'electron'

export interface ProductData {
  code: string
  description: string
  name: string
  spec: string
  grade: string
  surface_treatment: string
  material: string
  special_note: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

const api = {
  // 物品搜索
  searchProducts: (query: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:search', query),

  // 获取所有物品
  getAllProducts: (): Promise<ApiResponse> => ipcRenderer.invoke('products:getAll'),

  // 创建物品
  createProduct: (product: ProductData): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:create', product),

  // 更新物品
  updateProduct: (id: number, product: ProductData): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:update', id, product),

  // 删除物品
  deleteProduct: (id: number): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:delete', id),

  // 批量删除物品
  deleteProducts: (ids: number[]): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:deleteBatch', ids),

  // 清空所有物品
  deleteAllProducts: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:deleteAll'),

  // 批量导入物品
  importProducts: (products: ProductData[]): Promise<ApiResponse> =>
    ipcRenderer.invoke('products:import', products),

  // 打开文件选择对话框
  openFileDialog: (): Promise<ApiResponse> => ipcRenderer.invoke('dialog:openFile'),

  // 读取文件
  readFile: (filePath: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('file:read', filePath),

  // 打印标签
  printLabel: (options?: { silent?: boolean }): Promise<ApiResponse> =>
    ipcRenderer.invoke('print:label', options || {}),

  // 入库
  stockIn: (productId: number, quantity: number, remark: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:stockIn', productId, quantity, remark),

  // 出库
  stockOut: (productId: number, quantity: number, remark: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:stockOut', productId, quantity, remark),

  // 获取库存
  getInventory: (productId: number): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:get', productId),

  // 获取出入库记录
  getInventoryLogs: (productId?: number, type?: 'in' | 'out'): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:logs', productId, type),

  // 获取所有库存
  getAllInventory: (): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:getAll'),

  // 手动设置库存
  setInventory: (productId: number, newQuantity: number, remark: string): Promise<ApiResponse> =>
    ipcRenderer.invoke('inventory:set', productId, newQuantity, remark)
}

contextBridge.exposeInMainWorld('api', api)
