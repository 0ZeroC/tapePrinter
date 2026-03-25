const BASE_URL = '/api'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

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

export interface Product extends ProductData {
  id: number
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

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (res.status === 401) {
    setToken(null)
    window.location.reload()
    return { success: false, error: '未登录' }
  }
  return res.json()
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
