const BASE_URL = '/api'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface ProductData {
  code: string
  description: string
  /** 英文描述，双语标签用；可空 */
  description_en?: string
  name: string
  spec: string
  grade: string
  surface_treatment: string
  material: string
  special_note: string
}

export interface ProductDrawingMeta {
  id: number
  product_id: number
  original_name: string
  sort_order: number
  created_at: string
}

export interface Product extends ProductData {
  id: number
  /** 图纸份数 */
  drawings_count: number
  created_at: string
  updated_at: string
}

export interface ImportResult {
  success: number
  failed: number
  errors: string[]
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

export interface WeeklyRankRow {
  description: string
  quantity: number
}

export interface WeeklyRemarkRankRow {
  remark: string
  count: number
}

export interface WeeklyInventoryStats {
  topOutbound: WeeklyRankRow[]
  topInbound: WeeklyRankRow[]
  topInboundRemarks: WeeklyRemarkRankRow[]
}

export type InventoryRankingDateRange = {
  start: string
  end: string
}

export interface InventoryTrendPoint {
  time: string
  balance: number
}

export interface UserInfo {
  userId: number
  username: string
  displayName: string
  role: 'admin' | 'user'
  canViewInventory: boolean
  canManageData: boolean
  canManagePickingOrders: boolean
}

export interface UserRecord {
  id: number
  username: string
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

export interface PickingConfirmResult {
  success: number
  failed: number
  errors: string[]
  inventoryErrors: string[]
}

export type PickingConfirmItemPayload = {
  id: number
  pickedQty: number
  remark: string
  components?: { code: string; quantity: number }[]
}

export interface PickingSplitRow {
  component_code: string
  quantity_pieces: number
}

export interface PickingOrderSummary {
  order_no: string
  total_count: number
  picked_count: number
  pending_count: number
}

/** 副转只拆分规则 CSV（服务端持久化 + 内置默认） */
export interface SubBoltRulesInfo {
  source: 'custom' | 'builtin'
  csv: string
  rowCount: number
  materialCount: number
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('token', token)
  } else {
    localStorage.removeItem('token')
  }
}

/** 按图纸记录 ID 下载文件（需登录），用于预览 */
export async function fetchProductDrawingFileBlob(
  drawingId: number
): Promise<{ blob: Blob; contentType: string }> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/products/drawings/${drawingId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
  } catch {
    throw new Error('无法连接服务，请确认应用已启动')
  }
  if (res.status === 401) {
    setToken(null)
    window.location.reload()
    throw new Error('未登录')
  }
  if (!res.ok) {
    let msg = '加载失败'
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  const contentType = res.headers.get('Content-Type') || 'application/octet-stream'
  const blob = await res.blob()
  return { blob, contentType }
}

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {})
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (!headers['Content-Type'] && !(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  } catch {
    return {
      success: false,
      error:
        '无法连接 API（请用 npm run dev 启动完整 Electron 开发环境，或确认本机 3456 端口服务已启动）'
    }
  }

  if (res.status === 401) {
    setToken(null)
    window.location.reload()
    return { success: false, error: '未登录' }
  }

  const raw = await res.text()
  try {
    const parsed = JSON.parse(raw || 'null') as ApiResponse<T> | null
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SyntaxError('not an object')
    }
    return parsed
  } catch {
    const hint =
      res.status === 502 || res.status === 504
        ? '网关超时或未连上后端（开发模式需同时跑起 Electron 主进程里的 API 服务）'
        : `接口返回非 JSON（HTTP ${res.status}）`
    return { success: false, error: hint }
  }
}

