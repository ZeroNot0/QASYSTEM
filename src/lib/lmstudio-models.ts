/**
 * 从 LM Studio 本地服务拉取模型列表（OpenAI 兼容 GET /v1/models）
 */
export interface LmStudioModelItem {
  id: string
  object?: string
}

export async function fetchLmStudioModels(baseUrl: string): Promise<LmStudioModelItem[]> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/models'
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  const data = await res.json()
  const list = data?.data
  if (!Array.isArray(list)) return []
  return list
    .map((m: { id?: string; object?: string }) => (m?.id ? { id: String(m.id), object: m.object } : null))
    .filter(Boolean) as LmStudioModelItem[]
}
