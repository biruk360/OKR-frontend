/**
 * Render a Letter to a PDF buffer using @react-pdf/renderer.
 *
 * Why server-side: spec FR-7 says generation must complete in under 5s for
 * 10-page letters and that the output is downloadable / printable.
 *
 * Why we parse HTML ourselves: @react-pdf doesn't render HTML. Tiptap's output
 * is reasonably constrained (paragraphs, headings, lists, tables, marks),
 * so a focused mini-parser produces a structured tree we can map to react-pdf
 * primitives. This is the price of WYSIWYG + native PDF output without bringing
 * in Chromium.
 *
 * Fonts: we register Noto Sans (Latin + extended) and Noto Sans Ethiopic
 * (Amharic) via Google Fonts. react-pdf fetches & caches the TTFs once per
 * process. This is what makes Unicode characters like ™, em-dash, and Ge'ez
 * glyphs render instead of crashing with "no glyph for code point".
 */

import * as React from 'react'
import path from 'path'
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { Letter, LetterEnclosure } from '@prisma/client'
import { LETTER_TYPE_LABEL, type LetterType } from '@/types'
import { resolvePlaceholders } from './letters'
import { getLetterhead } from './letterhead'

// --- Font registration (run once per process) ---
// We ship Noto Sans + Noto Sans Ethiopic TTFs in /public/fonts so the renderer
// has no network dependency at runtime. ~3.3 MB total, loaded once per process.
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
let fontsRegistered = false
function registerFontsOnce() {
  if (fontsRegistered) return
  try {
    Font.register({
      family: 'NotoSans',
      fonts: [
        { src: path.join(FONT_DIR, 'NotoSans-Regular.ttf') },
        { src: path.join(FONT_DIR, 'NotoSans-Bold.ttf'), fontWeight: 700 },
        { src: path.join(FONT_DIR, 'NotoSans-Italic.ttf'), fontStyle: 'italic' },
      ],
    })
    Font.register({
      family: 'NotoSansEthiopic',
      fonts: [
        { src: path.join(FONT_DIR, 'NotoSansEthiopic-Regular.ttf') },
        { src: path.join(FONT_DIR, 'NotoSansEthiopic-Bold.ttf'), fontWeight: 700 },
      ],
    })
    // Don't auto-hyphenate — looks bad in formal letters.
    Font.registerHyphenationCallback((word) => [word])
    fontsRegistered = true
  } catch (err) {
    console.warn('[letter-pdf] font registration failed; falling back to built-in', err)
  }
}

interface RenderArgs {
  letter: Letter & {
    signatory: { name: string | null } | null
    enclosures: Pick<LetterEnclosure, 'fileName' | 'fileSize'>[]
  }
  /** Render the letterhead's company name in Amharic when 'am'. Defaults to 'en'. */
  lang?: 'en' | 'am'
}

const styles = StyleSheet.create({
  // Smaller side padding so the letterhead band can run nearly full-width
  // while keeping the body comfortable.
  page: { paddingTop: 36, paddingHorizontal: 48, paddingBottom: 56, fontFamily: 'NotoSans', fontSize: 11, color: '#111', lineHeight: 1.55 },
  letterheadBand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
    marginBottom: 16,
  },
  letterheadLogo: { width: 64, height: 64, objectFit: 'contain' },
  letterheadCompany: { fontSize: 14, fontWeight: 700, color: '#0f172a' },
  letterheadTagline: { fontSize: 9, color: '#475569', marginTop: 1 },
  letterheadMeta: { fontSize: 9, color: '#475569', marginTop: 3 },
  letterheadRight: { textAlign: 'right', fontSize: 9, color: '#475569' },
  letterheadRightStrong: { textAlign: 'right', fontSize: 10, color: '#0f172a', fontWeight: 700 },
  ref: { fontSize: 9, color: '#555' },
  subject: { fontSize: 14, fontWeight: 700, marginBottom: 14 },
  paragraph: { marginBottom: 8 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 8, marginBottom: 6 },
  h3: { fontSize: 12, fontWeight: 700, marginTop: 6, marginBottom: 4 },
  listItem: { flexDirection: 'row', marginBottom: 2, paddingLeft: 8 },
  bullet: { width: 14, fontSize: 11 },
  listBody: { flex: 1 },
  blockquote: {
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#cbd5e1',
    color: '#475569',
    marginBottom: 8,
  },
  table: { marginBottom: 10, borderWidth: 1, borderColor: '#d1d5db' },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    flex: 1,
    padding: 5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 10,
  },
  tableHeaderCell: { backgroundColor: '#f8fafc', fontWeight: 700 },
  signature: { marginTop: 24, fontWeight: 700 },
  enclosuresHeader: {
    marginTop: 28,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
    fontSize: 10,
    fontWeight: 700,
    color: '#444',
    marginBottom: 4,
  },
  enclosureRow: { fontSize: 9, color: '#444', marginBottom: 2 },
  missing: { color: '#b91c1c', fontWeight: 700 },
})

