import JSZip from 'jszip'

type MammothModule = typeof import('mammoth') & {
  transforms: {
    run: (transformRun: (run: any) => any) => (element: any) => any
  }
}

interface RunStyleSpec {
  font?: string
  fontSize?: number
}

interface ConversionPlan {
  alignMap: Map<number, string>
  runStyleIds: Map<string, string>
  styleMap: string[]
}

const RUN_STYLE_ID_PREFIX = 'letter-run-style-'

/**
 * Convert the saved DOCX body into the HTML mirror used by placeholder
 * resolution, PDF preview, and print.
 *
 * Mammoth intentionally drops direct visual details such as run font family
 * and font size. The letter editor is a WYSIWYG body editor, so we preserve
 * those specific run properties by mapping DOCX runs to inline spans during
 * Mammoth conversion.
 */
export async function convertLetterDocxToHtml(buffer: Buffer): Promise<{
  html: string
  messages: unknown
}> {
  const { buffer: mammothBuffer, docXml } = await prepareBufferForMammoth(buffer)
  const plan = buildConversionPlan(docXml)
  const mammoth = (await import('mammoth')) as unknown as MammothModule

  const result = await mammoth.convertToHtml(
    { buffer: mammothBuffer },
    {
      styleMap: plan.styleMap,
      transformDocument: mammoth.transforms.run((run: any) => {
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
    html: applyParagraphAlignment(result.value, plan.alignMap),
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
  const specs = collectRunStyleSpecs(docXml)
  const runStyleIds = new Map<string, string>()
  const styleMap: string[] = []

  let idx = 0
  for (const spec of specs) {
    const key = runStyleKey(spec)
    const styleId = `${RUN_STYLE_ID_PREFIX}${idx++}`
    runStyleIds.set(key, styleId)
    styleMap.push(`r.${styleId} => span[style='${cssForRunStyle(spec)}']`)
  }

  return {
    alignMap: extractParagraphAlignments(docXml),
    runStyleIds,
    styleMap,
  }
}

function collectRunStyleSpecs(docXml: string): RunStyleSpec[] {
  const specsByKey = new Map<string, RunStyleSpec>()
  const runs = docXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || []

  for (const run of runs) {
    const runProperties = run.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0]
    if (!runProperties) continue

    const spec = normalizeRunStyleSpec({
      font: extractRunFont(runProperties),
      fontSize: extractRunFontSize(runProperties),
    })
    if (!spec) continue

    specsByKey.set(runStyleKey(spec), spec)
  }

  return Array.from(specsByKey.values())
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
  if (!font && fontSize === undefined) return null

  return {
    ...(font ? { font } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
  }
}

function extractParagraphAlignments(docXml: string): Map<number, string> {
  const alignMap = new Map<number, string>()
  const paragraphs = docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []

  paragraphs.forEach((block, idx) => {
    const val = block.match(/<w:jc[^>]+w:val="([^"]+)"/)?.[1]
    const css = val === 'both' || val === 'distribute' ? 'justify'
      : val === 'center' ? 'center'
      : val === 'right' || val === 'end' ? 'right'
      : null
    if (css) alignMap.set(idx, css)
  })

  return alignMap
}

function applyParagraphAlignment(html: string, alignMap: Map<number, string>): string {
  if (alignMap.size === 0) return html

  let paragraphIndex = 0
  return html.replace(/<p(\s[^>]*)?>/g, (match: string, attrs: string) => {
    const align = alignMap.get(paragraphIndex++)
    if (!align) return match

    if (attrs && /\bstyle=/.test(attrs)) {
      return `<p${attrs.replace(/style="([^"]*)"/, `style="$1; text-align:${align}"`)}>`
    }
    return `<p${attrs || ''} style="text-align:${align}">`
  })
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

function runStyleKey(spec: RunStyleSpec): string {
  return `${spec.font ?? ''}|${spec.fontSize ?? ''}`
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

  return declarations.join('; ')
}

function readAttr(xml: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return xml.match(new RegExp(`\\b${escaped}="([^"]*)"`))?.[1]
}

function addAttrToOpeningTag(xml: string, name: string, value: string): string {
  const safeValue = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return xml.replace(/\/?>/, (end) => ` ${name}="${safeValue}"${end}`)
}
