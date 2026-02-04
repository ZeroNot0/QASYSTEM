/**
 * 中→日翻译：支持 Gemini API / 本地 LM Studio / 本地 Ollama
 */
import type { Tone } from './gemini'

function buildTranslatePrompt(ocrText: string, localKbText: string, tone: Tone, chineseInput: string): string {
  return `你是一名日本游戏客服专家，精通中日互译。
【参考（仅作语境，不要输出）】玩家问题：${(ocrText || '（暂无）').slice(0, 500)}${ocrText && ocrText.length > 500 ? '…' : ''}
【参考】知识库：${(localKbText || '（无）').slice(0, 300)}${localKbText && localKbText.length > 300 ? '…' : ''}

【任务】请仅将下面「客服输入的中文」翻译为日文。不要输出玩家问题内容，不要输出知识库内容。
【要求】使用${tone}语气；名词术语与知识库一致。只输出一句或一段日文译文，不要解释。

客服输入的中文：
${chineseInput}`
}

/** 使用 LM Studio 本地模型做中→日翻译 */
export async function translateWithLmStudio(
  baseUrl: string,
  model: string,
  chineseInput: string,
  ocrText: string,
  localKbText: string,
  tone: Tone
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: buildTranslatePrompt(ocrText, localKbText, tone, chineseInput) }
      ],
      stream: false,
      max_tokens: 1024
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `LM Studio HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  return (text ?? '').trim()
}

/** 使用 Ollama 本地模型做中→日翻译 */
export async function translateWithOllama(
  baseUrl: string,
  model: string,
  chineseInput: string,
  ocrText: string,
  localKbText: string,
  tone: Tone
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/api/generate'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: buildTranslatePrompt(ocrText, localKbText, tone, chineseInput),
      stream: false
    })
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `Ollama HTTP ${res.status}`))
  const data = await res.json()
  const text = data?.response ?? data?.message?.content
  return (text ?? '').trim()
}
