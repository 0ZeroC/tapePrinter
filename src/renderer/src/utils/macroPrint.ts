import type { MacroBatchItem } from '../../../common/macroTypes'
import type { PickingOrderItem } from './api'

const MACRO_SMALL_KEY = 'tapePrinter:macroScriptSmall'
const MACRO_LARGE_KEY = 'tapePrinter:macroScriptLarge'

export function getMacroScriptPath(templateType: 'small' | 'large'): string {
  const key = templateType === 'small' ? MACRO_SMALL_KEY : MACRO_LARGE_KEY
  return localStorage.getItem(key) ?? ''
}

export function setMacroScriptPath(templateType: 'small' | 'large', path: string): void {
  const key = templateType === 'small' ? MACRO_SMALL_KEY : MACRO_LARGE_KEY
  if (path.trim()) {
    localStorage.setItem(key, path.trim())
  } else {
    localStorage.removeItem(key)
  }
}

export function pickingItemToBatchPrintItem(item: PickingOrderItem): MacroBatchItem {
  return {
    productCode: item.product_code,
    orderNo: item.order_no,
    projectName: item.project_name || '',
    quantity: item.quantity,
    unit: item.unit || '只',
    description: item.description || item.product_code
  }
}

export async function getDefaultMacroScriptPath(
  templateType: 'small' | 'large'
): Promise<string> {
  const saved = getMacroScriptPath(templateType)
  if (saved) return saved
  if (!window.electronAPI?.getMacroScriptsDir) return ''
  const dir = await window.electronAPI.getMacroScriptsDir()
  const fileName = templateType === 'small' ? 'label-small.json' : 'label-large.json'
  return `${dir}/${fileName}`
}
