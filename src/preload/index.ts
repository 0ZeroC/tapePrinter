import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  printLabel: (templateType: 'small' | 'large'): Promise<void> =>
    ipcRenderer.invoke('print-label', templateType)
})