// --- Tiny HTML parser tailored to Tiptap output ---
//
// Tiptap emits a small set of tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>,
// <strong>, <em>, <u>, <s>, <a>, <blockquote>, <table>, <tbody>, <tr>, <th>,
// <td>, <br/>. We tokenise into block nodes and inline runs.

type InlineRun = { text: string; bold?: boolean; italic?: boolean; missing?: boolean }
type Block =
  | { kind: 'p' | 'h2' | 'h3' | 'blockquote'; runs: InlineRun[] }
  | { kind: 'ul' | 'ol'; items: InlineRun[][] }
  | { kind: 'table'; rows: { cells: InlineRun[][]; header?: boolean }[] }

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&trade;': '™', '&copy;': '©', '&reg;': '®', '&ndash;': '–', '&mdash;': '—',
}
function decode(s: string): string {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
}

interface ParseState {
  bold: boolean
  italic: boolean
}

// Split inline content into runs. Recognises <strong>/<b>, <em>/<i>, <u>, <a>,
// [MISSING: x] placeholder markers, and <br/>.
function parseInline(html: string, state: ParseState = { bold: false, italic: false }): InlineRun[] {
  const out: InlineRun[] = []
  const re = /<\/?(strong|b|em|i|u|a|br)\b[^>]*>/gi
  let lastIdx = 0
  let cur = { ...state }
  let m: RegExpExecArray | null
  function pushText(t: string) {
    if (!t) return
    const decoded = decode(t).replace(/\s+/g, ' ')
    // Split out [MISSING:x] markers as their own runs so they style red.
    const parts = decoded.split(/(\[MISSING:\s*[a-z_]+\])/i)
    for (const p of parts) {
      if (!p) continue
      if (/^\[MISSING:/i.test(p)) {
        out.push({ text: p, missing: true })
      } else {
        out.push({ text: p, bold: cur.bold || undefined, italic: cur.italic || undefined })
      }
    }
  }
  while ((m = re.exec(html)) !== null) {
    pushText(html.slice(lastIdx, m.index))
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    if (tag === 'br') {
      out.push({ text: '\n' })
    } else if (tag === 'strong' || tag === 'b') {
      cur.bold = !closing
    } else if (tag === 'em' || tag === 'i') {
      cur.italic = !closing
    }
    // <u>, <a> have no equivalent styling in react-pdf without more setup; skip.
    lastIdx = m.index + m[0].length
  }
  pushText(html.slice(lastIdx))
  // Merge adjacent runs with the same style for cleaner output.
  const merged: InlineRun[] = []
  for (const r of out) {
    const top = merged[merged.length - 1]
    if (top && !top.missing && !r.missing && top.bold === r.bold && top.italic === r.italic) {
      top.text += r.text
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}

function parseListItems(html: string): InlineRun[][] {
  const out: InlineRun[][] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    out.push(parseInline(m[1]))
  }
  return out
}

function parseTable(html: string): Block | null {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const rows: { cells: InlineRun[][]; header?: boolean }[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html)) !== null) {
    const rowHtml = m[1]
    const cellRe = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
    const cells: InlineRun[][] = []
    let isHeaderRow = false
    let mm: RegExpExecArray | null
    while ((mm = cellRe.exec(rowHtml)) !== null) {
      if (mm[1].toLowerCase() === 'th') isHeaderRow = true
      // Cells may contain <p> wrapping — strip outer <p> tags.
      const inner = mm[2].replace(/^\s*<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '')
      cells.push(parseInline(inner))
    }
    if (cells.length > 0) rows.push({ cells, header: isHeaderRow })
  }
  return rows.length > 0 ? { kind: 'table', rows } : null
}

