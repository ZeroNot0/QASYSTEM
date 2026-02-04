import { useState, useEffect, useRef } from 'react'

// LM Studio API 配置
const LM_STUDIO_URL = 'http://localhost:1234'
const OCR_MODEL = 'allenai/olmocr-2-7b'

type Tone = '丁寧' | '謙譲' | '親密'

const TONES: { value: Tone; label: string }[] = [
  { value: '丁寧', label: '丁寧 (标准)' },
  { value: '謙譲', label: '謙譲 (正式)' },
  { value: '親密', label: '親密 (友好)' }
]

// LM Studio OCR 识别
async function recognizeWithLMStudio(base64Image: string): Promise<string> {
  const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请识别图片中的日语文字，只输出识别的文字内容，不要添加任何解释。' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    })
  })
  
  if (!response.ok) throw new Error(`OCR 识别失败: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// 翻译中文到日文
async function translateToJapanese(chineseText: string, ocrContext: string, tone: Tone): Promise<string> {
  const toneDesc = {
    '丁寧': '使用标准的丁寧语气（です・ます体）',
    '謙譲': '使用正式的謙譲语气，表达谦逊和尊敬',
    '親密': '使用友好亲切的语气'
  }
  
  const prompt = `你是专业的游戏客服翻译助手。请将以下中文翻译为日文。

玩家问题：${ocrContext || '无'}
客服回复（中文）：${chineseText}

要求：${toneDesc[tone]}，准确专业，保持游戏术语的地道性。
只输出日文翻译，不要添加任何解释。`

  const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000
    })
  })
  
  if (!response.ok) throw new Error(`翻译失败: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

export default function App() {
  const [screenshotB64, setScreenshotB64] = useState<string | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  
  const [chineseInput, setChineseInput] = useState('')
  const [japaneseOutput, setJapaneseOutput] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [tone, setTone] = useState<Tone>('丁寧')
  
  const screenshotRef = useRef<string | null>(null)

  // 监听截图事件
  useEffect(() => {
    const handleScreenshot = (base64: string) => {
      screenshotRef.current = base64
      setScreenshotB64(base64)
      setOcrText('')
      setOcrError('')
      setOcrLoading(true)
      
      recognizeWithLMStudio(base64)
        .then(text => {
          if (screenshotRef.current === base64) {
            setOcrText(text)
          }
        })
        .catch(err => {
          if (screenshotRef.current === base64) {
            setOcrError(err.message || 'OCR 识别失败')
          }
        })
        .finally(() => {
          if (screenshotRef.current === base64) {
            setOcrLoading(false)
          }
        })
    }

    const handleError = (msg: string) => {
      setOcrError(`截屏失败: ${msg}`)
    }

    const offResult = window.electronAPI?.onScreenshotResult(handleScreenshot)
    const offError = window.electronAPI?.onScreenshotError(handleError)

    return () => {
      offResult?.()
      offError?.()
    }
  }, [])

  // 中文输入变化时自动翻译
  useEffect(() => {
    if (!chineseInput.trim()) {
      setJapaneseOutput('')
      return
    }

    const timer = setTimeout(() => {
      setTranslating(true)
      setTranslateError('')
      
      translateToJapanese(chineseInput, ocrText, tone)
        .then(setJapaneseOutput)
        .catch(err => setTranslateError(err.message || '翻译失败'))
        .finally(() => setTranslating(false))
    }, 500)

    return () => clearTimeout(timer)
  }, [chineseInput, ocrText, tone])

  const copyJapanese = () => {
    if (japaneseOutput) {
      navigator.clipboard.writeText(japaneseOutput)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-200 text-sm">
      <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800">
        <div className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 font-medium">
          截屏 Alt+Q
        </div>
        <button
          type="button"
          onClick={() => window.electronAPI?.pasteClipboardImage?.()}
          className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white transition"
        >
          粘贴图片
        </button>
        <div className="flex-1" />
        <select
          value={tone}
          onChange={e => setTone(e.target.value as Tone)}
          className="rounded bg-slate-700 border border-slate-600 px-3 py-1.5 text-slate-200"
        >
          {TONES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div className="text-xs text-slate-400">
          {OCR_MODEL}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 border-r border-slate-700 flex flex-col p-3 overflow-auto">
          <div className="text-slate-400 text-xs mb-2 font-semibold">玩家端</div>
          
          {screenshotB64 && (
            <div className="mb-3">
              <div className="text-slate-400 text-xs mb-1">截图预览</div>
              <img 
                src={'data:image/png;base64,' + screenshotB64} 
                alt="Screenshot" 
                className="max-w-full rounded border border-slate-600"
                style={{ maxHeight: '200px', objectFit: 'contain' }}
              />
            </div>
          )}

          <div className="mb-3">
            <div className="text-slate-400 text-xs mb-1">日文原文</div>
            <div className="bg-slate-800 rounded p-3 min-h-[80px] whitespace-pre-wrap border border-slate-600">
              {ocrLoading && <span className="text-cyan-400">识别中...</span>}
              {ocrError && <span className="text-red-400">{ocrError}</span>}
              {ocrText || (screenshotB64 ? '' : '等待截图或粘贴图片')}
            </div>
          </div>

          {!screenshotB64 && (
            <div className="text-slate-500 text-xs text-center py-8">
              <div className="mb-2">使用 Alt+Q 截屏</div>
              <div>或点击粘贴图片按钮</div>
            </div>
          )}
        </div>

        <div className="w-1/2 flex flex-col p-3 overflow-auto">
          <div className="text-slate-400 text-xs mb-2 font-semibold">客服端</div>
          
          <div className="mb-3">
            <div className="text-slate-400 text-xs mb-1">中文回复</div>
            <textarea
              placeholder="请输入中文回复内容..."
              value={chineseInput}
              onChange={e => setChineseInput(e.target.value)}
              className="w-full h-32 rounded bg-slate-800 border border-slate-600 p-3 resize-none 
                       focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-200"
            />
          </div>

          {translating && (
            <div className="text-cyan-400 text-xs mb-2">翻译中...</div>
          )}
          {translateError && (
            <div className="text-red-400 text-xs mb-2">{translateError}</div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-slate-400 text-xs">日文预览</div>
              <button
                type="button"
                onClick={copyJapanese}
                disabled={!japaneseOutput}
                className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-40 
                         disabled:cursor-not-allowed transition"
              >
                复制
              </button>
            </div>
            <div className="bg-slate-800 rounded p-3 min-h-[120px] whitespace-pre-wrap 
                          border border-slate-600">
              {japaneseOutput || '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
