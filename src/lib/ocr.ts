import { createWorker } from 'tesseract.js'

let worker: Awaited<ReturnType<typeof createWorker>> | null = null

export async function recognizeJapanese(imageBase64: string): Promise<string> {
  if (!worker) {
    worker = await createWorker('jpn', 1, {
      logger: () => {}
    })
  }
  const dataUrl = `data:image/png;base64,${imageBase64}`
  const { data } = await worker.recognize(dataUrl)
  return (data?.text ?? '').trim()
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}
