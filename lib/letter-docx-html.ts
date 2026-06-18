import JSZip from 'jszip'

type MammothModule = typeof import('mammoth') & {
  transforms: {
    run: (transformRun: (run: any) => any) => (element: any) => any
  }
}

interface RunStyleSpec {
  font?: string
  fontSize?: number
  color?: string
  backgroundColor?: string
  letterSpacing?: number
}

interface ConversionPlan {
  paragraphStyles: Map<number, string>
  tableStyles: Map<number, string>
  rowStyles: Map<number, string>
  cellStyles: Map<number, string>
  runStyleIds: Map<string, string>
  runStyleSequence: Array<string | null>
  styleMap: string[]
}

const RUN_STYLE_ID_PREFIX = 'letter-run-style-'

/**
 * Convert the saved DOCX body into the HTML mirror used by placeholder
 * resolution, PDF preview, and print.
 *
 * Mammoth intentionally drops many visual DOCX details. The letter editor is a
 * WYSIWYG body editor, so the HTML mirror used for preview/PDF/print keeps the
 * common body formatting that authors can change in SuperDoc: fonts, sizes,
 * colours, paragraph spacing/line spacing/indents, page breaks, and table
 * dimensions/borders/cell shading.
 */
export async function convertLetterDocxToHtml(buffer: Buffer): Promise<{
  html: string
  messages: unknown
}> {
  const { buffer: mammothBuffer, docXml } = await prepareBufferForMammoth(buffer)
  const plan = buildConversionPlan(docXml)
  const mammoth = (await import('mammoth')) as unknown as MammothModule
  let runIndex = 0

  const result = await mammoth.convertToHtml(
    { buffer: mammothBuffer },
    {
      styleMap: plan.styleMap,
      transformDocument: mammoth.transforms.run((run: any) => {
        const indexedStyleId = plan.runStyleSequence[runIndex++] ?? null
        if (indexedStyleId) {
          return { ...run, styleId: indexedStyleId, styleName: indexedStyleId }
        }

        const spec = runStyleSpecFromMammothRun(run)
        const key = spec ? runStyleKey(spec) : null
        const styleId = key ? plan.runStyleIds.get(key) : null

        return styleId
          ? { ...run, styleId, styleName: styleId }
          : run
      }),
    },
  )

  return {
    html: applyElementStyles(result.value, plan),
    messages: result.messages,
  }
}

async function prepareBufferForMammoth(buffer: Buffer): Promise<{
  buffer: Buffer
  docXml: string
}> {
  const zip = await JSZip.loadAsync(buffer)
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) return { buffer, docXml: '' }

  const docXml = await documentFile.async('string')
  const normalizedDocXml = normalizeRunPropertiesForMammoth(docXml)
  if (normalizedDocXml === docXml) return { buffer, docXml }

  zip.file('word/document.xml', normalizedDocXml)
  const normalizedBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return { buffer: normalizedBuffer, docXml: normalizedDocXml }
}

function normalizeRunPropertiesForMammoth(docXml: string): string {
  return docXml.replace(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/g, (runProperties) => {
    let updated = normalizeRunFontsForMammoth(runProperties)
    updated = normalizeRunFontSizeForMammoth(updated)
    return updated
  })
}

function normalizeRunFontsForMammoth(runProperties: string): string {
  const fontsMatch = runProperties.match(/<w:rFonts\b[^>]*(?:\/>|>[\s\S]*?<\/w:rFonts>)/)
  if (!fontsMatch) return runProperties

  const fontsXml = fontsMatch[0]
  if (readAttr(fontsXml, 'w:ascii')) return runProperties

  const fallback =
    readAttr(fontsXml, 'w:hAnsi') ||
    readAttr(fontsXml, 'w:eastAsia') ||
    readAttr(fontsXml, 'w:cs')
  if (!fallback) return runProperties

  return runProperties.replace(fontsXml, addAttrToOpeningTag(fontsXml, 'w:ascii', fallback))
}

function normalizeRunFontSizeForMammoth(runProperties: string): string {
  if (/<w:sz\b/.test(runProperties)) return runProperties

  const complexScriptSize = runProperties.match(/<w:szCs\b[^>]*\bw:val="([0-9]+)"/)?.[1]
  if (!complexScriptSize) return runProperties

  return runProperties.replace(
    /<w:rPr(?:\s[^>]*)?>/,
    (open) => `${open}<w:sz w:val="${complexScriptSize}"/>`,
  )
}

