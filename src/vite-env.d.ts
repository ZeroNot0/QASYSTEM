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
    startMonitorAreaSelection: () => Promise<unknown>
    onMonitorAreaSelected: (callback: (area: { x: number; y: number; width: number; height: number }) => void) => (() => void) | undefined
    startMonitor: (config: any) => Promise<{ success: boolean }>
    stopMonitor: () => Promise<{ success: boolean }>
    onMonitorMessage?: (callback: (message: any) => void) => void
    onMonitorStats?: (callback: (stats: any) => void) => void
    onMonitorScreenshot?: (callback: (data: { thumbnailBase64: string; time: string }) => void) => (() => void) | undefined
  }
}
