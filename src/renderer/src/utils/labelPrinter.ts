export type LabelTemplateType = 'small' | 'large'

export interface LabelPrinterMap {
  small?: string
  large?: string
}

const STORAGE_KEY = 'tapePrinter:labelPrinterMap'

export function getLabelPrinterMap(): LabelPrinterMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LabelPrinterMap
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function setLabelPrinterMap(map: LabelPrinterMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  if (!window.electronAPI?.getPrinters) return []
  return window.electronAPI.getPrinters()
}

export async function resolveDeviceName(
  templateType: LabelTemplateType
): Promise<string | undefined> {
  const map = getLabelPrinterMap()
  const deviceName = map[templateType]?.trim()
  if (!deviceName) return undefined

  const printers = await listPrinters()
  if (printers.length === 0) return deviceName

  const found = printers.some((p) => p.name === deviceName)
  if (!found) return undefined
  return deviceName
}

/** 统一物理打印入口：有映射则静默投递到对应打印机 */
export async function printLabelByTemplate(templateType: LabelTemplateType): Promise<{
  usedMapping: boolean
  deviceName?: string
}> {
  const deviceName = await resolveDeviceName(templateType)

  if (window.electronAPI?.printLabel) {
    await window.electronAPI.printLabel(templateType, deviceName)
    return { usedMapping: Boolean(deviceName), deviceName }
  }

  window.print()
  return { usedMapping: false }
}

export function getLabelPrinterMapSummary(): { small?: string; large?: string } {
  const map = getLabelPrinterMap()
  return {
    small: map.small,
    large: map.large
  }
}

/** 将映射的 deviceName 转为可读显示名 */
export function formatPrinterMapLabels(
  map: LabelPrinterMap,
  printerList: PrinterInfo[]
): { small: string; large: string } {
  const labelOf = (deviceName?: string): string => {
    if (!deviceName?.trim()) return '未配置'
    const found = printerList.find((p) => p.name === deviceName)
    return found?.displayName || deviceName
  }
  return {
    small: labelOf(map.small),
    large: labelOf(map.large)
  }
}
