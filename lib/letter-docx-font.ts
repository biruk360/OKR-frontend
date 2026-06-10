import JSZip from 'jszip'

export const DEFAULT_LETTER_DOCUMENT_FONT = 'Noto Sans Ethiopic'

const RUN_FONTS = `<w:rFonts w:ascii="${DEFAULT_LETTER_DOCUMENT_FONT}" w:hAnsi="${DEFAULT_LETTER_DOCUMENT_FONT}" w:eastAsia="${DEFAULT_LETTER_DOCUMENT_FONT}" w:cs="${DEFAULT_LETTER_DOCUMENT_FONT}"/>`

function upsertRunFonts(container: string): string {
  const runProperties = container.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0]
  if (runProperties) {
    const updatedRunProperties = /<w:rFonts(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:rFonts>)/.test(runProperties)
      ? runProperties.replace(/<w:rFonts(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:rFonts>)/, RUN_FONTS)
      : runProperties.replace(/<w:rPr(?:\s[^>]*)?>/, (open) => `${open}${RUN_FONTS}`)
    return container.replace(runProperties, updatedRunProperties)
  }

  if (/<w:rPr(?:\s[^>]*)?\/>/.test(container)) {
    return container.replace(/<w:rPr(?:\s[^>]*)?\/>/, `<w:rPr>${RUN_FONTS}</w:rPr>`)
  }

  return container.replace(/(<\/w:[^>]+>)$/, `<w:rPr>${RUN_FONTS}</w:rPr>$1`)
}

function setDocumentDefaultFont(stylesXml: string): string {
  let updated = stylesXml
  const runDefaults = updated.match(/<w:rPrDefault(?:\s[^>]*)?>[\s\S]*?<\/w:rPrDefault>/)?.[0]

  if (runDefaults) {
    updated = updated.replace(runDefaults, upsertRunFonts(runDefaults))
  } else if (/<w:rPrDefault(?:\s[^>]*)?\/>/.test(updated)) {
    updated = updated.replace(
      /<w:rPrDefault(?:\s[^>]*)?\/>/,
      `<w:rPrDefault><w:rPr>${RUN_FONTS}</w:rPr></w:rPrDefault>`,
    )
  } else if (/<w:docDefaults(?:\s[^>]*)?>/.test(updated)) {
    updated = updated.replace(
      /<w:docDefaults(?:\s[^>]*)?>/,
      (open) => `${open}<w:rPrDefault><w:rPr>${RUN_FONTS}</w:rPr></w:rPrDefault>`,
    )
  } else {
    updated = updated.replace(
      /<w:styles(?:\s[^>]*)?>/,
      (open) => `${open}<w:docDefaults><w:rPrDefault><w:rPr>${RUN_FONTS}</w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>`,
    )
  }

  return updated.replace(
    /<w:style(?:\s[^>]*)?>[\s\S]*?<\/w:style>/g,
    (style) => /\bw:styleId=(["'])Normal\1/.test(style) ? upsertRunFonts(style) : style,
  )
}

/**
 * Make Noto Sans Ethiopic the default for existing DOCX letters without
 * changing runs that already have an explicit font.
 */
export async function ensureLetterDocumentDefaultFont(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const stylesFile = zip.file('word/styles.xml')
  if (!stylesFile) return buffer

  const stylesXml = await stylesFile.async('string')
  const updatedStylesXml = setDocumentDefaultFont(stylesXml)
  if (updatedStylesXml === stylesXml) return buffer

  zip.file('word/styles.xml', updatedStylesXml)
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
