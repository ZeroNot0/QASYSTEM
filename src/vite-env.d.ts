/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    getApiKey: () => Promise<string | null>
    getApiKeyPath: () => Promise<string>
    onScreenshotResult: (cb: (base64: string) => void) => (() => void)
    onScreenshotError: (cb: (msg: string) => void) => (() => void)
    pasteClipboardImage: () => Promise<void>
    selectFolder: () => Promise<string | null>
    readDirFiles: (dirPath: string) => Promise<string[]>
    readFileBuffer: (filePath: string) => Promise<ArrayBuffer | null>
    callLMStudio: (url: string, options: { method?: string; headers?: any; body?: any }) => Promise<{
      ok: boolean
      status: number
      data?: any
      error?: string
    }>
    // Monitor API
    selectMonitorArea: () => Promise<{ x: number; y: number; width: number; height: number } | null>
    startMonitor: (config: any) => Promise<{ success: boolean }>
    stopMonitor: () => Promise<{ success: boolean }>
    onMonitorMessage?: (callback: (message: any) => void) => void
    onMonitorStats?: (callback: (stats: any) => void) => void
  }
}
