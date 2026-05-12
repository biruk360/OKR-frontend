/**
 * Render a Letter to a PDF buffer using @react-pdf/renderer.
 *
 * Implements the Eldix Letterhead spec (handoff bundle: Letterhead Spec.md):
 *   - A4, monochrome (ink #0e0e0e, muted #8a8a86, rule #c4c4be)
 *   - Full-width header: Eldix wordmark + REFERENCE / DATE in mono
 *   - 2-column body: main content + 42mm right rail (contact + brand block)
 *   - Inter-class body font (we substitute Noto Sans, which is metrically
 *     compatible and already bundled — saves another TTF)
 *   - JetBrains Mono for ref/date/labels
 *   - Noto Sans Ethiopic for Amharic
 *
 * Why we parse Tiptap HTML ourselves: @react-pdf doesn't render HTML. The
 * mini-parser produces a structured block tree (paragraphs, headings, lists,
 * tables, blockquote, inline marks) that maps cleanly onto react-pdf primitives.
 *
 * Why externalize the package: webpack mangles react-pdf's class components
 * in production builds → "B.Component is not a constructor" at runtime. We
 * mark @react-pdf/* as serverComponentsExternalPackages in next.config.js so
 * Next leaves them as runtime require()s instead of bundling.
 */

import * as React from 'react'
import path from 'path'
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  Image,
  Svg,
  Rect,
  Circle,
  Polygon,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { Letter, LetterEnclosure } from '@prisma/client'
import { resolvePlaceholders } from './letters'
import { getLetterhead } from './letterhead'

