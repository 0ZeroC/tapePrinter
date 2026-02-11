export interface ProductData {
  code: string
  name: string
  spec: string
  surface_treatment: string
  grade: string
}

export interface Product extends ProductData {
  id: number
  created_at: string
  updated_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
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
  name: string
  spec: string
  surface_treatment: string
  grade: string
}

declare global {
  interface Window {
    api: {
      searchProducts: (query: string) => Promise<ApiResponse<Product[]>>
      getAllProducts: () => Promise<ApiResponse<Product[]>>
      createProduct: (product: ProductData) => Promise<ApiResponse<Product>>
      updateProduct: (id: number, product: ProductData) => Promise<ApiResponse<Product>>
      deleteProduct: (id: number) => Promise<ApiResponse<boolean>>
      importProducts: (products: ProductData[]) => Promise<ApiResponse<ImportResult>>
      openFileDialog: () => Promise<ApiResponse<string | null>>
      readFile: (filePath: string) => Promise<ApiResponse<Buffer>>
      printLabel: (options?: { silent?: boolean }) => Promise<ApiResponse>
      stockIn: (productId: number, quantity: number, remark: string) => Promise<ApiResponse>
      stockOut: (productId: number, quantity: number, remark: string) => Promise<ApiResponse>
      getInventory: (productId: number) => Promise<ApiResponse<number>>
      getInventoryLogs: (productId?: number, type?: 'in' | 'out') => Promise<ApiResponse<InventoryLog[]>>
      getAllInventory: () => Promise<ApiResponse<InventoryWithProduct[]>>
      setInventory: (productId: number, newQuantity: number, remark: string) => Promise<ApiResponse>
    }
  }
}
