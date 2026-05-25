export type MacroActionType =
  | 'click'
  | 'doubleClick'
  | 'type'
  | 'key'
  | 'hotkey'
  | 'delay'
  | 'focusWindow'

export interface MacroAction {
  type: MacroActionType
  x?: number
  y?: number
  button?: 'left' | 'right'
  text?: string
  key?: string
  keys?: string[]
  ms?: number
  titleContains?: string
  comment?: string
}

export interface MacroScript {
  name: string
  templateType: 'small' | 'large'
  scaleFactor?: number
  prelude?: MacroAction[]
  perItem: MacroAction[]
  postlude?: MacroAction[]
}

export interface MacroBatchItem {
  productCode: string
  orderNo: string
  projectName: string
  quantity: number
  unit: string
  description?: string
}

export interface MacroBatchResult {
  success: number
  failed: Array<{ productCode: string; reason: string }>
  aborted?: boolean
}

export const MACRO_VARIABLE_KEYS = [
  'productCode',
  'quantity',
  'unit',
  'orderNo',
  'projectName',
  'description'
] as const

export type MacroVariableKey = (typeof MACRO_VARIABLE_KEYS)[number]

export function buildMacroVariables(item: MacroBatchItem): Record<MacroVariableKey, string> {
  return {
    productCode: item.productCode,
    quantity: String(item.quantity),
    unit: item.unit,
    orderNo: item.orderNo,
    projectName: item.projectName,
    description: item.description ?? ''
  }
}

export function substituteMacroText(text: string, vars: Record<MacroVariableKey, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in vars) return vars[key as MacroVariableKey] ?? ''
    return ''
  })
}