// --- Font registration (run once per process) ---
//
// All TTFs live in /public/fonts. Three families:
//   Body         — NotoSans (Latin / Latin-Ext / general Unicode)
//   Mono         — JetBrainsMono (reference + date + labels)
//   Ethiopic     — NotoSansEthiopic (Amharic glyphs)
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
let fontsRegistered = false
function registerFontsOnce() {
  if (fontsRegistered) return
  try {
    Font.register({
      family: 'Body',
      fonts: [
        { src: path.join(FONT_DIR, 'NotoSans-Regular.ttf') },
        { src: path.join(FONT_DIR, 'NotoSans-Bold.ttf'), fontWeight: 700 },
        { src: path.join(FONT_DIR, 'NotoSans-Italic.ttf'), fontStyle: 'italic' },
      ],
    })
    Font.register({
      family: 'Mono',
      fonts: [
        { src: path.join(FONT_DIR, 'JetBrainsMono-Regular.ttf') },
        { src: path.join(FONT_DIR, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
      ],
    })
    Font.register({
      family: 'Ethiopic',
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
  /** Render the company-name + Amharic labels in Amharic when 'am'. */
  lang?: 'en' | 'am'
}

// ---------- Design tokens (Letterhead Spec §2) ----------

const INK = '#0e0e0e'
const INK_SOFT = '#2a2a2a'
const MUTED = '#8a8a86'
const RULE = '#c4c4be'

// react-pdf accepts `mm` and `pt` as string units on most props. Most numeric
// style values still need to be raw numbers (points), so where the spec lists
// `mm` I convert it: 1mm = 2.83465pt.
const mm = (n: number) => n * 2.83465

const styles = StyleSheet.create({
  // Page: no margins, content positioned via the "pad" View inset.
  page: {
    fontFamily: 'Body',
    fontSize: 10,
    color: INK,
    lineHeight: 1.5,
    backgroundColor: '#ffffff',
  },
  // The working area — spec §3: inset 12mm 10mm 14mm 14mm
  pad: {
    position: 'absolute',
    top: mm(12),
    right: mm(10),
    bottom: mm(14),
    left: mm(14),
    flexDirection: 'column',
  },

  // --- Header ---
  hdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: mm(4),
    marginBottom: mm(5),
  },
  hdrLogo: { height: mm(15), width: 'auto' },
  refdate: { flexDirection: 'row', gap: mm(8), alignItems: 'flex-start' },
  refdateLabel: {
    fontFamily: 'Mono',
    fontSize: 5.5,
    letterSpacing: 1.4, // ~0.18em at 5.5pt
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: 500,
    marginBottom: mm(1),
  },
  refdateVal: {
    fontFamily: 'Mono',
    fontSize: 8.5,
    color: INK,
    fontWeight: 500,
  },

  // --- Body grid ---
  bodyGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: mm(6),
  },
  main: { flex: 1, flexDirection: 'column', paddingRight: mm(2) },
  rail: {
    width: mm(42),
    borderLeftWidth: 1,
    borderLeftColor: RULE,
    paddingLeft: mm(5),
    flexDirection: 'column',
  },

  // --- Main content ---
  body: {
    color: INK_SOFT,
    fontSize: 10,
    lineHeight: 1.55,
  },
  toRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: mm(5),
  },
  toLabel: {
    fontFamily: 'Ethiopic',
    fontSize: 9.5,
    color: MUTED,
    fontWeight: 500,
    marginRight: mm(3),
  },
  toName: { fontWeight: 700, color: INK, fontSize: 10 },
  subjectRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: mm(4) },
  subjectLabel: {
    fontFamily: 'Ethiopic',
    fontSize: 10,
    color: MUTED,
    fontWeight: 500,
    marginRight: mm(3),
  },
  subjectText: {
    fontFamily: 'Ethiopic',
    fontSize: 11,
    fontWeight: 700,
    color: INK,
    textDecoration: 'underline',
  },

  paragraph: { marginBottom: mm(2.5) },
  bold: { fontWeight: 700 },
  italic: { fontStyle: 'italic' },
  h2: { fontSize: 12, fontWeight: 700, marginTop: mm(2), marginBottom: mm(2), color: INK },
  h3: { fontSize: 11, fontWeight: 700, marginTop: mm(2), marginBottom: mm(1.5), color: INK },
  listItem: { flexDirection: 'row', marginBottom: mm(0.7), paddingLeft: mm(2) },
  bullet: { width: mm(4), fontSize: 10, color: INK_SOFT },
  listBody: { flex: 1 },
  blockquote: {
    paddingLeft: mm(3),
    borderLeftWidth: 1,
    borderLeftColor: RULE,
    color: MUTED,
    marginBottom: mm(2.5),
  },
  table: { marginBottom: mm(3), borderWidth: 1, borderColor: RULE },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    flex: 1,
    padding: mm(1.5),
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: RULE,
    fontSize: 9,
  },
  tableHeaderCell: { backgroundColor: '#fafaf7', fontWeight: 700 },

  // --- Signature ---
  sig: { marginTop: mm(7) },
  sigClosing: { marginBottom: mm(3), color: INK_SOFT },
  sigLine: {
    width: mm(50),
    height: mm(11),
    borderBottomWidth: 1,
    borderBottomColor: INK,
    marginBottom: mm(1.5),
  },
  sigName: { fontWeight: 700, color: INK, fontSize: 10 },
  sigTitle: { fontSize: 8.5, color: MUTED },

  // --- Page number ---
  pageNum: {
    marginTop: 'auto',
    paddingTop: mm(6),
    textAlign: 'right',
    fontFamily: 'Mono',
    fontSize: 6,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: MUTED,
  },

  // --- Rail sections ---
  railSection: { marginBottom: mm(5) },
  railLabel: {
    fontFamily: 'Mono',
    fontSize: 5.5,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: 500,
    marginBottom: mm(1),
  },
  railVal: { fontSize: 7, lineHeight: 1.55, color: INK_SOFT },
  railSpacer: { flex: 1 },
  brand: {
    paddingTop: mm(8),
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: mm(3),
  },
  brandEldix: { height: mm(9), width: 'auto' },
  brandGround: { height: mm(13), width: 'auto', opacity: 0.92 },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mm(2),
    marginTop: mm(3),
  },
  stampText: {
    fontFamily: 'Mono',
    fontSize: 5.5,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: MUTED,
    fontWeight: 500,
  },

  // --- Enclosures (appended below body if any) ---
  enclosuresHeader: {
    marginTop: mm(8),
    paddingTop: mm(3),
    borderTopWidth: 1,
    borderTopColor: RULE,
    fontSize: 9,
    fontWeight: 700,
    color: INK_SOFT,
    marginBottom: mm(1.5),
  },
  enclosureRow: { fontSize: 8, color: MUTED, marginBottom: mm(0.7) },
})

