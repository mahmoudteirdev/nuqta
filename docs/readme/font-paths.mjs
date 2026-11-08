// بيحوّل نص لمسارات SVG من خطوط WOFF المحلية، بدون أي مكتبة.
// صور SVG داخل README ما بتقدر تحمّل خطوط، فالنص لازم يكون مسارات عشان يطلع نفس الشكل بكل مكان.

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

export function loadFont(file) {
  const b = readFileSync(file)
  if (b.toString('latin1', 0, 4) !== 'wOFF') throw new Error(`not a WOFF file: ${file}`)
  const n = b.readUInt16BE(12)
  const tables = {}
  for (let i = 0; i < n; i++) {
    const p = 44 + i * 20
    const tag = b.toString('latin1', p, p + 4)
    const off = b.readUInt32BE(p + 4)
    const comp = b.readUInt32BE(p + 8)
    const orig = b.readUInt32BE(p + 12)
    const raw = b.subarray(off, off + comp)
    tables[tag] = comp < orig ? inflateSync(raw) : raw
  }
  if (!tables.glyf) throw new Error(`no TrueType outlines in ${file}`)
  const unitsPerEm = tables.head.readUInt16BE(18)
  const longLoca = tables.head.readInt16BE(50) === 1
  const numberOfHMetrics = tables.hhea.readUInt16BE(34)
  const cmap = readCmap(tables.cmap)

  const glyphRange = (g) => {
    const l = tables.loca
    return longLoca ? [l.readUInt32BE(g * 4), l.readUInt32BE(g * 4 + 4)] : [l.readUInt16BE(g * 2) * 2, l.readUInt16BE(g * 2 + 2) * 2]
  }
  const advance = (g) => tables.hmtx.readUInt16BE(Math.min(g, numberOfHMetrics - 1) * 4)

  function contours(g, depth = 0) {
    const [start, end] = glyphRange(g)
    if (start === end || depth > 5) return []
    const d = tables.glyf.subarray(start, end)
    const count = d.readInt16BE(0)
    return count >= 0 ? simple(d, count) : composite(d, depth)
  }

  function simple(d, count) {
    let p = 10
    const ends = []
    for (let i = 0; i < count; i++, p += 2) ends.push(d.readUInt16BE(p))
    p += 2 + d.readUInt16BE(p)
    const total = (ends.at(-1) ?? -1) + 1
    const flags = []
    while (flags.length < total) {
      const f = d[p++]
      flags.push(f)
      if (f & 8) for (let r = d[p++]; r > 0; r--) flags.push(f)
    }
    const axis = (short, same) => {
      const out = []
      let v = 0
      for (const f of flags) {
        if (f & short) {
          const dv = d[p++]
          v += f & same ? dv : -dv
        } else if (!(f & same)) {
          v += d.readInt16BE(p)
          p += 2
        }
        out.push(v)
      }
      return out
    }
    const xs = axis(2, 16)
    const ys = axis(4, 32)
    const result = []
    let from = 0
    for (const e of ends) {
      const c = []
      for (let i = from; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) })
      result.push(c)
      from = e + 1
    }
    return result
  }

  function composite(d, depth) {
    let p = 10
    const result = []
    let more = true
    while (more) {
      const f = d.readUInt16BE(p)
      const child = d.readUInt16BE(p + 2)
      p += 4
      let dx, dy
      if (f & 1) {
        dx = d.readInt16BE(p)
        dy = d.readInt16BE(p + 2)
        p += 4
      } else {
        dx = d.readInt8(p)
        dy = d.readInt8(p + 1)
        p += 2
      }
      let a = 1, b2 = 0, c = 0, e = 1
      const f2 = (o) => d.readInt16BE(o) / 16384
      if (f & 8) {
        a = e = f2(p)
        p += 2
      } else if (f & 0x40) {
        a = f2(p)
        e = f2(p + 2)
        p += 4
      } else if (f & 0x80) {
        a = f2(p)
        b2 = f2(p + 2)
        c = f2(p + 4)
        e = f2(p + 6)
        p += 8
      }
      for (const contour of contours(child, depth + 1)) {
        result.push(contour.map((q) => ({ x: a * q.x + c * q.y + dx, y: b2 * q.x + e * q.y + dy, on: q.on })))
      }
      more = !!(f & 0x20)
    }
    return result
  }

  return { unitsPerEm, cmap, advance, contours }
}

