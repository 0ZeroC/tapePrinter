declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      printLabel: (templateType: 'small' | 'large') => Promise<void>
    }
  }
}

export {}
