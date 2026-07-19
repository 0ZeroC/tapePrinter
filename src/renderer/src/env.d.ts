/// <reference types="vite/client" />

import type { MacroBatchItem, MacroBatchResult } from '../../common/macroTypes'

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      getPrinters: () => Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>
      printLabel: (templateType: 'small' | 'large', deviceName?: string) => Promise<void>
      getScreenInfo: () => Promise<{ width: number; height: number; scaleFactor: number }>
      getMacroScriptsDir: () => Promise<string>
      runMacroBatch: (scriptPath: string, items: MacroBatchItem[]) => Promise<MacroBatchResult>
      abortMacro: () => Promise<void>
      onMacroBatchProgress: (
        callback: (payload: { current: number; total: number }) => void
      ) => () => void
      autoConfirmPrintDialog: (options?: {
        delayMs?: number
        useEnter?: boolean
        clickX?: number
        clickY?: number
        windowTitleContains?: string
      }) => Promise<{ ok: boolean; message?: string }>
    }
  }
}

export {}
