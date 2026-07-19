export interface PrintDialogHelperConfig {
  enabled: boolean
  delayMs: number
  useEnter: boolean
  clickX?: number
  clickY?: number
  windowTitleContains?: string
  /** Web 端：本机桥接地址（Windows 工位默认 127.0.0.1:39217） */
  localBridgeUrl?: string
}

/** Windows 工位：与本目录 local-bridge.ps1 默认端口一致 */
export const DEFAULT_LOCAL_BRIDGE_URL = 'http://127.0.0.1:39217'

const STORAGE_KEY = 'tapePrinter:printDialogHelper'

const DEFAULT_CONFIG: PrintDialogHelperConfig = {
  enabled: false,
  delayMs: 600,
  useEnter: true,
  windowTitleContains: '打印'
}

export function getPrintDialogHelperConfig(): PrintDialogHelperConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw) as Partial<PrintDialogHelperConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      delayMs:
        typeof parsed.delayMs === 'number' && parsed.delayMs >= 200 && parsed.delayMs <= 5000
          ? parsed.delayMs
          : DEFAULT_CONFIG.delayMs
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function setPrintDialogHelperConfig(config: PrintDialogHelperConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function getLocalBridgeBaseUrl(): string {
  const url = getPrintDialogHelperConfig().localBridgeUrl?.trim()
  return url || DEFAULT_LOCAL_BRIDGE_URL
}

/** 检测本机桥接是否已启动（Web 嵌入用） */
export async function pingLocalPrintBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${getLocalBridgeBaseUrl()}/health`, {
      method: 'GET',
      mode: 'cors',
      signal: AbortSignal.timeout(800)
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

async function confirmViaLocalBridge(): Promise<void> {
  const config = getPrintDialogHelperConfig()
  const body: Record<string, number> = { delayMs: config.delayMs }
  if (
    !config.useEnter &&
    typeof config.clickX === 'number' &&
    typeof config.clickY === 'number'
  ) {
    body.clickX = config.clickX
    body.clickY = config.clickY
  }
  await fetch(`${getLocalBridgeBaseUrl()}/confirm`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  })
}

/** 调用系统打印后，由本机助手自动点「打印/确定」 */
export function scheduleAutoConfirmAfterPrint(): void {
  const config = getPrintDialogHelperConfig()
  if (!config.enabled) return

  if (window.electronAPI?.autoConfirmPrintDialog) {
    void window.electronAPI.autoConfirmPrintDialog({
      delayMs: config.delayMs,
      useEnter: config.useEnter,
      clickX: config.clickX,
      clickY: config.clickY,
      windowTitleContains: config.windowTitleContains
    })
    return
  }

  void confirmViaLocalBridge().catch(() => {
    // 桥接未启动时静默失败；面板会提示用户先运行 启动打印助手.bat
  })
}

export function isPrintDialogHelperElectronAvailable(): boolean {
  return Boolean(window.electronAPI?.autoConfirmPrintDialog)
}

/** Web 是否可通过本机桥接使用助手（需工位先启动 local-bridge） */
export async function isPrintDialogHelperAvailableAsync(): Promise<boolean> {
  if (isPrintDialogHelperElectronAvailable()) return true
  return pingLocalPrintBridge()
}