function readCmap(t) {
  const n = t.readUInt16BE(2)
  const subs = []
  for (let i = 0; i < n; i++) subs.push(t.readUInt32BE(4 + i * 8 + 4))
  const out = new Map()
  for (const off of subs) {
    const format = t.readUInt16BE(off)
    if (format === 4) {
      const seg = t.readUInt16BE(off + 6) / 2
      const endO = off + 14
      const startO = endO + seg * 2 + 2
      const deltaO = startO + seg * 2
      const rangeO = deltaO + seg * 2
      for (let i = 0; i < seg; i++) {
        const end = t.readUInt16BE(endO + i * 2)
        const start = t.readUInt16BE(startO + i * 2)
        const delta = t.readInt16BE(deltaO + i * 2)
        const range = t.readUInt16BE(rangeO + i * 2)
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g
          if (range === 0) g = (c + delta) & 0xffff
          else {
            g = t.readUInt16BE(rangeO + i * 2 + range + (c - start) * 2)
            if (g) g = (g + delta) & 0xffff
          }
          if (g) out.set(c, g)
        }
      }
    } else if (format === 12) {
      const groups = t.readUInt32BE(off + 12)
      for (let i = 0; i < groups; i++) {
        const p = off + 16 + i * 12
        const s = t.readUInt32BE(p)
        const e = t.readUInt32BE(p + 4)
        const g = t.readUInt32BE(p + 8)
        for (let c = s; c <= e; c++) out.set(c, g + c - s)
      }
    }
  }
  return out
}

const num = (v) => String(Math.round(v * 10) / 10)

/** مسار حرف واحد. x وy نقطة البداية على خط الأساس، وsize حجم الخط. */
export function glyphPath(font, gid, x, y, size) {
  const s = size / font.unitsPerEm
  const px = (q) => num(x + q.x * s)
  const py = (q) => num(y - q.y * s)
  let d = ''
  for (const c of font.contours(gid)) {
    if (!c.length) continue
    const pts = []
    for (let i = 0; i < c.length; i++) {
      const a = c[i]
      const b = c[(i + 1) % c.length]
      pts.push(a)
      if (!a.on && !b.on) pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true })
    }
    let first = pts.findIndex((q) => q.on)
    if (first < 0) first = 0
    const ordered = [...pts.slice(first), ...pts.slice(0, first)]
    d += `M${px(ordered[0])} ${py(ordered[0])}`
    for (let i = 1; i <= ordered.length; i++) {
      const q = ordered[i % ordered.length]
      if (q.on) {
        d += `L${px(q)} ${py(q)}`
      } else {
        const next = ordered[(i + 1) % ordered.length]
        d += `Q${px(q)} ${py(q)} ${px(next)} ${py(next)}`
        i++
      }
    }
    d += 'Z'
  }
  return d
}

/** كل حرف بمساره وموقعه، عشان كل حرف يتحرك لحاله. */
export function layoutText(font, text, x, y, size, { tracking = 0 } = {}) {
  const s = size / font.unitsPerEm
  let pen = x
  const glyphs = []
  for (const ch of text) {
    const gid = font.cmap.get(ch.codePointAt(0))
    if (gid === undefined) throw new Error(`no glyph for U+${ch.codePointAt(0).toString(16)}`)
    glyphs.push({ ch, d: glyphPath(font, gid, pen, y, size) })
    pen += font.advance(gid) * s + tracking
  }
  return { glyphs, width: pen - x - tracking }
}

export const textPath = (font, text, x, y, size, opts) => layoutText(font, text, x, y, size, opts).glyphs.map((g) => g.d).join('')
export const textWidth = (font, text, size, opts) => layoutText(font, text, 0, 0, size, opts).width