// Auth
export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: UserInfo }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),

  getMe: () => request<UserInfo>('/auth/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    }),

  // Users
  getUsers: () => request<UserRecord[]>('/users'),
  createUser: (data: {
    username: string
    password: string
    display_name: string
    role: string
    can_view_inventory: boolean
    can_manage_data: boolean
    can_manage_picking_orders: boolean
  }) => request<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),

  updateUser: (
    id: number,
    data: {
      display_name?: string
      role?: string
      can_view_inventory?: boolean
      can_manage_data?: boolean
      can_manage_picking_orders?: boolean
      password?: string
    }
  ) => request<UserRecord>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteUser: (id: number) => request(`/users/${id}`, { method: 'DELETE' }),

  // Products
  searchProducts: (query: string) =>
    request<Product[]>(`/products/search?q=${encodeURIComponent(query)}`),

  getAllProducts: () => request<Product[]>('/products'),

  getProductByCode: (code: string) =>
    request<Product>(`/products/code/${encodeURIComponent(code)}`),

  createProduct: (product: ProductData) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(product) }),

  updateProduct: (id: number, product: ProductData) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),

  deleteProduct: (id: number) => request(`/products/${id}`, { method: 'DELETE' }),

  deleteProducts: (ids: number[]) =>
    request<number>('/products/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  deleteAllProducts: () => request<number>('/products', { method: 'DELETE' }),

  importProducts: (products: ProductData[]) =>
    request<ImportResult>('/products/import', {
      method: 'POST',
      body: JSON.stringify(products)
    }),

  listProductDrawings: (productId: number) =>
    request<ProductDrawingMeta[]>(`/products/${productId}/drawings`),

  uploadProductDrawings: (productId: number, files: File[]) => {
    const formData = new FormData()
    for (const f of files) {
      formData.append('files', f)
    }
    return request<{ drawings: ProductDrawingMeta[]; product: Product }>(
      `/products/${productId}/drawings`,
      { method: 'POST', body: formData, headers: {} }
    )
  },

  deleteProductDrawing: (drawingId: number) =>
    request<{ product: Product }>(`/products/drawings/${drawingId}`, { method: 'DELETE' }),

  // Inventory
  getAllInventory: () => request<InventoryWithProduct[]>('/inventory'),

  getInventory: (productId: number) => request<number>(`/inventory/${productId}`),

  stockIn: (productId: number, quantity: number, remark: string) =>
    request('/inventory/stock-in', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity, remark })
    }),

  stockOut: (productId: number, quantity: number, remark: string) =>
    request('/inventory/stock-out', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity, remark })
    }),

  setInventory: (productId: number, quantity: number, remark: string) =>
    request(`/inventory/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity, remark })
    }),

  importInventory: (items: { code: string; quantity: number }[]) =>
    request<ImportResult>('/inventory/import', {
      method: 'POST',
      body: JSON.stringify(items)
    }),

  getInventoryLogs: (productId?: number, type?: 'in' | 'out') => {
    const params = new URLSearchParams()
    if (productId) params.set('productId', String(productId))
    if (type) params.set('type', type)
    const qs = params.toString()
    return request<InventoryLog[]>(`/inventory/logs${qs ? '?' + qs : ''}`)
  },

  getInventoryRankingStats: (range: InventoryRankingDateRange) =>
    request<WeeklyInventoryStats>(
      `/inventory/stats/weekly?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
    ),

  getInventoryTrend: (productId: number) =>
    request<InventoryTrendPoint[]>(`/inventory/trend/${productId}`),

  deleteInventoryLogs: (ids: number[]) =>
    request<number>('/inventory/logs/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  revokeInventoryLog: (id: number) =>
    request(`/inventory/logs/${id}/revoke`, { method: 'POST' }),

  updateInventoryInLog: (id: number, quantity: number, remark: string) =>
    request(`/inventory/logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity, remark })
    }),

  batchStockIn: (items: { code: string; quantity: number; remark: string }[]) =>
    request<ImportResult>('/inventory/batch-stock-in', {
      method: 'POST',
      body: JSON.stringify(items)
    }),

  batchStockOut: (items: { code: string; quantity: number; remark: string }[]) =>
    request<ImportResult>('/inventory/batch-stock-out', {
      method: 'POST',
      body: JSON.stringify(items)
    }),

  // Print（skipInventory 为 true 时不扣减库存）
  printAndDeduct: (
    productId: number,
    quantity: number,
    printCount: number,
    labelType: string,
    skipInventory: boolean = false
  ) =>
    request('/print', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity, printCount, labelType, skipInventory })
    }),

  // Picking Orders
  getPickingOrderItems: (orderNo: string) =>
    request<PickingOrderItem[]>(`/picking-orders?orderNo=${encodeURIComponent(orderNo)}`),

  getPickingOrderList: () =>
    request<PickingOrderSummary[]>('/picking-orders/order-list'),

  getPickingOrderExportData: (orderNos?: string[]) =>
    request<PickingOrderItem[]>(
      orderNos?.length
        ? `/picking-orders/export-data?orderNos=${orderNos.map(encodeURIComponent).join(',')}`
        : '/picking-orders/export-data'
    ),

  batchDeletePickingOrders: (orderNos: string[]) =>
    request<number>('/picking-orders/batch-delete', { method: 'POST', body: JSON.stringify({ orderNos }) }),

  deleteAllPickingOrders: () =>
    request<number>('/picking-orders/all', { method: 'DELETE' }),

  addPickingOrderItem: (item: Omit<PickingOrderItem, 'id' | 'is_picked' | 'picked_quantity' | 'pick_remark' | 'picked_at' | 'picked_by' | 'delivery_note_printed' | 'delivery_note_printed_at' | 'created_at' | 'updated_at'>) =>
    request<PickingOrderItem>('/picking-orders', { method: 'POST', body: JSON.stringify(item) }),

  updatePickingOrderItem: (id: number, data: Partial<Omit<PickingOrderItem, 'id' | 'is_picked' | 'picked_quantity' | 'pick_remark' | 'picked_at' | 'picked_by' | 'delivery_note_printed' | 'delivery_note_printed_at' | 'created_at' | 'updated_at'>>) =>
    request<PickingOrderItem>(`/picking-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deletePickingOrderItem: (id: number) =>
    request(`/picking-orders/${id}`, { method: 'DELETE' }),

  deletePickingOrderByOrderNo: (orderNo: string) =>
    request<number>(`/picking-orders/by-order/${encodeURIComponent(orderNo)}`, { method: 'DELETE' }),

  importPickingOrderItems: (
    items: Omit<PickingOrderItem, 'id' | 'is_picked' | 'picked_quantity' | 'pick_remark' | 'picked_at' | 'picked_by' | 'delivery_note_printed' | 'delivery_note_printed_at' | 'created_at' | 'updated_at'>[],
    overwriteMode?: boolean
  ) =>
    request<ImportResult>('/picking-orders/import', {
      method: 'POST',
      body: JSON.stringify({ items, overwriteMode: !!overwriteMode })
    }),

  confirmPickingItems: (items: PickingConfirmItemPayload[]) =>
    request<PickingConfirmResult>('/picking-orders/confirm-pick', { method: 'POST', body: JSON.stringify(items) }),

  resetPickingItems: (ids: number[]) =>
    request<number>('/picking-orders/reset-pick', { method: 'POST', body: JSON.stringify({ ids }) }),

  markDeliveryNotePrinted: (ids: number[]) =>
    request<number>('/picking-orders/mark-delivery-note-printed', { method: 'POST', body: JSON.stringify({ ids }) }),

  getPickingOrderSplits: (id: number) =>
    request<PickingSplitRow[]>(`/picking-orders/${id}/splits`),

  getSubBoltRules: () => request<SubBoltRulesInfo>('/picking-orders/sub-bolt-rules'),

  setSubBoltRules: (csv: string) =>
    request<SubBoltRulesInfo>('/picking-orders/sub-bolt-rules', {
      method: 'PUT',
      body: JSON.stringify({ csv })
    }),

  // File upload
  uploadExcel: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ buffer: string }>('/upload/excel', {
      method: 'POST',
      body: formData,
      headers: {}
    })
  }
}
