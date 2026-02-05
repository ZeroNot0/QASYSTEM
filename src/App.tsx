import { useState, useEffect, useRef } from 'react'
import MonitorPanel from './components/MonitorPanel'

const LM_STUDIO_URL = 'http://127.0.0.1:1234'
const OCR_MODEL = 'allenai/olmocr-2-7b'

type Tone = 'polite' | 'formal' | 'casual'
type TabType = 'ocr' | 'monitor'

const TONES: { value: Tone; label: string }[] = [
  { value: 'polite', label: 'Polite' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' }
]

/** 压缩图片再发给 LM Studio，避免 "failed to process image"（尺寸/体积过大） */
const OCR_MAX_WIDTH = 1280
const OCR_JPEG_QUALITY = 0.88

function compressImageForOCR(base64Image: string, mime: 'image/png' | 'image/jpeg' = 'image/png'): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const scale = w > OCR_MAX_WIDTH ? OCR_MAX_WIDTH / w : 1
      const cw = Math.round(w * scale)
      const ch = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve({ base64: base64Image, mime: mime })
        return
      }
      ctx.drawImage(img, 0, 0, cw, ch)
      const outMime = 'image/jpeg'
      const dataUrl = canvas.toDataURL(outMime, OCR_JPEG_QUALITY)
      const outBase64 = dataUrl.split(',')[1]
      if (!outBase64) {
        resolve({ base64: base64Image, mime: mime })
        return
      }
      resolve({ base64: outBase64, mime: outMime })
    }
    img.onerror = () => reject(new Error('Failed to load image for compression'))
    img.src = `data:${mime};base64,${base64Image}`
  })
}

async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!window.electronAPI?.callLMStudio) {
      return { ok: false, error: 'electronAPI not available' }
    }
    
    const result = await window.electronAPI.callLMStudio(`${LM_STUDIO_URL}/v1/models`, {
      method: 'GET'
    })
    
    if (!result.ok) {
      return { ok: false, error: result.error || `Server error ${result.status}` }
    }
    
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: `Cannot connect: ${err.message}` }
  }
}

async function recognizeWithLMStudio(base64Image: string): Promise<string> {
  try {
    if (!window.electronAPI?.callLMStudio) {
      throw new Error('electronAPI not available')
    }

    const { base64: compressed, mime } = await compressImageForOCR(base64Image)
    const dataUrl = `data:${mime};base64,${compressed}`

    const result = await window.electronAPI.callLMStudio(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: OCR_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please recognize Japanese text in the image. Output only the recognized text without any explanation.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }
    })
    
    if (!result.ok) {
      const errorText = result.error || result.data?.error?.message || String(result.data?.error || '')
      const msg = errorText.trim() || `HTTP ${result.status}`
      throw new Error(`OCR failed (${result.status}): ${msg}`)
    }

    const text = result.data?.choices?.[0]?.message?.content
    if (text === undefined || text === null) {
      throw new Error('OCR returned no text. Check that the model supports vision (image) input.')
    }
    return text
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.startsWith('OCR failed') || msg.includes('returned no text')) {
      throw err
    }
    const hint = msg.includes('ECONNREFUSED') || msg.includes('fetch')
      ? `Cannot connect to LM Studio at ${LM_STUDIO_URL}. Please ensure:\n1. LM Studio is running\n2. Port is set to 1234\n3. Model ${OCR_MODEL} is loaded`
      : `LM Studio error: ${msg}`
    throw new Error(hint)
  }
}

