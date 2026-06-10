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
 * Scope: only what the letter templates actually use — paragraphs, inline
 * <strong>/<em>/<u>, <br/>, basic <ul>/<ol>/<li>, and `{{placeholder}}`
 * tokens left intact for downstream resolution.
 */

import { Document, Packer, Paragraph, TextRun } from 'docx'
import { DEFAULT_LETTER_DOCUMENT_FONT } from './letter-docx-font'

interface InlineRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'", '&mdash;': '—', '&ndash;': '–',
}
function decode(s: string): string {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

function parseInline(html: string): InlineRun[] {
  const runs: InlineRun[] = []
  const tagRe = /<\/?(strong|b|em|i|u|br)\b[^>]*>/gi
  const state = { bold: false, italic: false, underline: false }
  let lastIdx = 0
  let m: RegExpExecArray | null
  function flushText(t: string) {
    if (!t) return
    const text = decode(t).replace(/\s+/g, ' ')
    if (text) runs.push({ text, ...(state.bold && { bold: true }), ...(state.italic && { italic: true }), ...(state.underline && { underline: true }) })
  }
  while ((m = tagRe.exec(html)) !== null) {
    flushText(html.slice(lastIdx, m.index))
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    if (tag === 'br') runs.push({ text: '\n' })
    else if (tag === 'strong' || tag === 'b') state.bold = !closing
    else if (tag === 'em' || tag === 'i') state.italic = !closing
    else if (tag === 'u') state.underline = !closing
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
      })
    )
  }
  return out
}

function parseBlocks(html: string): Paragraph[] {
  // Strip whitespace-only nodes between blocks, and strip the list-container
  // wrappers (<ul>/<ol>) — their <li> children are matched on their own and
  // become bulleted paragraphs.
  const cleaned = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, '')
    .trim()
  const paragraphs: Paragraph[] = []
  const blockRe = /<(p|h1|h2|h3|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let lastIdx = 0
  let m: RegExpExecArray | null

  while ((m = blockRe.exec(cleaned)) !== null) {
    const between = cleaned.slice(lastIdx, m.index).trim()
    if (between) {
      paragraphs.push(new Paragraph({ children: runsToTextRuns(parseInline(between)) }))
    }
    const tag = m[1].toLowerCase()
    const inner = m[2]
    const runs = runsToTextRuns(parseInline(inner))
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      paragraphs.push(
        new Paragraph({
          heading: (tag === 'h1' ? 'Heading1' : tag === 'h2' ? 'Heading2' : 'Heading3') as any,
          children: runs,
        })
      )
    } else if (tag === 'li') {
      paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: runs }))
    } else {
      paragraphs.push(new Paragraph({ children: runs }))
    }
    lastIdx = m.index + m[0].length
  }
  const trailing = cleaned.slice(lastIdx).trim()
  if (trailing) {
    paragraphs.push(new Paragraph({ children: runsToTextRuns(parseInline(trailing)) }))
  }
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun('')] }))
  }
  return paragraphs
}

/**
 * Convert template-style HTML to a real OOXML .docx buffer.
 * Mammoth round-trips this cleanly; SuperDoc loads it as a normal document.
 */
export async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  const paragraphs = parseBlocks(html || '')
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_LETTER_DOCUMENT_FONT },
        },
      },
    },
    sections: [{ properties: {}, children: paragraphs }],
  })
  return Packer.toBuffer(doc)
}