// ---------- Inline HTML parser (kept from previous renderer) ----------

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

interface ParseState { bold: boolean; italic: boolean }

function parseInline(html: string, state: ParseState = { bold: false, italic: false }): InlineRun[] {
  const out: InlineRun[] = []
  const re = /<\/?(strong|b|em|i|u|a|br)\b[^>]*>/gi
  let lastIdx = 0
  let cur = { ...state }
  let m: RegExpExecArray | null
  function pushText(t: string) {
    if (!t) return
    const decoded = decode(t).replace(/\s+/g, ' ')
    const parts = decoded.split(/(\[MISSING:\s*[a-z_]+\])/i)
    for (const p of parts) {
      if (!p) continue
      if (/^\[MISSING:/i.test(p)) out.push({ text: p, missing: true })
      else out.push({ text: p, bold: cur.bold || undefined, italic: cur.italic || undefined })
    }
  }
  while ((m = re.exec(html)) !== null) {
    pushText(html.slice(lastIdx, m.index))
    const tag = m[1].toLowerCase()
    const closing = m[0].startsWith('</')
    if (tag === 'br') out.push({ text: '\n' })
    else if (tag === 'strong' || tag === 'b') cur.bold = !closing
    else if (tag === 'em' || tag === 'i') cur.italic = !closing
    lastIdx = m.index + m[0].length
  }
  pushText(html.slice(lastIdx))
  const merged: InlineRun[] = []
  for (const r of out) {
    const top = merged[merged.length - 1]
    if (top && !top.missing && !r.missing && top.bold === r.bold && top.italic === r.italic) top.text += r.text
    else merged.push({ ...r })
  }
  return merged
}

function parseListItems(html: string): InlineRun[][] {
  const out: InlineRun[][] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(parseInline(m[1]))
  return out
}

function parseTable(html: string): Block | null {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const rows: { cells: InlineRun[][]; header?: boolean }[] = []
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html)) !== null) {
    const cellRe = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi
    const cells: InlineRun[][] = []
    let isHeader = false
    let mm: RegExpExecArray | null
    while ((mm = cellRe.exec(m[1])) !== null) {
      if (mm[1].toLowerCase() === 'th') isHeader = true
      const inner = mm[2].replace(/^\s*<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '')
      cells.push(parseInline(inner))
    }
    if (cells.length > 0) rows.push({ cells, header: isHeader })
  }
  return rows.length > 0 ? { kind: 'table', rows } : null
}

function parseBlocks(html: string): Block[] {
  const cleaned = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').trim()
  const blocks: Block[] = []
  const blockRe = /<(p|h2|h3|ul|ol|blockquote|table)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(cleaned)) !== null) {
    const before = cleaned.slice(lastIdx, m.index).trim()
    if (before) blocks.push({ kind: 'p', runs: parseInline(before) })
    const tag = m[1].toLowerCase()
    const inner = m[2]
    if (tag === 'p') blocks.push({ kind: 'p', runs: parseInline(inner) })
    else if (tag === 'h2') blocks.push({ kind: 'h2', runs: parseInline(inner) })
    else if (tag === 'h3') blocks.push({ kind: 'h3', runs: parseInline(inner) })
    else if (tag === 'ul' || tag === 'ol') blocks.push({ kind: tag, items: parseListItems(inner) })
    else if (tag === 'blockquote') blocks.push({ kind: 'blockquote', runs: parseInline(inner) })
    else if (tag === 'table') { const t = parseTable(inner); if (t) blocks.push(t) }
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

/** Spec §11: date format MMM dd, yyyy — e.g. "Jan 02, 2026". */
function formatDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day = String(d.getDate()).padStart(2, '0')
  return `${months[d.getMonth()]} ${day}, ${d.getFullYear()}`
}

// ---------- Block rendering ----------

