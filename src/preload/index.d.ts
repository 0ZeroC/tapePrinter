declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
    }
  }
}

export {}
