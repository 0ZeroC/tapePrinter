import { contextBridge, ipcRenderer } from 'electron'
import type { MacroBatchItem, MacroBatchResult } from '../common/macroTypes'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getPrinters: (): Promise<Array<{ name: string; displayName: string; isDefault: boolean }>> =>
    ipcRenderer.invoke('get-printers'),
  printLabel: (templateType: 'small' | 'large', deviceName?: string): Promise<void> =>
    ipcRenderer.invoke('print-label', templateType, deviceName),
  getScreenInfo: (): Promise<{ width: number; height: number; scaleFactor: number }> =>
    ipcRenderer.invoke('get-screen-info'),
  getMacroScriptsDir: (): Promise<string> => ipcRenderer.invoke('get-macro-scripts-dir'),
  runMacroBatch: (scriptPath: string, items: MacroBatchItem[]): Promise<MacroBatchResult> =>
    ipcRenderer.invoke('run-macro-batch', scriptPath, items),
  abortMacro: (): Promise<void> => ipcRenderer.invoke('abort-macro'),
  onMacroBatchProgress: (
    callback: (payload: { current: number; total: number }) => void
  ): (() => void) => {
    const listener = (_event: unknown, payload: { current: number; total: number }) => {
      callback(payload)
    }
    ipcRenderer.on('macro-batch-progress', listener)
    return () => ipcRenderer.removeListener('macro-batch-progress', listener)
  }
})