function Runs({ runs }: { runs: InlineRun[] }) {
  // Filter out empty-text runs defensively — even though parseInline tries
  // hard not to emit them, an empty string child inside a Text node trips
  // react-pdf's reconciler with "Invalid '' string child outside <Text>" and
  // can put the renderer into a non-terminating retry loop that OOMs the
  // whole Node process (see the 502 incident on 2026-05-12).
  const cleaned = runs.filter((r) => r.text && r.text.length > 0)
  if (cleaned.length === 0) {
    // Never return an empty fragment inside a Text — give react-pdf a single
    // non-empty rune to anchor against.
    return <Text> </Text>
  }
  return (
    <>
      {cleaned.map((r, i) => {
        if (r.missing) return <Text key={i} style={{ color: '#b91c1c', fontWeight: 700 }}>{r.text}</Text>
        const s: any = {}
        if (r.bold) s.fontWeight = 700
        if (r.italic) s.fontStyle = 'italic'
        return <Text key={i} style={s}>{r.text}</Text>
      })}
    </>
  )
}

function BlockNode({ block, ethiopic }: { block: Block; ethiopic: boolean }) {
  const family = ethiopic ? 'Ethiopic' : 'Body'
  switch (block.kind) {
    case 'p':
      return <Text style={[styles.paragraph, { fontFamily: family }]}><Runs runs={block.runs} /></Text>
    case 'h2':
      return <Text style={[styles.h2, { fontFamily: family }]}><Runs runs={block.runs} /></Text>
    case 'h3':
      return <Text style={[styles.h3, { fontFamily: family }]}><Runs runs={block.runs} /></Text>
    case 'blockquote':
      return <View style={styles.blockquote}><Text style={{ fontFamily: family }}><Runs runs={block.runs} /></Text></View>
    case 'ul':
      return (
        <View>
          {block.items.map((runs, i) => (
            <View key={i} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.listBody, { fontFamily: family }]}><Runs runs={runs} /></Text>
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
              <Text style={[styles.listBody, { fontFamily: family }]}><Runs runs={runs} /></Text>
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
                  style={[styles.tableCell, row.header ? styles.tableHeaderCell : null, { fontFamily: family }].filter(Boolean) as any}
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

// ---------- Ethiopian flag SVG (spec §6) ----------

function EthiopianFlag() {
  return (
    <Svg width={mm(5)} height={mm(2.5)} viewBox="0 0 60 30">
      <Rect width={60} height={10} fill="#078930" />
      <Rect y={10} width={60} height={10} fill="#FCDD09" />
      <Rect y={20} width={60} height={10} fill="#DA121A" />
      <Circle cx={30} cy={15} r={5.5} fill="#0F47AF" />
      <Polygon
        points="30,11 30.94,13.71 33.80,13.76 31.52,15.49 32.35,18.24 30,16.6 27.65,18.24 28.48,15.49 26.20,13.76 29.06,13.71"
        fill="#FCDD09"
      />
    </Svg>
  )
}

// ---------- Main renderer ----------

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
  const head = getLetterhead()

  // Decide whether the body needs the Ethiopic font family. If any Ge'ez
  // codepoint shows up anywhere in the body or subject, use Ethiopic for
  // all body runs (mixing inline is fragile with react-pdf).
  const hasEthiopic = /[ሀ-፿]/.test(html) || /[ሀ-፿]/.test(letter.subject)

  // The subject heading is always rendered in Ethiopic (matches the spec's
  // "ጉዳዩ" label). For pure-Latin subjects we still use the same font; Noto
  // Sans Ethiopic includes Latin glyphs.
  const subjectText = letter.subject

  const doc = (
    <Document title={letter.referenceNumber || letter.subject}>
      <Page size="A4" style={styles.page}>
        <View style={styles.pad}>

          {/* --- Header --- */}
          <View style={styles.hdr} fixed>
            {head.eldixLogoPath ? (
              <Image src={head.eldixLogoPath} style={styles.hdrLogo} />
            ) : (
              // Text fallback: company name as the wordmark
              <Text style={{ fontSize: 14, fontWeight: 700, color: INK, letterSpacing: 2 }}>
                ELDIX
              </Text>
            )}
            <View style={styles.refdate}>
              <View>
                <Text style={styles.refdateLabel}>REFERENCE</Text>
                <Text style={styles.refdateVal}>{letter.referenceNumber || 'DRAFT'}</Text>
              </View>
              <View>
                <Text style={styles.refdateLabel}>DATE</Text>
                <Text style={styles.refdateVal}>{formatDate(letter.date)}</Text>
              </View>
            </View>
          </View>

          {/* --- Body grid --- */}
          <View style={styles.bodyGrid}>

            {/* MAIN column */}
            <View style={styles.main}>
              <View style={styles.body}>
                {/* To line — `&&` would leak '' to the View when customerName
                    is an empty string, which crashes react-pdf with "Invalid
                    '' string child outside <Text> component". Use a strict
                    ternary returning null instead. */}
                {letter.customerName ? (
                  <View style={styles.toRow}>
                    <Text style={styles.toLabel}>ለ</Text>
                    <Text style={styles.toName}>{letter.customerName}</Text>
                  </View>
                ) : null}

                {/* Subject heading — guard against empty subject; an empty
                    Text child also trips react-pdf's reconciler. */}
                <View style={styles.subjectRow}>
                  <Text style={styles.subjectLabel}>ጉዳዩ</Text>
                  <Text style={styles.subjectText}>{subjectText || ' '}</Text>
                </View>

                {/* Paragraph blocks from the body editor */}
                {blocks.map((b, i) => (
                  <BlockNode key={i} block={b} ethiopic={hasEthiopic} />
                ))}

                {/* Signature */}
                {letter.signatory?.name ? (
                  <View style={styles.sig}>
                    <Text style={styles.sigClosing}>Sincerely,</Text>
                    <View style={styles.sigLine} />
                    <Text style={styles.sigName}>{letter.signatory.name}</Text>
                    {letter.senderDepartment ? (
                      <Text style={styles.sigTitle}>{letter.senderDepartment}</Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Enclosures appended below the signature if any */}
                {letter.enclosures.length > 0 ? (
                  <View>
                    <Text style={styles.enclosuresHeader}>Enclosures</Text>
                    {letter.enclosures.map((e, i) => (
                      <Text key={i} style={styles.enclosureRow}>
                        {i + 1}. {e.fileName} ({formatBytes(e.fileSize)})
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Page number, pushed to the bottom of the main column */}
              <Text
                style={styles.pageNum}
                render={({ pageNumber, totalPages }) =>
                  `PAGE ${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`
                }
                fixed
              />
            </View>

            {/* RAIL */}
            <View style={styles.rail}>
              <View style={styles.railSection}>
                <Text style={styles.railLabel}>ADDRESS</Text>
                <View style={styles.railVal}>
                  {head.addressLines.map((l, i) => (
                    <Text key={i}>{l}</Text>
                  ))}
                </View>
              </View>
              <View style={styles.railSection}>
                <Text style={styles.railLabel}>TELEPHONE</Text>
                <View style={styles.railVal}>
                  {head.phones.map((p, i) => (
                    <Text key={i}>{p}</Text>
                  ))}
                </View>
              </View>
              <View style={styles.railSection}>
                <Text style={styles.railLabel}>EMAIL · WEB</Text>
                <View style={styles.railVal}>
                  <Text>{head.email}</Text>
                  <Text>{head.web}</Text>
                </View>
              </View>
              <View style={styles.railSection}>
                <Text style={styles.railLabel}>MAILING</Text>
                <View style={styles.railVal}>
                  <Text>{head.pobox}</Text>
                  <Text>{head.city}</Text>
                </View>
              </View>

              <View style={styles.railSpacer} />

              {/* Brand block at the bottom of the rail */}
              <View style={styles.brand}>
                {head.eldixLogoPath ? (
                  <Image src={head.eldixLogoPath} style={styles.brandEldix} />
                ) : null}
                {head.groundLogoPath ? (
                  <Image src={head.groundLogoPath} style={styles.brandGround} />
                ) : null}
                <View style={styles.stamp}>
                  <Text style={styles.stampText}>Addis Ababa · Ethiopia</Text>
                  <EthiopianFlag />
                </View>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return { buffer, missing }
}

// `lang` is currently unused inside the renderer — the spec is bilingual by
// virtue of the Amharic labels (ለ, ጉዳዩ) being baked in. Keep the prop in
// place so existing callers don't have to change.
export type { RenderArgs }