function buildConversionPlan(docXml: string): ConversionPlan {
  const runStyleSpecs = collectRunStyleSpecs(docXml)
  const runStyleIds = new Map<string, string>()
  const styleMap: string[] = [
    "u => span[style='text-decoration:underline']",
    "highlight => span[style='background-color:#fff2cc']",
    "highlight[color='black'] => span[style='background-color:#000000']",
    "highlight[color='blue'] => span[style='background-color:#0070c0']",
    "highlight[color='cyan'] => span[style='background-color:#00ffff']",
    "highlight[color='green'] => span[style='background-color:#92d050']",
    "highlight[color='magenta'] => span[style='background-color:#ff00ff']",
    "highlight[color='red'] => span[style='background-color:#ff0000']",
    "highlight[color='yellow'] => span[style='background-color:#ffff00']",
    "br[type='line'] => br",
    "br[type='page'] => div.letter-page-break:fresh",
    "br[type='column'] => div.letter-column-break:fresh",
  ]

  let idx = 0
  for (const spec of runStyleSpecs) {
    if (!spec) continue
    const key = runStyleKey(spec)
    if (runStyleIds.has(key)) continue
    const styleId = `${RUN_STYLE_ID_PREFIX}${idx++}`
    runStyleIds.set(key, styleId)
    styleMap.push(`r.${styleId} => span[style='${cssForRunStyle(spec)}']`)
  }

  return {
    paragraphStyles: extractParagraphStyles(docXml),
    tableStyles: extractTableStyles(docXml),
    rowStyles: extractTableRowStyles(docXml),
    cellStyles: extractTableCellStyles(docXml),
    runStyleIds,
    runStyleSequence: runStyleSpecs.map((spec) => spec ? runStyleIds.get(runStyleKey(spec)) ?? null : null),
    styleMap,
  }
}

function collectRunStyleSpecs(docXml: string): Array<RunStyleSpec | null> {
  const runs = docXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || []

  return runs.map((run) => {
    const runProperties = run.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0]
    if (!runProperties) return null

    return normalizeRunStyleSpec({
      font: extractRunFont(runProperties),
      fontSize: extractRunFontSize(runProperties),
      color: extractRunColor(runProperties),
      backgroundColor: extractRunBackgroundColor(runProperties),
      letterSpacing: extractRunLetterSpacing(runProperties),
    })
  })
}

function runStyleSpecFromMammothRun(run: any): RunStyleSpec | null {
  return normalizeRunStyleSpec({
    font: typeof run.font === 'string' ? run.font : undefined,
    fontSize: typeof run.fontSize === 'number' ? run.fontSize : undefined,
  })
}

