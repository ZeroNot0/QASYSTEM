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
  }
}
