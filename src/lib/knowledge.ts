import * as XLSX from 'xlsx'

export function parseXlsxBuffer(buffer: ArrayBuffer): string {
  const wb = XLSX.read(buffer, { type: 'array' })
  const lines: string[] = []
  wb.SheetNames.forEach((name, idx) => {
    const sheet = wb.Sheets[name]
    const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
    arr.forEach((row, rowIdx) => {
      const cells = (row as unknown[]).map(c => String(c ?? '').trim()).filter(Boolean)
      if (cells.length) lines.push(`[${name} 行${rowIdx + 1}]: ${cells.join(' | ')}`)
    })
  })
  return lines.join('\n')
}

export function truncateForContext(text: string, maxChars: number = 6000): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n...(已截断)'
}
