// قارئ CSV صغير: BOM، علامات تنصيص بـ""، أسطر جديدة جوا الخانة، وفاصل بيتعرف لحاله (، أو ; أو Tab).
// Excel العربي كثير بيحفظ بـ; بدل الفاصلة.

export function detectDelimiter(firstLine: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0]![1] > 0 ? counts[0]![0] : ','
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delim = detectDelimiter(src.split(/\r?\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}
