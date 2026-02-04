/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    getApiKey: () => Promise<string | null>
    getApiKeyPath: () => Promise<string>
    onScreenshotResult: (cb: (base64: string) => void) => void
    onScreenshotError: (cb: (msg: string) => void) => void
    selectFolder: () => Promise<string | null>
    readDirFiles: (dirPath: string) => Promise<string[]>
    readFileBuffer: (filePath: string) => Promise<ArrayBuffer | null> // 返回 ArrayBuffer 供 xlsx 使用
  }
}