async function translateToJapanese(chineseText: string, ocrContext: string, tone: Tone): Promise<string> {
  const toneDesc = {
    'polite': 'Use standard polite Japanese (desu/masu form)',
    'formal': 'Use formal honorific Japanese',
    'casual': 'Use casual friendly Japanese'
  }
  
  const prompt = `You are a professional game customer service translator. Translate the following Chinese to Japanese.

Player question: ${ocrContext || 'None'}
Support reply (Chinese): ${chineseText}

Requirements: ${toneDesc[tone]}, accurate and professional.
Output only the Japanese translation without explanation.`

  try {
    if (!window.electronAPI?.callLMStudio) {
      throw new Error('electronAPI not available')
    }
    
    const result = await window.electronAPI.callLMStudio(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: OCR_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      }
    })
    
    if (!result.ok) {
      const errorText = result.error || result.data?.error?.message || String(result.data?.error || '')
      throw new Error(`Translation failed (${result.status}): ${errorText.trim() || result.status}`)
    }
    return result.data.choices?.[0]?.message?.content ?? ''
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.startsWith('Translation failed')) throw err
    throw new Error(msg.includes('ECONNREFUSED') || msg.includes('fetch') ? 'Cannot connect to LM Studio' : `LM Studio: ${msg}`)
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('ocr')
  const [screenshotB64, setScreenshotB64] = useState<string | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  
  const [chineseInput, setChineseInput] = useState('')
  const [japaneseOutput, setJapaneseOutput] = useState('')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState('')
  const [tone, setTone] = useState<Tone>('polite')
  
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [connectionError, setConnectionError] = useState('')
  
  const screenshotRef = useRef<string | null>(null)

  useEffect(() => {
    testConnection().then(result => {
      if (result.ok) {
        setConnectionStatus('ok')
      } else {
        setConnectionStatus('error')
        setConnectionError(result.error || 'Connection failed')
      }
    })
  }, [])

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
            setOcrError(err.message || 'OCR recognition failed')
          }
        })
        .finally(() => {
          if (screenshotRef.current === base64) {
            setOcrLoading(false)
          }
        })
    }

    const handleError = (msg: string) => {
      setOcrError(`Screenshot failed: ${msg}`)
    }

    const offResult = window.electronAPI?.onScreenshotResult(handleScreenshot)
    const offError = window.electronAPI?.onScreenshotError(handleError)

    return () => {
      offResult?.()
      offError?.()
    }
  }, [])

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
        .catch(err => setTranslateError(err.message || 'Translation failed'))
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
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700 bg-slate-800">
        <button
          onClick={() => setActiveTab('ocr')}
          className={`px-6 py-3 font-medium transition ${
            activeTab === 'ocr'
              ? 'bg-slate-900 text-white border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          OCR Translation
        </button>
        <button
          onClick={() => setActiveTab('monitor')}
          className={`px-6 py-3 font-medium transition ${
            activeTab === 'monitor'
              ? 'bg-slate-900 text-white border-b-2 border-cyan-500'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Community Monitor
        </button>
        <div className="flex-1" />
        {connectionStatus === 'checking' && (
          <div className="text-xs text-yellow-400 px-4 py-3">Checking...</div>
        )}
        {connectionStatus === 'error' && (
          <div className="text-xs text-red-400 flex items-center gap-1 px-4 py-3" title={connectionError}>
            ⚠️ LM Studio Not Connected
          </div>
        )}
        {connectionStatus === 'ok' && (
          <div className="text-xs text-green-400 px-4 py-3">● Connected</div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'ocr' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800">
            <div className="px-3 py-1.5 rounded bg-slate-700 text-slate-300 font-medium">
              Screenshot Alt+Q
            </div>
            <button
              type="button"
              onClick={() => window.electronAPI?.pasteClipboardImage?.()}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white transition"
            >
              Paste Image
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
              <div className="text-slate-400 text-xs mb-2 font-semibold">Player Side</div>
              
              {screenshotB64 && (
                <div className="mb-3">
                  <div className="text-slate-400 text-xs mb-1">Screenshot</div>
                  <img 
                    src={'data:image/png;base64,' + screenshotB64} 
                    alt="Screenshot" 
                    className="max-w-full rounded border border-slate-600"
                    style={{ maxHeight: '200px', objectFit: 'contain' }}
                  />
                </div>
              )}

              <div className="mb-3">
                <div className="text-slate-400 text-xs mb-1">Japanese Text</div>
                <div className="bg-slate-800 rounded p-3 min-h-[80px] whitespace-pre-wrap border border-slate-600">
                  {ocrLoading && <span className="text-cyan-400">Recognizing...</span>}
                  {ocrError && (
                    <div className="text-red-400 text-xs">
                      <div className="font-semibold mb-1">Recognition Failed</div>
                      <div className="whitespace-pre-line">{ocrError}</div>
                    </div>
                  )}
                  {!ocrLoading && !ocrError && (ocrText || (screenshotB64 ? '' : 'Waiting for screenshot or paste'))}
                </div>
              </div>

              {!screenshotB64 && (
                <div className="text-slate-500 text-xs text-center py-8">
                  <div className="mb-2">Use Alt+Q to take screenshot</div>
                  <div>or click Paste Image button</div>
                </div>
              )}
            </div>

            <div className="w-1/2 flex flex-col p-3 overflow-auto">
              <div className="text-slate-400 text-xs mb-2 font-semibold">Support Side</div>
              
              <div className="mb-3">
                <div className="text-slate-400 text-xs mb-1">Chinese Reply</div>
                <textarea
                  placeholder="Enter Chinese reply..."
                  value={chineseInput}
                  onChange={e => setChineseInput(e.target.value)}
                  className="w-full h-32 rounded bg-slate-800 border border-slate-600 p-3 resize-none 
                           focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 text-slate-200"
                />
              </div>

              {translating && (
                <div className="text-cyan-400 text-xs mb-2">Translating...</div>
              )}
              {translateError && (
                <div className="text-red-400 text-xs mb-2">{translateError}</div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-slate-400 text-xs">Japanese Preview</div>
                  <button
                    type="button"
                    onClick={copyJapanese}
                    disabled={!japaneseOutput}
                    className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-40 
                             disabled:cursor-not-allowed transition"
                  >
                    Copy
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
      )}

      {/* Monitor Tab */}
      {activeTab === 'monitor' && <MonitorPanel />}
    </div>
  )
}
