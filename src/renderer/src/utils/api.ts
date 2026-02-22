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
}

export interface UserRecord {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'user'
  can_view_inventory: number
  can_manage_data: number
  created_at: string
  updated_at: string
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
  }) => request<UserRecord>('/users', { method: 'POST', body: JSON.stringify(data) }),

  updateUser: (
    id: number,
    data: { display_name?: string; role?: string; can_view_inventory?: boolean; can_manage_data?: boolean; password?: string }
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

  // Print
  printAndDeduct: (productId: number, quantity: number, printCount: number, labelType: string) =>
    request('/print', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity, printCount, labelType })
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
