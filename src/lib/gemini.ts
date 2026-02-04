const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = 'gemini-2.5-pro'

export type Tone = '丁寧' | '謙譲' | '親密'

export type AnalyzeResult = {
  ocrText: string
  chineseSummary: string
  intent?: string
  replySuggestion?: string
}

function parseAnalyzeResponse(text: string): AnalyzeResult {
  const out: AnalyzeResult = { ocrText: '', chineseSummary: '' }
  const strip = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()
  const jsonMatch = strip.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      out.ocrText = String(parsed.ocr_text ?? parsed.ocrText ?? '')
      out.chineseSummary = String(parsed.chinese_summary ?? parsed.chineseSummary ?? '')
      out.intent = parsed.intent != null ? String(parsed.intent) : undefined
      out.replySuggestion = parsed.reply_suggestion != null ? String(parsed.reply_suggestion) : (parsed.replySuggestion != null ? String(parsed.replySuggestion) : undefined)
    } catch {
      out.chineseSummary = strip.slice(0, 800)
    }
  } else {
    out.chineseSummary = strip.slice(0, 800)
  }
  return out
}

export async function analyzeImage(apiKey: string, imageBase64: string): Promise<AnalyzeResult> {
  const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'image/png', data: imageBase64 } },
          { text: `你是一名日本游戏客服专家。请识别图片中的日语玩家提问，并严格按以下 JSON 格式回复，不要其他说明或 markdown 标记：
{
  "ocr_text": "图片中的日语原文（完整保留）",
  "chinese_summary": "日语翻译成中文的释义",
  "intent": "玩家意图分类，如：账号丢失/充值异常/游戏建议/其他",
  "reply_suggestion": "针对该问题的回复要点建议（中文，1～3 条）"
}

只输出一个 JSON 对象。` }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const feedback = data?.promptFeedback
  if (feedback?.blockReason) throw new Error('内容被过滤: ' + (feedback.blockReason || ''))

  const cand = data?.candidates?.[0]
  if (!cand) throw new Error('无有效回复')
  const text = cand?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string') throw new Error('回复为空')

  return parseAnalyzeResponse(text)
}

export async function translateToJapanese(
  apiKey: string,
  userInput: string,
  ocrText: string,
  localKbText: string,
  tone: Tone
): Promise<string> {
  const system = `你是一名资深的日本游戏客服专家，精通中日互译。
Context:
1. 玩家问题截图内容：${ocrText || '（暂无）'}
2. 内部知识库参考：${localKbText || '（无）'}
Task: 请将客服输入的中文翻译为地道的日文。
Constraint: 必须使用${tone}语气，必须严格使用知识库中的名词术语，若知识库未提及则保持翻译的地道性。只输出日文译文，不要解释。`

  const res = await fetch(`${BASE}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: system + '\n\n客服输入的中文：\n' + userInput }] }
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `HTTP ${res.status}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  return (text ?? '').trim()
}
