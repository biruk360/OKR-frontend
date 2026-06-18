/**
 * Convert simple HTML (the template strings in lib/letters.ts, and mammoth's
 * round-trip output) to a real OOXML .docx — not the altChunk fake-docx
 * that `html-docx-js-typescript` produces.
 *
 * Why this matters: SuperDoc loads the .docx via its OOXML parser, and our
 * server-side PDF pipeline runs mammoth on whatever .docx the editor saves
 * back. Both insist on real OOXML; altChunk-wrapped .docx files are valid
 * Word documents but they're MIME-HTML pretending to be Word, and mammoth
 * silently returns empty HTML for them.
 *
 * Scope: the letter body HTML we store and round-trip — paragraphs, headings,
 * inline formatting, lists, basic tables, and common spacing/alignment/colour
 * styles. The saved DOCX remains authoritative after the first SuperDoc save.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { IBorderOptions, ITableCellBorders, ITableWidthProperties } from 'docx'
import { DEFAULT_LETTER_DOCUMENT_FONT } from './letter-docx-font'

interface InlineState {
  bold: boolean
  italic: boolean
  underline: boolean
  color?: string
  backgroundColor?: string
  font?: string
  size?: number
  letterSpacing?: number
}

interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  backgroundColor?: string
  font?: string
  size?: number
  letterSpacing?: number
}

interface CssBorder {
  style: (typeof BorderStyle)[keyof typeof BorderStyle]
  color?: string
  size?: number
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–',
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_m, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

function parseInline(html: string): InlineRun[] {
  const runs: InlineRun[] = []
  const tagRe = /<\/?(strong|b|em|i|u|span|br)\b[^>]*>/gi
  const stack: InlineState[] = []
  let state: InlineState = { bold: false, italic: false, underline: false }
  let lastIdx = 0
  let m: RegExpExecArray | null

  function flushText(t: string) {
    if (!t) return
    const text = decode(t).replace(/\s+/g, ' ')
    if (!text) return

    runs.push({
      text,
      ...(state.bold && { bold: true }),
      ...(state.italic && { italic: true }),
      ...(state.underline && { underline: true }),
      ...(state.color && { color: state.color }),
      ...(state.backgroundColor && { backgroundColor: state.backgroundColor }),
      ...(state.font && { font: state.font }),
      ...(state.size && { size: state.size }),
      ...(state.letterSpacing !== undefined && { letterSpacing: state.letterSpacing }),
    })
  }

  while ((m = tagRe.exec(html)) !== null) {
    flushText(html.slice(lastIdx, m.index))
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')

    if (tag === 'br') {
      runs.push({ text: '\n' })
    } else if (closing) {
      state = stack.pop() || state
    } else {
      stack.push({ ...state })
      if (tag === 'strong' || tag === 'b') state.bold = true
      else if (tag === 'em' || tag === 'i') state.italic = true
      else if (tag === 'u') state.underline = true
      else if (tag === 'span') {
        const style = parseStyle(readAttrFromTag(m[0], 'style'))
        const color = cssColorToDocx(style.color)
        const backgroundColor = cssColorToDocx(style['background-color'] || style.background)
        const size = cssLengthToHalfPoints(style['font-size'])
        const letterSpacing = cssLengthToTwips(style['letter-spacing'])
        const font = cleanFontName(style['font-family'])
        if (color) state.color = color
        if (backgroundColor) state.backgroundColor = backgroundColor
        if (size) state.size = size
        if (letterSpacing !== undefined) state.letterSpacing = letterSpacing
        if (font) state.font = font
      }
    }
    lastIdx = m.index + m[0].length
  }
  flushText(html.slice(lastIdx))
  return runs
}

function runsToTextRuns(runs: InlineRun[]): TextRun[] {
  const out: TextRun[] = []
  for (const r of runs) {
    if (r.text === '\n') {
      out.push(new TextRun({ break: 1 }))
      continue
    }
    out.push(
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        underline: r.underline ? {} : undefined,
        color: r.color,
        font: r.font,
        size: r.size,
        characterSpacing: r.letterSpacing,
        shading: r.backgroundColor ? { fill: r.backgroundColor } : undefined,
      })
    )
  }
  return out
}

function parseBlocks(html: string): Array<Paragraph | Table> {
  const cleaned = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '')
    .trim()
  const blocks: Array<Paragraph | Table> = []
  const blockRe = /<(table|p|h1|h2|h3|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  let lastIdx = 0
  let m: RegExpExecArray | null

  while ((m = blockRe.exec(cleaned)) !== null) {
    const between = cleaned.slice(lastIdx, m.index).trim()
    if (between) {
      blocks.push(createParagraph('p', '', between))
    }

    const tag = m[1].toLowerCase()
    const attrs = m[2] || ''
    const inner = m[3] || ''
    blocks.push(tag === 'table' ? createTable(attrs, inner) : createParagraph(tag, attrs, inner))
    lastIdx = m.index + m[0].length
  }

  const trailing = cleaned.slice(lastIdx).trim()
  if (trailing) blocks.push(createParagraph('p', '', trailing))
  if (blocks.length === 0) blocks.push(new Paragraph({ children: [new TextRun('')] }))
  return blocks
}

function createParagraph(tag: string, attrs: string, inner: string): Paragraph {
  const style = parseStyle(readAttrFromAttrs(attrs, 'style'))
  const runs = runsToTextRuns(parseInline(inner))
  const baseOptions = {
    children: runs.length ? runs : [new TextRun('')],
    ...paragraphOptionsFromStyle(style),
  }

  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    return new Paragraph({
      ...baseOptions,
      heading: (tag === 'h1' ? 'Heading1' : tag === 'h2' ? 'Heading2' : 'Heading3') as any,
    })
  }
  if (tag === 'li') {
    return new Paragraph({ ...baseOptions, bullet: { level: 0 } })
  }

  return new Paragraph(baseOptions)
}

function createTable(attrs: string, inner: string): Table {
  const rows: TableRow[] = []
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRe.exec(inner)) !== null) {
    const rowAttrs = rowMatch[1] || ''
    const rowInner = rowMatch[2] || ''
    const cells: TableCell[] = []
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRe.exec(rowInner)) !== null) {
      const cellAttrs = cellMatch[2] || ''
      const cellInner = cellMatch[3] || ''
      cells.push(createTableCell(cellAttrs, cellInner))
    }

    if (cells.length > 0) {
      const rowStyle = parseStyle(readAttrFromAttrs(rowAttrs, 'style'))
      rows.push(new TableRow({ children: cells, ...tableRowOptionsFromStyle(rowStyle) }))
    }
  }

  if (rows.length === 0) {
    rows.push(new TableRow({
      children: [new TableCell({ children: [new Paragraph({ children: [new TextRun('')] })] })],
    }))
  }

  const style = parseStyle(readAttrFromAttrs(attrs, 'style'))
  const border = parseCssBorder(style.border)
  return new Table({
    rows,
    width: tableWidthFromStyleOrAttr(style.width, readAttrFromAttrs(attrs, 'width')) || {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    layout: style['table-layout'] === 'fixed' ? TableLayoutType.FIXED : TableLayoutType.AUTOFIT,
    alignment: tableAlignmentFromStyle(style),
    borders: border ? {
      top: border,
      right: border,
      bottom: border,
      left: border,
      insideHorizontal: border,
      insideVertical: border,
    } : undefined,
  })
}

function createTableCell(attrs: string, inner: string): TableCell {
  const style = parseStyle(readAttrFromAttrs(attrs, 'style'))
  const children = parseCellParagraphs(inner)
  const border = parseCssBorder(style.border)
  const borders = tableCellBordersFromStyle(style, border)
  const background = cssColorToDocx(style['background-color'] || style.background)

  return new TableCell({
    children,
    columnSpan: parsePositiveInt(readAttrFromAttrs(attrs, 'colspan')),
    rowSpan: parsePositiveInt(readAttrFromAttrs(attrs, 'rowspan')),
    width: tableWidthFromStyleOrAttr(style.width, readAttrFromAttrs(attrs, 'width')),
    margins: cellMarginsFromStyle(style),
    verticalAlign: verticalAlignFromStyle(style['vertical-align']),
    borders,
    shading: background ? { fill: background } : undefined,
  })
}

function parseCellParagraphs(html: string): Paragraph[] {
  const paragraphMatches = Array.from(html.matchAll(/<(p|h1|h2|h3|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi))
  if (paragraphMatches.length === 0) return [createParagraph('p', '', html)]

  return paragraphMatches.map((match) => createParagraph(match[1].toLowerCase(), match[2] || '', match[3] || ''))
}

function paragraphOptionsFromStyle(style: Record<string, string>) {
  const spacing: Record<string, string | number> = {}
  const indent: Record<string, number> = {}
  const before = cssLengthToTwips(style['margin-top'])
  const after = cssLengthToTwips(style['margin-bottom'])
  const lineHeight = cssLineHeightToDocx(style['line-height'])
  const left = cssLengthToTwips(style['margin-left'] || style['padding-left'])
  const right = cssLengthToTwips(style['margin-right'] || style['padding-right'])
  const firstLine = cssLengthToTwips(style['text-indent'])
  const background = cssColorToDocx(style['background-color'] || style.background)

  if (before !== undefined) spacing.before = before
  if (after !== undefined) spacing.after = after
  if (lineHeight) Object.assign(spacing, lineHeight)
  if (left !== undefined) indent.left = left
  if (right !== undefined) indent.right = right
  if (firstLine !== undefined && firstLine >= 0) indent.firstLine = firstLine
  if (firstLine !== undefined && firstLine < 0) indent.hanging = Math.abs(firstLine)

  return {
    alignment: alignmentFromCss(style['text-align']),
    spacing: Object.keys(spacing).length ? spacing : undefined,
    indent: Object.keys(indent).length ? indent : undefined,
    pageBreakBefore: /page/i.test(style['break-before'] || style['page-break-before'] || ''),
    shading: background ? { fill: background } : undefined,
  }
}

function tableRowOptionsFromStyle(style: Record<string, string>) {
  const height = cssLengthToTwips(style.height || style['min-height'])
  return height === undefined ? {} : { height: { value: height, rule: 'atLeast' as const } }
}

function tableCellBordersFromStyle(style: Record<string, string>, fallback?: CssBorder): ITableCellBorders | undefined {
  const top = parseCssBorder(style['border-top']) || fallback
  const right = parseCssBorder(style['border-right']) || fallback
  const bottom = parseCssBorder(style['border-bottom']) || fallback
  const left = parseCssBorder(style['border-left']) || fallback
  if (!top && !right && !bottom && !left) return undefined

  return { top, right, bottom, left }
}

function cellMarginsFromStyle(style: Record<string, string>) {
  const all = cssLengthToTwips(style.padding)
  const top = cssLengthToTwips(style['padding-top']) ?? all
  const right = cssLengthToTwips(style['padding-right']) ?? all
  const bottom = cssLengthToTwips(style['padding-bottom']) ?? all
  const left = cssLengthToTwips(style['padding-left']) ?? all
  if (top === undefined && right === undefined && bottom === undefined && left === undefined) return undefined

  return { top, right, bottom, left }
}

function tableWidthFromStyleOrAttr(styleWidth: string | undefined, attrWidth: string | undefined): ITableWidthProperties | undefined {
  const raw = styleWidth || attrWidth
  if (!raw) return undefined
  const cleaned = raw.trim()
  if (!cleaned) return undefined

  if (/%$/.test(cleaned)) {
    const percent = Number.parseFloat(cleaned)
    if (!Number.isFinite(percent) || percent <= 0) return undefined
    return { size: percent, type: WidthType.PERCENTAGE }
  }

  const twips = cssLengthToTwips(cleaned)
  return twips === undefined || twips <= 0 ? undefined : { size: twips, type: WidthType.DXA }
}

function tableAlignmentFromStyle(style: Record<string, string>) {
  const margin = `${style.margin || ''} ${style['margin-left'] || ''} ${style['margin-right'] || ''}`
  if (/auto/.test(margin) && !style['margin-left'] && !style['margin-right']) return AlignmentType.CENTER
  if (style['margin-left'] === 'auto') return AlignmentType.RIGHT
  return undefined
}

function verticalAlignFromStyle(value: string | undefined) {
  if (value === 'middle' || value === 'center') return VerticalAlign.CENTER
  if (value === 'bottom') return VerticalAlign.BOTTOM
  if (value === 'top') return VerticalAlign.TOP
  return undefined
}

function alignmentFromCss(value: string | undefined) {
  if (value === 'center') return AlignmentType.CENTER
  if (value === 'right' || value === 'end') return AlignmentType.RIGHT
  if (value === 'justify') return AlignmentType.JUSTIFIED
  if (value === 'left' || value === 'start') return AlignmentType.LEFT
  return undefined
}

function parseStyle(styleAttr: string | undefined): Record<string, string> {
  if (!styleAttr) return {}
  const style: Record<string, string> = {}
  for (const declaration of styleAttr.split(';')) {
    const [rawKey, ...rest] = declaration.split(':')
    const key = rawKey?.trim().toLowerCase()
    const value = rest.join(':').trim()
    if (key && value) style[key] = value
  }
  return style
}

function parseCssBorder(value: string | undefined): CssBorder | undefined {
  if (!value) return undefined
  const cleaned = value.trim().toLowerCase()
  if (!cleaned || cleaned === 'none' || cleaned === '0') {
    return { style: BorderStyle.NONE, size: 0 }
  }

  const width = cleaned.match(/(?:^|\s)([0-9.]+)(px|pt|mm|cm|in)(?:\s|$)/)
  const color = cssColorToDocx(cleaned)
  const style = cleaned.includes('dashed') ? BorderStyle.DASHED
    : cleaned.includes('dotted') ? BorderStyle.DOTTED
    : cleaned.includes('double') ? BorderStyle.DOUBLE
    : BorderStyle.SINGLE
  const size = width ? Math.max(1, Math.round(cssLengthToPoints(`${width[1]}${width[2]}`) * 8)) : 6

  return { style, color, size }
}

function cssLineHeightToDocx(value: string | undefined): Record<string, string | number> | undefined {
  if (!value || value === 'normal') return undefined
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined

  if (/^[0-9.]+$/.test(value.trim())) {
    return { line: Math.round(numeric * 240) }
  }

  const twips = cssLengthToTwips(value)
  return twips === undefined ? undefined : { line: twips, lineRule: 'exact' }
}

function cssLengthToTwips(value: string | undefined): number | undefined {
  const points = cssLengthToPoints(value)
  return Number.isFinite(points) ? Math.round(points * 20) : undefined
}

function cssLengthToHalfPoints(value: string | undefined): number | undefined {
  const points = cssLengthToPoints(value)
  return Number.isFinite(points) && points > 0 ? Math.round(points * 2) : undefined
}

function cssLengthToPoints(value: string | undefined): number {
  if (!value) return Number.NaN
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed === 'auto') return Number.NaN

  const match = trimmed.match(/^(-?[0-9.]+)(px|pt|mm|cm|in)?$/)
  if (!match) return Number.NaN

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount)) return Number.NaN
  const unit = match[2] || 'px'
  if (unit === 'pt') return amount
  if (unit === 'px') return amount * 0.75
  if (unit === 'in') return amount * 72
  if (unit === 'cm') return amount * 28.3464567
  if (unit === 'mm') return amount * 2.83464567
  return Number.NaN
}

function cssColorToDocx(value: string | undefined): string | undefined {
  if (!value) return undefined
  const hex = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)?.[1]
  if (hex) {
    return hex.length === 3
      ? hex.split('').map((ch) => ch + ch).join('').toUpperCase()
      : hex.toUpperCase()
  }

  const rgb = value.match(/rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/i)
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((part) => Math.max(0, Math.min(255, Number.parseInt(part, 10))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }

  const named: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    yellow: 'FFFF00',
    gray: '808080',
    grey: '808080',
  }
  return named[value.trim().toLowerCase()]
}

function cleanFontName(font: string | undefined): string | undefined {
  if (!font) return undefined
  const primary = font.split(',')[0]?.replace(/['"]/g, '').trim()
  if (!primary || /^(serif|sans-serif|monospace)$/i.test(primary)) return undefined
  return primary
}

function readAttrFromTag(tag: string, name: string): string | undefined {
  return readAttrFromAttrs(tag.replace(/^<[^\s>]+/, '').replace(/\/?>$/, ''), name)
}

function readAttrFromAttrs(attrs: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attrs.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined
  const parsed = Number.parseInt(value, 10)
  return parsed > 0 ? parsed : undefined
}

/**
 * Convert template-style HTML to a real OOXML .docx buffer.
 * Mammoth round-trips this cleanly; SuperDoc loads it as a normal document.
 */
export async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  const children = parseBlocks(html || '')
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_LETTER_DOCUMENT_FONT },
        },
      },
    },
    sections: [{ properties: {}, children }],
  })
  return Packer.toBuffer(doc)
}
