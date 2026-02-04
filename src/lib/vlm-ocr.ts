/**
 * 使用本地 VLM（如 olmOCR 2 / Qwen2-VL）直接对截图做「图片 → 结构化文字」识别。
 * 适合截屏不全、错行导致语意混乱的场景；olmOCR 2 建议图片最长边 1288px。
 */

const VLM_OCR_PROMPT = `请从这张图片中按阅读顺序提取全部文字，保持合理的换行与段落结构。若为日文请原样输出日文。只输出提取出的文本内容，不要解释、不要加标题。`

const MAX_DIMENSION = 1288

/** 将 base64 图片最长边缩放到 maxDim，返回新 base64（无 data URL 前缀） */
export async function resizeImageBase64(imageBase64: string, maxDim: number = MAX_DIMENSION): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (w <= maxDim && h <= maxDim) {
        resolve(imageBase64)
        return
      }
      const scale = maxDim / Math.max(w, h)
      const cw = Math.round(w * scale)
      const ch = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(imageBase64)
        return
      }
      ctx.drawImage(img, 0, 0, cw, ch)
      const dataUrl = canvas.toDataURL('image/png')
      const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      resolve(b64)
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = `data:image/png;base64,${imageBase64}`
  })
}

/** 使用 Ollama 视觉模型从图片中提取文字（如 olmocr2:7b） */
export async function ocrWithOllamaVision(
  baseUrl: string,
  model: string,
  imageBase64: string
): Promise<string> {
  const b64 = await resizeImageBase64(imageBase64)
  const url = baseUrl.replace(/\/$/, '') + '/api/generate'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: VLM_OCR_PROMPT,
      images: [b64],
      stream: false
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.response ?? data?.message?.content
  return (text ?? '').trim()
}

/** 使用 LM Studio 视觉模型（OpenAI 兼容）从图片中提取文字。content 仅使用 type: 'text' | 'image_url'，否则 LM Studio 会报 Invalid 'content'。 */
export async function ocrWithLmStudioVision(
  baseUrl: string,
  model: string,
  imageBase64: string
): Promise<string> {
  const b64 = await resizeImageBase64(imageBase64)
  const dataUrl = `data:image/png;base64,${b64}`
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'

  const content = [
    { type: 'text' as const, text: VLM_OCR_PROMPT },
    { type: 'image_url' as const, image_url: { url: dataUrl } }
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      stream: false,
      max_tokens: 2048
    })
  })
  const data = await res.json().catch(() => ({}))
  const err = data?.error
  if (err && typeof err === 'object' && (err.message || err.code)) {
    throw new Error(typeof err.message === 'string' ? err.message : JSON.stringify(err))
  }
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : await res.text().catch(() => `HTTP ${res.status}`))
  }
  const text = data?.choices?.[0]?.message?.content
  return (text ?? '').trim()
}
