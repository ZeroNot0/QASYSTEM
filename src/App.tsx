import { useState, useEffect, useCallback, useRef } from 'react'
import type { Tone } from './lib/gemini'
import { recognizeJapanese } from './lib/ocr'
import { ocrWithOllamaVision, ocrWithLmStudioVision } from './lib/vlm-ocr'
import { structureWithOllama, structureWithLmStudio } from './lib/structure'
import { translateWithLmStudio, translateWithOllama } from './lib/translate'
import { analyzeWithLmStudio, analyzeWithOllama } from './lib/local-analyze'
import { fetchLmStudioModels } from './lib/lmstudio-models'
import { parseXlsxBuffer, truncateForContext } from './lib/knowledge'

const TONES: { value: Tone; label: string }[] = [
  { value: '丁寧', label: '丁寧 (标准)' },
  { value: '謙譲', label: '謙譲 (正式)' },
  { value: '親密', label: '親密 (友好)' }
]

type StructureMode = 'off' | 'ollama' | 'lmstudio'
const STRUCTURE_OPTIONS: { value: StructureMode; label: string }[] = [
  { value: 'off', label: 'OCR 梳理：关' },
  { value: 'ollama', label: 'OCR 梳理：Ollama' },
  { value: 'lmstudio', label: 'OCR 梳理：LM Studio' }
]

type OcrSource = 'tesseract' | 'ollama_vlm' | 'lmstudio_vlm'
const OCR_SOURCE_OPTIONS: { value: OcrSource; label: string }[] = [
  { value: 'tesseract', label: '图片识别：Tesseract' },
  { value: 'ollama_vlm', label: '图片识别：Ollama VLM' },
  { value: 'lmstudio_vlm', label: '图片识别：LM Studio VLM' }
]

type TranslateSource = 'lmstudio' | 'ollama'
const TRANSLATE_SOURCE_OPTIONS: { value: TranslateSource; label: string }[] = [
  { value: 'lmstudio', label: '翻译：LM Studio' },
  { value: 'ollama', label: '翻译：Ollama' }
]

type AnalyzeSource = 'off' | 'lmstudio' | 'ollama'
const ANALYZE_SOURCE_OPTIONS: { value: AnalyzeSource; label: string }[] = [
  { value: 'off', label: '深度分析：关' },
  { value: 'lmstudio', label: '深度分析：LM Studio' },
  { value: 'ollama', label: '深度分析：Ollama' }
]

const loadSetting = (key: string, fallback: string) => {
  try {
    const v = localStorage.getItem(key)
    return v != null ? v : fallback
  } catch { return fallback }
}
const saveSetting = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch {}
}

