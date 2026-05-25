import type { Product } from './api'

export interface BatchPrintItem {
  productCode: string
  orderNo: string
  projectName: string
  quantity: number
  unit: string
  description?: string
}

export interface BatchPrintFailure {
  code: string
  reason: string
}

export interface BatchPrintResult {
  success: number
  failed: BatchPrintFailure[]
}

export async function runBatchLabelPrint(
  items: BatchPrintItem[],
  templateType: 'small' | 'large',
  options: {
    renderAndPrint: (
      item: BatchPrintItem,
      product: Product,
      templateType: 'small' | 'large'
    ) => Promise<void>
    resolveProduct: (item: BatchPrintItem) => Promise<Product>
    onProgress?: (current: number, total: number) => void
  }
): Promise<BatchPrintResult> {
  const failed: BatchPrintFailure[] = []
  let success = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    options.onProgress?.(i + 1, items.length)
    try {
      const product = await options.resolveProduct(item)
      await options.renderAndPrint(item, product, templateType)
      success++
    } catch (err) {
      failed.push({
        code: item.productCode,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return { success, failed }
}