function normalizeRunStyleSpec(spec: RunStyleSpec): RunStyleSpec | null {
  const font = cleanFontName(spec.font)
  const fontSize = cleanFontSize(spec.fontSize)
  const color = cleanHexColor(spec.color)
  const backgroundColor = cleanHexColor(spec.backgroundColor)
  const letterSpacing = cleanSignedPointSize(spec.letterSpacing, 40)
  if (
    !font &&
    fontSize === undefined &&
    !color &&
    !backgroundColor &&
    letterSpacing === undefined
  ) return null

  return {
    ...(font ? { font } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(color ? { color } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
  }
}

function extractRunFont(runProperties: string): string | undefined {
  const fontsXml = runProperties.match(/<w:rFonts\b[^>]*(?:\/>|>[\s\S]*?<\/w:rFonts>)/)?.[0]
  if (!fontsXml) return undefined

  return readAttr(fontsXml, 'w:ascii') ||
    readAttr(fontsXml, 'w:hAnsi') ||
    readAttr(fontsXml, 'w:eastAsia') ||
    readAttr(fontsXml, 'w:cs') ||
    undefined
}

function extractRunFontSize(runProperties: string): number | undefined {
  const rawSize = runProperties.match(/<w:sz\b[^>]*\bw:val="([0-9]+)"/)?.[1] ||
    runProperties.match(/<w:szCs\b[^>]*\bw:val="([0-9]+)"/)?.[1]
  if (!rawSize) return undefined

  return Number.parseInt(rawSize, 10) / 2
}

function extractRunColor(runProperties: string): string | undefined {
  const colorXml = firstTag(runProperties, 'w:color')
  return colorXml ? wordColorToCss(readAttr(colorXml, 'w:val')) : undefined
}

function extractRunBackgroundColor(runProperties: string): string | undefined {
  const shadingXml = firstTag(runProperties, 'w:shd')
  const shading = shadingXml ? wordColorToCss(readAttr(shadingXml, 'w:fill')) : undefined
  if (shading) return shading

  const highlightXml = firstTag(runProperties, 'w:highlight')
  return highlightToCss(highlightXml ? readAttr(highlightXml, 'w:val') : undefined)
}

function extractRunLetterSpacing(runProperties: string): number | undefined {
  const raw = firstTag(runProperties, 'w:spacing')
  const val = raw ? parseInteger(readAttr(raw, 'w:val')) : undefined
  return val === undefined ? undefined : val / 20
}

function extractParagraphStyles(docXml: string): Map<number, string> {
  const styles = new Map<number, string>()
  const paragraphs = extractBlocks(docXml, 'w:p')

  paragraphs.forEach((block, idx) => {
    const pPr = firstTag(block, 'w:pPr')
    if (!pPr) return

    const declarations: string[] = []
    appendParagraphAlignment(declarations, pPr)
    appendParagraphSpacing(declarations, pPr)
    appendParagraphIndent(declarations, pPr)
    appendShading(declarations, pPr)
    appendParagraphBorders(declarations, pPr)

    if (firstTag(pPr, 'w:pageBreakBefore')) declarations.push('break-before:page', 'page-break-before:always')
    if (firstTag(pPr, 'w:keepLines')) declarations.push('break-inside:avoid')
    if (firstTag(pPr, 'w:keepNext')) declarations.push('break-after:avoid')

    const css = declarations.join('; ')
    if (css) styles.set(idx, css)
  })

  return styles
}

function appendParagraphAlignment(declarations: string[], pPr: string) {
  const val = firstTag(pPr, 'w:jc')
  const align = val ? readAttr(val, 'w:val') : undefined
  const css = align === 'both' || align === 'distribute' ? 'justify'
    : align === 'center' ? 'center'
    : align === 'right' || align === 'end' ? 'right'
    : align === 'left' || align === 'start' ? 'left'
    : null
  if (css) declarations.push(`text-align:${css}`)
}

function appendParagraphSpacing(declarations: string[], pPr: string) {
  const spacing = firstTag(pPr, 'w:spacing')
  if (!spacing) return

  const before = parseInteger(readAttr(spacing, 'w:before'))
  const after = parseInteger(readAttr(spacing, 'w:after'))
  if (before !== undefined) declarations.push(`margin-top:${roundCssNumber(before / 20)}pt`)
  if (after !== undefined) declarations.push(`margin-bottom:${roundCssNumber(after / 20)}pt`)

  const line = parseInteger(readAttr(spacing, 'w:line'))
  if (line === undefined) return

  const lineRule = readAttr(spacing, 'w:lineRule') || 'auto'
  if (lineRule === 'exact' || lineRule === 'atLeast') {
    declarations.push(`line-height:${roundCssNumber(line / 20)}pt`)
  } else {
    declarations.push(`line-height:${roundCssNumber(line / 240)}`)
  }
}

function appendParagraphIndent(declarations: string[], pPr: string) {
  const ind = firstTag(pPr, 'w:ind')
  if (!ind) return

  const left = parseInteger(readAttr(ind, 'w:left') || readAttr(ind, 'w:start'))
  const right = parseInteger(readAttr(ind, 'w:right') || readAttr(ind, 'w:end'))
  const firstLine = parseInteger(readAttr(ind, 'w:firstLine'))
  const hanging = parseInteger(readAttr(ind, 'w:hanging'))

  if (left !== undefined) declarations.push(`margin-left:${roundCssNumber(left / 20)}pt`)
  if (right !== undefined) declarations.push(`margin-right:${roundCssNumber(right / 20)}pt`)
  if (firstLine !== undefined) declarations.push(`text-indent:${roundCssNumber(firstLine / 20)}pt`)
  if (hanging !== undefined) declarations.push(`text-indent:-${roundCssNumber(hanging / 20)}pt`)
}

function appendParagraphBorders(declarations: string[], pPr: string) {
  const pBdr = firstTag(pPr, 'w:pBdr')
  if (!pBdr) return

  appendBorderDeclaration(declarations, 'border-top', firstTag(pBdr, 'w:top'))
  appendBorderDeclaration(declarations, 'border-right', firstTag(pBdr, 'w:right'))
  appendBorderDeclaration(declarations, 'border-bottom', firstTag(pBdr, 'w:bottom'))
  appendBorderDeclaration(declarations, 'border-left', firstTag(pBdr, 'w:left'))
}

function extractTableStyles(docXml: string): Map<number, string> {
  const styles = new Map<number, string>()
  const tables = extractBlocks(docXml, 'w:tbl')

  tables.forEach((block, idx) => {
    const tblPr = firstTag(block, 'w:tblPr')
    if (!tblPr) return

    const declarations: string[] = ['border-collapse:collapse']
    appendTableWidth(declarations, firstTag(tblPr, 'w:tblW'), 'width')
    appendTableWidth(declarations, firstTag(tblPr, 'w:tblInd'), 'margin-left')
    appendTableAlignment(declarations, tblPr)
    appendShading(declarations, tblPr)

    const layout = firstTag(tblPr, 'w:tblLayout')
    if (layout && readAttr(layout, 'w:type') === 'fixed') declarations.push('table-layout:fixed')

    const tblBorders = firstTag(tblPr, 'w:tblBorders')
    if (tblBorders) {
      appendBorderDeclaration(declarations, 'border-top', firstTag(tblBorders, 'w:top'))
      appendBorderDeclaration(declarations, 'border-right', firstTag(tblBorders, 'w:right'))
      appendBorderDeclaration(declarations, 'border-bottom', firstTag(tblBorders, 'w:bottom'))
      appendBorderDeclaration(declarations, 'border-left', firstTag(tblBorders, 'w:left'))
    }

    const css = declarations.join('; ')
    if (css) styles.set(idx, css)
  })

  return styles
}

function appendTableAlignment(declarations: string[], tblPr: string) {
  const jc = firstTag(tblPr, 'w:jc')
  const val = jc ? readAttr(jc, 'w:val') : undefined
  if (val === 'center') declarations.push('margin-left:auto', 'margin-right:auto')
  else if (val === 'right' || val === 'end') declarations.push('margin-left:auto', 'margin-right:0')
}

function appendTableWidth(declarations: string[], widthTag: string | undefined, property: string) {
  if (!widthTag) return

  const width = cssSizeFromTableWidth(widthTag)
  if (width) declarations.push(`${property}:${width}`)
}

function extractTableRowStyles(docXml: string): Map<number, string> {
  const styles = new Map<number, string>()
  const rows = extractBlocks(docXml, 'w:tr')

  rows.forEach((block, idx) => {
    const trPr = firstTag(block, 'w:trPr')
    if (!trPr) return

    const declarations: string[] = []
    if (firstTag(trPr, 'w:cantSplit')) declarations.push('break-inside:avoid')

    const height = firstTag(trPr, 'w:trHeight')
    const val = height ? parseInteger(readAttr(height, 'w:val')) : undefined
    if (val !== undefined) {
      const rule = readAttr(height!, 'w:hRule')
      const property = rule === 'exact' ? 'height' : 'min-height'
      declarations.push(`${property}:${roundCssNumber(val / 20)}pt`)
    }

    const css = declarations.join('; ')
    if (css) styles.set(idx, css)
  })

  return styles
}

function extractTableCellStyles(docXml: string): Map<number, string> {
  const styles = new Map<number, string>()
  const cells = extractBlocks(docXml, 'w:tc')

  cells.forEach((block, idx) => {
    const tcPr = firstTag(block, 'w:tcPr')
    if (!tcPr) return

    const declarations: string[] = []
    appendTableWidth(declarations, firstTag(tcPr, 'w:tcW'), 'width')
    appendCellMargins(declarations, tcPr)
    appendShading(declarations, tcPr)

    const vAlign = firstTag(tcPr, 'w:vAlign')
    const vAlignVal = vAlign ? readAttr(vAlign, 'w:val') : undefined
    if (vAlignVal === 'center') declarations.push('vertical-align:middle')
    else if (vAlignVal === 'bottom') declarations.push('vertical-align:bottom')
    else if (vAlignVal === 'top') declarations.push('vertical-align:top')

    const tcBorders = firstTag(tcPr, 'w:tcBorders')
    if (tcBorders) {
      appendBorderDeclaration(declarations, 'border-top', firstTag(tcBorders, 'w:top'))
      appendBorderDeclaration(declarations, 'border-right', firstTag(tcBorders, 'w:right') || firstTag(tcBorders, 'w:end'))
      appendBorderDeclaration(declarations, 'border-bottom', firstTag(tcBorders, 'w:bottom'))
      appendBorderDeclaration(declarations, 'border-left', firstTag(tcBorders, 'w:left') || firstTag(tcBorders, 'w:start'))
    }

    const css = declarations.join('; ')
    if (css) styles.set(idx, css)
  })

  return styles
}

function appendCellMargins(declarations: string[], tcPr: string) {
  const margins = firstTag(tcPr, 'w:tcMar')
  if (!margins) return

  const top = cssSizeFromTableWidth(firstTag(margins, 'w:top'))
  const right = cssSizeFromTableWidth(firstTag(margins, 'w:right') || firstTag(margins, 'w:end'))
  const bottom = cssSizeFromTableWidth(firstTag(margins, 'w:bottom'))
  const left = cssSizeFromTableWidth(firstTag(margins, 'w:left') || firstTag(margins, 'w:start'))
  if (top) declarations.push(`padding-top:${top}`)
  if (right) declarations.push(`padding-right:${right}`)
  if (bottom) declarations.push(`padding-bottom:${bottom}`)
  if (left) declarations.push(`padding-left:${left}`)
}

function appendShading(declarations: string[], properties: string) {
  const shd = firstTag(properties, 'w:shd')
  const fill = shd ? wordColorToCss(readAttr(shd, 'w:fill')) : undefined
  if (fill) declarations.push(`background-color:${fill}`)
}

function appendBorderDeclaration(declarations: string[], property: string, borderXml?: string) {
  const border = cssBorderFromWordBorder(borderXml)
  if (border) declarations.push(`${property}:${border}`)
}

function applyElementStyles(html: string, plan: ConversionPlan): string {
  let paragraphIndex = 0
  let tableIndex = 0
  let rowIndex = 0
  let cellIndex = 0

  return html.replace(/<(p|h[1-6]|li|table|tr|td|th)(\s[^>]*)?>/g, (match, tag, attrs = '') => {
    const map = tag === 'table' ? plan.tableStyles
      : tag === 'tr' ? plan.rowStyles
      : tag === 'td' || tag === 'th' ? plan.cellStyles
      : plan.paragraphStyles
    const idx = tag === 'table' ? tableIndex++
      : tag === 'tr' ? rowIndex++
      : tag === 'td' || tag === 'th' ? cellIndex++
      : paragraphIndex++
    const css = map.get(idx)
    return css ? mergeStyleIntoOpeningTag(match, css) : match
  })
}

function mergeStyleIntoOpeningTag(openingTag: string, css: string): string {
  if (!css) return openingTag
  if (/\sstyle=/.test(openingTag)) {
    return openingTag.replace(/\sstyle=(["'])(.*?)\1/, (_match, quote, existing) => {
      return ` style=${quote}${mergeCssDeclarations(existing, css)}${quote}`
    })
  }
  return openingTag.replace(/>$/, ` style="${css}">`)
}

function mergeCssDeclarations(existing: string, added: string): string {
  const normalized = existing.trim().replace(/;$/, '')
  if (!normalized) return added
  return `${normalized}; ${added}`
}

function cleanFontName(font: string | undefined): string | undefined {
  if (!font) return undefined

  const primaryName = font.split(',')[0]?.trim()
  if (!primaryName) return undefined

  const cleaned = primaryName
    .replace(/['"<>;{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned || /^(serif|sans-serif|monospace)$/i.test(cleaned)) return undefined
  if (!/^[A-Za-z0-9 ._()-]{1,80}$/.test(cleaned)) return undefined

  return cleaned
}

function cleanFontSize(fontSize: number | undefined): number | undefined {
  if (fontSize === undefined || !Number.isFinite(fontSize)) return undefined
  if (fontSize < 4 || fontSize > 96) return undefined

  return Math.round(fontSize * 2) / 2
}

function cleanSignedPointSize(value: number | undefined, maxAbs: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  if (Math.abs(value) > maxAbs) return undefined

  return Math.round(value * 100) / 100
}

function cleanHexColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const cleaned = color.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return undefined
  return `#${cleaned.toLowerCase()}`
}

function runStyleKey(spec: RunStyleSpec): string {
  return [
    spec.font ?? '',
    spec.fontSize ?? '',
    spec.color ?? '',
    spec.backgroundColor ?? '',
    spec.letterSpacing ?? '',
  ].join('|')
}

function cssForRunStyle(spec: RunStyleSpec): string {
  const declarations: string[] = []

  if (spec.font) {
    const fallback = /serif/i.test(spec.font) && !/sans/i.test(spec.font) ? 'serif' : 'sans-serif'
    declarations.push(`font-family:${spec.font}, Noto Sans Ethiopic, ${fallback}`)
  }
  if (spec.fontSize !== undefined) {
    declarations.push(`font-size:${spec.fontSize}pt`)
  }
  if (spec.color) {
    declarations.push(`color:${spec.color}`)
  }
  if (spec.backgroundColor) {
    declarations.push(`background-color:${spec.backgroundColor}`)
  }
  if (spec.letterSpacing !== undefined) {
    declarations.push(`letter-spacing:${spec.letterSpacing}pt`)
  }

  return declarations.join('; ')
}

function extractBlocks(xml: string, tagName: string): string[] {
  const tag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'g')) || []
}

function firstTag(xml: string, tagName: string): string | undefined {
  const tag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return xml.match(new RegExp(`<${tag}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`))?.[0]
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value || !/^-?[0-9]+$/.test(value)) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function roundCssNumber(value: number): string {
  return `${Math.round(value * 1000) / 1000}`
}

function cssSizeFromTableWidth(widthTag: string | undefined): string | undefined {
  if (!widthTag) return undefined

  const type = readAttr(widthTag, 'w:type')
  const rawValue = readAttr(widthTag, 'w:w')
  if (type === 'pct' && rawValue && /^[0-9.]+%$/.test(rawValue)) return rawValue

  const raw = parseInteger(rawValue)
  if (raw === undefined || raw < 0) return undefined

  if (type === 'pct') return `${roundCssNumber(raw / 50)}%`
  if (!type || type === 'dxa') return `${roundCssNumber(raw / 20)}pt`
  return undefined
}

function cssBorderFromWordBorder(borderXml: string | undefined): string | undefined {
  if (!borderXml) return undefined

  const val = readAttr(borderXml, 'w:val')
  if (!val || val === 'none' || val === 'nil') return '0'

  const size = parseInteger(readAttr(borderXml, 'w:sz'))
  const width = size === undefined ? 0.75 : Math.max(0.5, size / 8)
  const color = wordColorToCss(readAttr(borderXml, 'w:color')) || '#000000'
  const style = val === 'dashed' || val === 'dashSmallGap' ? 'dashed'
    : val === 'dotted' || val === 'dotDash' || val === 'dotDotDash' ? 'dotted'
    : val === 'double' ? 'double'
    : 'solid'

  return `${roundCssNumber(width)}pt ${style} ${color}`
}

function wordColorToCss(value: string | undefined): string | undefined {
  if (!value || value === 'auto' || value === 'none') return undefined
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`
  return highlightToCss(value)
}

function highlightToCss(value: string | undefined): string | undefined {
  switch (value) {
    case 'black': return '#000000'
    case 'blue': return '#0070c0'
    case 'cyan': return '#00ffff'
    case 'green': return '#92d050'
    case 'magenta': return '#ff00ff'
    case 'red': return '#ff0000'
    case 'yellow': return '#ffff00'
    case 'darkBlue': return '#002060'
    case 'darkCyan': return '#00b0f0'
    case 'darkGreen': return '#00b050'
    case 'darkMagenta': return '#7030a0'
    case 'darkRed': return '#c00000'
    case 'darkYellow': return '#ffc000'
    case 'lightGray': return '#d9d9d9'
    case 'darkGray': return '#808080'
    default: return undefined
  }
}

function readAttr(xml: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return xml.match(new RegExp(`\\b${escaped}="([^"]*)"`))?.[1]
}

function addAttrToOpeningTag(xml: string, name: string, value: string): string {
  const safeValue = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return xml.replace(/\/?>/, (end) => ` ${name}="${safeValue}"${end}`)
}