export default function App() {
  const [ocrText, setOcrText] = useState('')
  const [chineseSummary, setChineseSummary] = useState('')
  const [intent, setIntent] = useState('')
  const [replySuggestion, setReplySuggestion] = useState('')
  const [screenshotB64, setScreenshotB64] = useState<string | null>(null)
  const [localOcrDone, setLocalOcrDone] = useState(false)
  const [localAnalyzing, setLocalAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [structureMode, setStructureMode] = useState<StructureMode>(() => loadSetting('jplinker_structure', 'off') as StructureMode)
  const [analyzeSource, setAnalyzeSource] = useState<AnalyzeSource>(() => loadSetting('jplinker_analyze_source', 'lmstudio') as AnalyzeSource)
  const [ollamaUrl, setOllamaUrl] = useState(() => loadSetting('jplinker_ollama_url', 'http://localhost:11434'))
  const [ollamaModel, setOllamaModel] = useState(() => loadSetting('jplinker_ollama_model', 'qwen2.5:7b'))
  const [lmStudioUrl, setLmStudioUrl] = useState(() => loadSetting('jplinker_lmstudio_url', 'http://localhost:1234'))
  const [lmStudioModel, setLmStudioModel] = useState(() => loadSetting('jplinker_lmstudio_model', ''))
  const [lmStudioVlmModel, setLmStudioVlmModel] = useState(() => loadSetting('jplinker_lmstudio_vlm_model', ''))
  const [ocrSource, setOcrSource] = useState<OcrSource>(() => loadSetting('jplinker_ocr_source', 'tesseract') as OcrSource)
  const [translateSource, setTranslateSource] = useState<TranslateSource>(() => loadSetting('jplinker_translate_source', 'lmstudio') as TranslateSource)
  const [structuring, setStructuring] = useState(false)
  const structuredRef = useRef(false)
  const [lmStudioModelsList, setLmStudioModelsList] = useState<{ id: string }[]>([])
  const [lmStudioModelsLoading, setLmStudioModelsLoading] = useState(false)
  const [lmStudioModelsError, setLmStudioModelsError] = useState('')

  const [kbPath, setKbPath] = useState('')
  const [kbText, setKbText] = useState('')
  const [kbLoading, setKbLoading] = useState(false)
  const [kbError, setKbError] = useState('')

  const [chineseInput, setChineseInput] = useState('')
  const [japaneseOutput, setJapaneseOutput] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [tone, setTone] = useState<Tone>('丁寧')

  const screenshotRef = useRef<string | null>(null)

  useEffect(() => {
    const offResult = window.electronAPI?.onScreenshotResult((base64: string) => {
      screenshotRef.current = base64
      setScreenshotB64(base64)
      setAnalyzeError('')
      setOcrText('')
      setChineseSummary('')
      setIntent('')
      setReplySuggestion('')
      setJapaneseOutput('') // 新截图时清空日文预览，避免与玩家端 OCR 结果混淆
      setLocalOcrDone(false)
      structuredRef.current = false

      // 第一路：本地识别（Tesseract 或 本地 VLM），可选 AI 梳理
      const runFirstPath = (rawText: string) => {
        if (screenshotRef.current !== base64) return
        const runLocalAnalyze = (finalText: string) => {
          if (!finalText || analyzeSource === 'off') return
          if (analyzeSource === 'lmstudio' && !lmStudioModel) {
            setAnalyzeError('本地分析未配置：请填写 LM Studio 文字模型 ID')
            return
          }
          if (analyzeSource === 'ollama' && !ollamaModel) {
            setAnalyzeError('本地分析未配置：请填写 Ollama 模型名')
            return
          }
          setLocalAnalyzing(true)
          setAnalyzeError('')
          const p = analyzeSource === 'lmstudio'
            ? analyzeWithLmStudio(lmStudioUrl, lmStudioModel, finalText)
            : analyzeWithOllama(ollamaUrl, ollamaModel, finalText)
          p.then(res => {
            if (screenshotRef.current !== base64) return
            setChineseSummary(res.chineseSummary || '')
            setIntent(res.intent || '')
            setReplySuggestion(res.replySuggestion || '')
          }).catch(e => {
            if (screenshotRef.current === base64) setAnalyzeError(e?.message || '本地解析失败')
          }).finally(() => setLocalAnalyzing(false))
        }

        if (structureMode === 'off') {
          setOcrText(rawText)
          setLocalOcrDone(true)
          runLocalAnalyze(rawText)
          return
        }
        setOcrText(rawText)
        setLocalOcrDone(true)
        setStructuring(true)
        const p =
          structureMode === 'ollama'
              ? structureWithOllama(ollamaUrl, ollamaModel, rawText)
              : structureMode === 'lmstudio'
                ? structureWithLmStudio(lmStudioUrl, lmStudioModel, rawText)
                : Promise.resolve(rawText)
        p.then(structured => {
          if (screenshotRef.current === base64 && structured) {
            setOcrText(structured)
            structuredRef.current = true
            runLocalAnalyze(structured)
          }
        }).catch(() => {
          if (screenshotRef.current === base64) {
            setAnalyzeError('OCR 梳理失败，已保留原文')
            runLocalAnalyze(rawText)
          }
        }).finally(() => setStructuring(false))
      }
      if (ocrSource === 'tesseract') {
        recognizeJapanese(base64).then(runFirstPath).catch(() => {
          if (screenshotRef.current === base64) setLocalOcrDone(true)
        })
      } else if (ocrSource === 'ollama_vlm') {
        ocrWithOllamaVision(ollamaUrl, ollamaModel, base64)
          .then(runFirstPath)
          .catch(e => {
            if (screenshotRef.current === base64) {
              setAnalyzeError('Ollama VLM 识别失败: ' + (e?.message || ''))
              setLocalOcrDone(true)
            }
          })
      } else {
        ocrWithLmStudioVision(lmStudioUrl, lmStudioVlmModel, base64) // 使用 VLM 模型 ID
          .then(runFirstPath)
          .catch(e => {
            if (screenshotRef.current === base64) {
              setAnalyzeError('LM Studio VLM 识别失败: ' + (e?.message || ''))
              setLocalOcrDone(true)
            }
          })
      }

    })
    const offErr = window.electronAPI?.onScreenshotError((msg: string) => {
      setAnalyzeError('截屏失败: ' + msg)
    })
    return () => {
      offResult?.()
      offErr?.()
    }
  }, [structureMode, analyzeSource, ocrSource, ollamaUrl, ollamaModel, lmStudioUrl, lmStudioModel, lmStudioVlmModel])

  const loadKnowledge = useCallback(async (dirPath: string) => {
    setKbPath(dirPath)
    setKbLoading(true)
    setKbError('')
    try {
      const files = await window.electronAPI!.readDirFiles(dirPath)
      const parts: string[] = []
      for (const fp of files) {
        const buf = await window.electronAPI!.readFileBuffer(fp)
        if (buf) parts.push(parseXlsxBuffer(buf))
      }
      setKbText(parts.join('\n\n'))
    } catch (e) {
      setKbError((e as Error)?.message || '加载失败')
    } finally {
      setKbLoading(false)
    }
  }, [])

  const onSelectFolder = useCallback(() => {
    window.electronAPI?.selectFolder().then(path => {
      if (path) loadKnowledge(path)
    })
  }, [loadKnowledge])

  const onFetchLmStudioModels = useCallback(() => {
    setLmStudioModelsLoading(true)
    setLmStudioModelsError('')
    fetchLmStudioModels(lmStudioUrl)
      .then(list => setLmStudioModelsList(list || []))
      .catch(e => setLmStudioModelsError(e?.message || '获取失败'))
      .finally(() => setLmStudioModelsLoading(false))
  }, [lmStudioUrl])

  const canTranslate = translateSource === 'lmstudio' ? !!lmStudioModel : !!ollamaModel

  useEffect(() => {
    if (!chineseInput.trim()) {
      setJapaneseOutput('')
      return
    }
    if (!canTranslate) return
    const t = setTimeout(() => {
      setTranslating(true)
      setTranslateError('')
      const input = chineseInput.trim()
      const kb = truncateForContext(kbText)
      const p =
        translateSource === 'lmstudio'
          ? translateWithLmStudio(lmStudioUrl, lmStudioModel, input, ocrText, kb, tone)
          : translateSource === 'ollama'
            ? translateWithOllama(ollamaUrl, ollamaModel, input, ocrText, kb, tone)
            : Promise.resolve('')
      p.then(setJapaneseOutput)
        .catch(e => setTranslateError(e?.message || '翻译失败'))
        .finally(() => setTranslating(false))
    }, 500)
    return () => clearTimeout(t)
  }, [chineseInput, ocrText, kbText, tone, canTranslate, translateSource, lmStudioUrl, lmStudioModel, ollamaUrl, ollamaModel])

  const copyJapanese = () => {
    if (japaneseOutput) {
      navigator.clipboard.writeText(japaneseOutput)
    }
  }

  const hasNetwork = typeof navigator !== 'undefined' && navigator.onLine

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-200 text-sm">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 p-2 border-b border-slate-700 shrink-0">
        <span className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 font-medium">截屏 Alt+Q</span>
        <button
          type="button"
          onClick={() => window.electronAPI?.pasteClipboardImage?.()}
          className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600 text-sm"
          title="从剪贴板粘贴图片（如 Snipaste 截图后复制），或按 Cmd+Shift+V / Ctrl+Shift+V"
        >
          粘贴图片
        </button>
        <select
          value={tone}
          onChange={e => setTone(e.target.value as Tone)}
          className="rounded bg-slate-700 border border-slate-600 px-2 py-1.5"
        >
          {TONES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={translateSource}
          onChange={e => {
            const v = e.target.value as TranslateSource
            setTranslateSource(v)
            saveSetting('jplinker_translate_source', v)
          }}
          className="rounded bg-slate-700 border border-slate-600 px-2 py-1.5"
          title="日文预览的翻译引擎"
        >
          {TRANSLATE_SOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={ocrSource}
          onChange={e => {
            const v = e.target.value as OcrSource
            setOcrSource(v)
            saveSetting('jplinker_ocr_source', v)
          }}
          className="rounded bg-slate-700 border border-slate-600 px-2 py-1.5"
          title="VLM 可直接从图片输出更有序文字，适合截屏错行场景"
        >
          {OCR_SOURCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={structureMode}
          onChange={e => {
            const v = e.target.value as StructureMode
            setStructureMode(v)
            saveSetting('jplinker_structure', v)
          }}
          className="rounded bg-slate-700 border border-slate-600 px-2 py-1.5"
          title="将错行/乱序的 OCR 文本梳理成通顺日文"
        >
          {STRUCTURE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {(structureMode === 'ollama' || ocrSource === 'ollama_vlm' || translateSource === 'ollama') && (
          <>
            <input
              type="text"
              value={ollamaUrl}
              onChange={e => { const v = e.target.value; setOllamaUrl(v); saveSetting('jplinker_ollama_url', v) }}
              placeholder="Ollama 地址"
              className="w-28 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
              title="默认 http://localhost:11434"
            />
            <input
              type="text"
              value={ollamaModel}
              onChange={e => { const v = e.target.value; setOllamaModel(v); saveSetting('jplinker_ollama_model', v) }}
              placeholder="模型名"
              className="w-24 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
              title="如 qwen2.5:7b / llama3.2:3b"
            />
          </>
        )}
        {(structureMode === 'lmstudio' || ocrSource === 'lmstudio_vlm' || translateSource === 'lmstudio') && (
          <>
            <input
              type="text"
              value={lmStudioUrl}
              onChange={e => { const v = e.target.value; setLmStudioUrl(v); saveSetting('jplinker_lmstudio_url', v) }}
              placeholder="LM Studio 地址"
              className="w-28 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
              title="默认 http://localhost:1234"
            />
            <button
              type="button"
              onClick={onFetchLmStudioModels}
              disabled={lmStudioModelsLoading}
              className="px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs disabled:opacity-50"
              title="从 LM Studio 拉取本地模型列表"
            >
              {lmStudioModelsLoading ? '检测中…' : '检测模型'}
            </button>
            {lmStudioModelsError && <span className="text-red-400 text-xs">{lmStudioModelsError}</span>}
            {ocrSource === 'lmstudio_vlm' && (
              <>
                <span className="text-slate-500 text-xs">VLM:</span>
                {lmStudioModelsList.length > 0 ? (
                  <select
                    value={lmStudioVlmModel}
                    onChange={e => { const v = e.target.value; setLmStudioVlmModel(v); saveSetting('jplinker_lmstudio_vlm_model', v) }}
                    className="rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs max-w-[140px]"
                    title="图片识别用视觉模型"
                  >
                    <option value="">请选择</option>
                    {[...(lmStudioVlmModel && !lmStudioModelsList.some(m => m.id === lmStudioVlmModel) ? [{ id: lmStudioVlmModel }] : []), ...lmStudioModelsList].map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={lmStudioVlmModel}
                    onChange={e => { const v = e.target.value; setLmStudioVlmModel(v); saveSetting('jplinker_lmstudio_vlm_model', v) }}
                    placeholder="VLM 模型 ID"
                    className="w-28 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
                  />
                )}
              </>
            )}
            {(structureMode === 'lmstudio' || translateSource === 'lmstudio') && (
              <>
                <span className="text-slate-500 text-xs">文字:</span>
                {lmStudioModelsList.length > 0 ? (
                  <select
                    value={lmStudioModel}
                    onChange={e => { const v = e.target.value; setLmStudioModel(v); saveSetting('jplinker_lmstudio_model', v) }}
                    className="rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs max-w-[140px]"
                    title="OCR 梳理与中→日翻译用"
                  >
                    <option value="">请选择</option>
                    {[...(lmStudioModel && !lmStudioModelsList.some(m => m.id === lmStudioModel) ? [{ id: lmStudioModel }] : []), ...lmStudioModelsList].map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={lmStudioModel}
                    onChange={e => { const v = e.target.value; setLmStudioModel(v); saveSetting('jplinker_lmstudio_model', v) }}
                    placeholder="文字模型 ID（梳理/翻译）"
                    className="w-32 rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs"
                  />
                )}
              </>
            )}
          </>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className={`w-2 h-2 rounded-full ${kbText ? 'bg-green-500' : 'bg-slate-500'}`} title={kbText ? '已加载知识库' : '未加载'} />
          <span className="text-slate-400">知识库</span>
          <button type="button" onClick={onSelectFolder} className="text-cyan-400 hover:underline">选择文件夹</button>
          {kbPath && <button type="button" onClick={() => loadKnowledge(kbPath)} className="text-slate-400 hover:underline">刷新</button>}
        </div>
      </div>

      {!hasNetwork && (
        <div className="bg-amber-900/80 text-amber-200 px-3 py-1.5 text-center text-xs">网络不可用，请检查连接</div>
      )}
      {!apiKey && (
        <div className="bg-red-900/80 text-red-200 px-3 py-1.5 text-center text-xs">未找到 API Key，请将密钥放入 APIKEYS/APIKEYS.txt</div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 左区：玩家端 - 本地 OCR + API 双路 */}
        <div className="w-1/2 flex flex-col border-r border-slate-700 p-2 overflow-hidden">
          <div className="text-slate-400 text-xs mb-1">玩家端（本地识别 + API 深度分析）</div>
          {screenshotB64 && !localOcrDone && <div className="text-cyan-400 text-xs">本地识别中…</div>}
          {structuring && <div className="text-cyan-400 text-xs">AI 梳理中…</div>}
          {apiAnalyzing && <div className="text-cyan-400 text-xs">API 分析中…</div>}
          {analyzeError && <div className="text-red-400 text-xs">{analyzeError}</div>}
          <div className="flex-1 overflow-auto space-y-2">
            {ocrText && (
              <div>
                <div className="text-slate-400 text-xs">日语原文{structureMode !== 'off' ? '（已梳理）' : localOcrDone && !apiAnalyzing && !chineseSummary ? '（本地）' : ''}</div>
                <div className="bg-slate-800 rounded p-2 whitespace-pre-wrap">{ocrText}</div>
              </div>
            )}
            {(chineseSummary || apiAnalyzing || (analyzeError && ocrText)) && (
              <div>
                <div className="text-slate-400 text-xs">中文释义</div>
                <div className="bg-slate-800 rounded p-2 whitespace-pre-wrap">
                  {chineseSummary || (apiAnalyzing ? 'API 解析中…' : analyzeError ? 'API 解析失败，仅显示本地识别' : '')}
                </div>
              </div>
            )}
            {intent && (
              <div>
                <div className="text-slate-400 text-xs">玩家意图</div>
                <div className="bg-slate-800 rounded p-2 text-cyan-200">{intent}</div>
              </div>
            )}
            {replySuggestion && (
              <div>
                <div className="text-slate-400 text-xs">回复建议（可点击填入）</div>
                <div
                  className="bg-slate-800 rounded p-2 text-amber-200 cursor-pointer hover:bg-slate-700 border border-slate-600"
                  onClick={() => setChineseInput(prev => (prev ? prev + '\n' : '') + replySuggestion)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setChineseInput(prev => (prev ? prev + '\n' : '') + replySuggestion)}
                >
                  {replySuggestion}
                </div>
              </div>
            )}
            {!ocrText && !screenshotB64 && !analyzeError && (
              <div className="text-slate-500 text-xs">使用 Alt+Q 截屏，本地先出日文，API 再出释义与回复建议</div>
            )}
          </div>
        </div>

        {/* 右区：客服端 */}
        <div className="w-1/2 flex flex-col p-2 overflow-hidden">
          <div className="text-slate-400 text-xs mb-1">客服端</div>
          <textarea
            placeholder="请输入回复要点..."
            value={chineseInput}
            onChange={e => setChineseInput(e.target.value)}
            className="flex-1 min-h-[120px] w-full rounded bg-slate-800 border border-slate-600 p-2 resize-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
            disabled={false}
          />
          {translating && <div className="text-cyan-400 text-xs py-1">翻译中…</div>}
          {translateError && <div className="text-red-400 text-xs">{translateError}</div>}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs">日文预览</span>
              <button
                type="button"
                onClick={copyJapanese}
                className="text-xs text-cyan-400 hover:underline disabled:opacity-50"
                disabled={!japaneseOutput}
              >
                一键复制
              </button>
            </div>
            <div className="bg-slate-800 rounded p-2 min-h-[80px] whitespace-pre-wrap border border-slate-600">
              {japaneseOutput || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