function parseBlocks(html: string): Block[] {
  const blocks: Block[] = []
  // Strip script/style noise then walk top-level blocks.
  const cleaned = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').trim()
  const blockRe = /<(p|h2|h3|ul|ol|blockquote|table)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(cleaned)) !== null) {
    // Loose text between blocks → fold into a paragraph.
    const before = cleaned.slice(lastIdx, m.index).trim()
    if (before) blocks.push({ kind: 'p', runs: parseInline(before) })

    const tag = m[1].toLowerCase()
    const inner = m[2]
    if (tag === 'p') {
      blocks.push({ kind: 'p', runs: parseInline(inner) })
    } else if (tag === 'h2') {
      blocks.push({ kind: 'h2', runs: parseInline(inner) })
    } else if (tag === 'h3') {
      blocks.push({ kind: 'h3', runs: parseInline(inner) })
    } else if (tag === 'ul' || tag === 'ol') {
      blocks.push({ kind: tag, items: parseListItems(inner) })
    } else if (tag === 'blockquote') {
      blocks.push({ kind: 'blockquote', runs: parseInline(inner) })
    } else if (tag === 'table') {
      const t = parseTable(inner)
      if (t) blocks.push(t)
    }
    lastIdx = m.index + m[0].length
  }
  const trailing = cleaned.slice(lastIdx).trim()
  if (trailing) blocks.push({ kind: 'p', runs: parseInline(trailing) })
  return blocks.filter((b) => {
    if ('runs' in b) return b.runs.some((r) => r.text.trim().length > 0)
    if ('items' in b) return b.items.length > 0
    return true
  })
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Render an array of inline runs inside a parent Text. Adjacent <Text> nodes
// inline into the same line, so this gives us bold/italic spans within a flow.
function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.missing) return <Text key={i} style={styles.missing}>{r.text}</Text>
        const style: any = {}
        if (r.bold) style.fontWeight = 700
        if (r.italic) style.fontStyle = 'italic'
        return <Text key={i} style={style}>{r.text}</Text>
      })}
    </>
  )
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <Text style={styles.paragraph}><Runs runs={block.runs} /></Text>
    case 'h2':
      return <Text style={styles.h2}><Runs runs={block.runs} /></Text>
    case 'h3':
      return <Text style={styles.h3}><Runs runs={block.runs} /></Text>
    case 'blockquote':
      return <View style={styles.blockquote}><Text><Runs runs={block.runs} /></Text></View>
    case 'ul':
      return (
        <View>
          {block.items.map((runs, i) => (
            <View key={i} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listBody}><Runs runs={runs} /></Text>
            </View>
          ))}
        </View>
      )
    case 'ol':
      return (
        <View>
          {block.items.map((runs, i) => (
            <View key={i} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>{i + 1}.</Text>
              <Text style={styles.listBody}><Runs runs={runs} /></Text>
            </View>
          ))}
        </View>
      )
    case 'table':
      return (
        <View style={styles.table} wrap={false}>
          {block.rows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              {row.cells.map((cell, j) => (
                <Text
                  key={j}
                  style={[styles.tableCell, row.header ? styles.tableHeaderCell : null].filter(Boolean) as any}
                >
                  <Runs runs={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      )
  }
}

export async function renderLetterPdf({ letter, lang = 'en' }: RenderArgs): Promise<{
  buffer: Buffer
  missing: string[]
}> {
  registerFontsOnce()
  const { html, missing } = resolvePlaceholders(letter.bodyContent || '', {
    customerName: letter.customerName,
    date: letter.date,
    referenceNumber: letter.referenceNumber,
    signatoryName: letter.signatory?.name ?? null,
    senderDepartment: letter.senderDepartment,
    salutation: letter.salutation,
    closing: letter.closing,
  })
  const blocks = parseBlocks(html)
  const typeLabel = LETTER_TYPE_LABEL[letter.letterType as LetterType] ?? letter.letterType

  // If the body has any Ge'ez characters, hint react-pdf to fall back to the
  // Ethiopic family for that page. react-pdf doesn't support inline font
  // switching, so the simplest robust path is per-page family selection.
  const hasEthiopic = /[ሀ-፿]/.test(html) || /[ሀ-፿]/.test(letter.subject)
  const bodyFamily = hasEthiopic ? 'NotoSansEthiopic' : 'NotoSans'

  const head = getLetterhead()
  const companyName = lang === 'am' && head.companyNameAmharic ? head.companyNameAmharic : head.companyName
  // When the company name is rendered in Amharic glyphs we need the Ethiopic
  // family on the header text run specifically.
  const headerCompanyFamily =
    /[ሀ-፿]/.test(companyName) ? 'NotoSansEthiopic' : bodyFamily

  const doc = (
    <Document title={letter.referenceNumber || letter.subject}>
      <Page size="A4" style={[styles.page, { fontFamily: bodyFamily }]}>
        {/* Letterhead band — logo (if uploaded) + company info on the left,
            reference number + date on the right. */}
        <View style={styles.letterheadBand} fixed>
          {head.logoPath && (
            <Image src={head.logoPath} style={styles.letterheadLogo} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.letterheadCompany, { fontFamily: headerCompanyFamily }]}>
              {companyName}
            </Text>
            {head.tagline && <Text style={styles.letterheadTagline}>{head.tagline}</Text>}
            {head.addressLines.length > 0 && (
              <Text style={styles.letterheadMeta}>
                {head.addressLines.join(' · ')}
              </Text>
            )}
            {(head.phone || head.email || head.website) && (
              <Text style={styles.letterheadMeta}>
                {[head.phone, head.email, head.website].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.letterheadRightStrong}>{letter.referenceNumber ?? 'DRAFT'}</Text>
            <Text style={styles.letterheadRight}>{letter.date.toISOString().slice(0, 10)}</Text>
          </View>
        </View>

        <Text style={styles.subject}>
          {typeLabel}: {letter.subject}
        </Text>

        {blocks.map((b, i) => <BlockNode key={i} block={b} />)}

        {letter.signatory?.name && (
          <Text style={styles.signature}>{letter.signatory.name}</Text>
        )}
        {letter.senderDepartment && (
          <Text style={styles.paragraph}>{letter.senderDepartment}</Text>
        )}

        {letter.enclosures.length > 0 && (
          <View>
            <Text style={styles.enclosuresHeader}>Enclosures</Text>
            {letter.enclosures.map((e, i) => (
              <Text key={i} style={styles.enclosureRow}>
                {i + 1}. {e.fileName} ({formatBytes(e.fileSize)})
              </Text>
            ))}
          </View>
        )}

        {/* Footer with page numbers — visible on every page via `fixed`. */}
        <Text
          style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#94a3b8' }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return { buffer, missing }
}
