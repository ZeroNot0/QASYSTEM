/**
 * 将 OCR 产生的错行、乱序、残缺文本，用 AI 梳理成结构化的通顺日文。
 * 支持：Gemini API / 本地 Ollama（M3 Max 64G 可跑 7B～14B 小模型）
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL = 'gemini-2.5-pro'

const STRUCTURE_SYSTEM = `你是一名日语编辑。用户会给出一段从截图 OCR 得到的日语文本，可能存在：
- 错行、断行错误
- 词句顺序混乱
- 部分残缺或识别错误

请仅做以下整理（不要翻译、不要改意思）：
1. 按语义恢复正确断句与换行；
2. 理顺语序，使读起来通顺；
3. 明显残缺或无法辨认处用 […] 标出；
4. 若原文基本通顺则只做最小修正。

只输出整理后的日语正文，不要解释、不要加标题。`

/** 使用 Gemini 梳理 OCR 文本 */
export async function structureWithGemini(apiKey: string, rawOcrText: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: STRUCTURE_SYSTEM + '\n\n【待整理的 OCR 原文】\n' + rawOcrText }
            ]
          }
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
      })
    }
  )
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  return (text ?? '').trim()
}

/** 使用本地 Ollama 梳理 OCR 文本（M3 Max 推荐：qwen2.5:7b / llama3.2:3b / gemma2:9b） */
export async function structureWithOllama(
  baseUrl: string,
  model: string,
  rawOcrText: string
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/api/generate'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: STRUCTURE_SYSTEM + '\n\n【待整理的 OCR 原文】\n' + rawOcrText,
      stream: false
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.response ?? data?.message?.content
  return (text ?? '').trim()
}

/** 使用 LM Studio 本地服务梳理（OpenAI 兼容接口，默认 http://localhost:1234） */
export async function structureWithLmStudio(
  baseUrl: string,
  model: string,
  rawOcrText: string
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: STRUCTURE_SYSTEM },
        { role: 'user', content: '【待整理的 OCR 原文】\n' + rawOcrText }
      ],
      stream: false,
      max_tokens: 2048
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `LM Studio HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  return (text ?? '').trim()
}
