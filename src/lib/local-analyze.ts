/**
 * 本地模型根据日语玩家提问生成：中文释义、意图分类、回复建议（无 API）
 */

export type LocalAnalyzeResult = {
  chineseSummary: string
  intent?: string
  replySuggestion?: string
}

const ANALYZE_PROMPT = `你是一名日本游戏客服专家。根据下面这段日语玩家提问，严格按以下 JSON 格式输出，不要其他说明或 markdown 标记：
{
  "chinese_summary": "日语翻译成中文的释义",
  "intent": "玩家意图分类，如：账号丢失/充值异常/游戏建议/其他",
  "reply_suggestion": "针对该问题的回复要点建议（中文，1～3 条）"
}

只输出一个 JSON 对象。

【日语玩家提问】
`

function parseAnalyzeResponse(text: string): LocalAnalyzeResult {
  const out: LocalAnalyzeResult = { chineseSummary: '' }
  const strip = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim()
  const jsonMatch = strip.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
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

export async function analyzeWithLmStudio(
  baseUrl: string,
  model: string,
  japaneseText: string
): Promise<LocalAnalyzeResult> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: ANALYZE_PROMPT + japaneseText }],
      stream: false,
      max_tokens: 2048
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `LM Studio HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  return parseAnalyzeResponse((text ?? '').trim())
}

export async function analyzeWithOllama(
  baseUrl: string,
  model: string,
  japaneseText: string
): Promise<LocalAnalyzeResult> {
  const url = baseUrl.replace(/\/$/, '') + '/api/generate'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: ANALYZE_PROMPT + japaneseText,
      stream: false
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.response ?? data?.message?.content
  return parseAnalyzeResponse((text ?? '').trim())
}
