/**
 * Render a Letter to a PDF buffer using @react-pdf/renderer.
 *
 * Why server-side: spec FR-7 says generation must complete in under 5s for
 * 10-page letters and that the output is downloadable / printable. react-pdf
 * renders to a Buffer in Node so we can stream it as `application/pdf`.
 *
 * Why we don't render the HTML body verbatim: @react-pdf doesn't support
 * arbitrary HTML. The placeholder resolver in `lib/letters.ts` produces an
 * HTML string for the on-screen preview; here we strip tags to plain
 * paragraphs and keep simple line breaks. When designers ship real letterhead
 * templates we can map richer formatting to react-pdf primitives.
 */

import * as React from 'react'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { Letter, LetterEnclosure } from '@prisma/client'
import { LETTER_TYPE_LABEL, type LetterType } from '@/types'
import { resolvePlaceholders } from './letters'

interface RenderArgs {
  letter: Letter & {
    signatory: { name: string | null } | null
    enclosures: Pick<LetterEnclosure, 'fileName' | 'fileSize'>[]
  }
}

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Times-Roman', fontSize: 11, color: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#dddddd',
    marginBottom: 18,
  },
  company: { fontSize: 12, fontFamily: 'Times-Bold' },
  ref: { fontSize: 9, color: '#555' },
  subject: { fontSize: 14, fontFamily: 'Times-Bold', marginBottom: 16 },
  paragraph: { marginBottom: 8, lineHeight: 1.5 },
  signature: { marginTop: 24, fontFamily: 'Times-Bold' },
  enclosuresHeader: {
    marginTop: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
    fontSize: 10,
    fontFamily: 'Times-Bold',
    color: '#444',
    marginBottom: 6,
  },
  enclosureRow: { fontSize: 9, color: '#444', marginBottom: 2 },
  missing: { color: '#b91c1c', fontFamily: 'Times-Bold' },
})

// Strip HTML and split into paragraphs. Keep `[MISSING: ...]` markers as their
// own runs so we can style them red.
function htmlToParagraphs(html: string): Array<Array<{ text: string; missing?: boolean }>> {
  const cleaned = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/?strong>/gi, '')
    .replace(/<[^>]+>/g, '') // drop the rest
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
  return cleaned
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\n/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((para) => splitMissingMarkers(para))
}

function splitMissingMarkers(text: string): Array<{ text: string; missing?: boolean }> {
  const re = /\[MISSING:\s*([a-z_]+)\]/gi
  const runs: Array<{ text: string; missing?: boolean }> = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    runs.push({ text: m[0], missing: true })
    last = m.index + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length > 0 ? runs : [{ text }]
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export async function renderLetterPdf({ letter }: RenderArgs): Promise<{
  buffer: Buffer
  missing: string[]
}> {
  const { html, missing } = resolvePlaceholders(letter.bodyContent || '', {
    customerName: letter.customerName,
    date: letter.date,
    referenceNumber: letter.referenceNumber,
    signatoryName: letter.signatory?.name ?? null,
    senderDepartment: letter.senderDepartment,
    salutation: letter.salutation,
    closing: letter.closing,
  })
  const paragraphs = htmlToParagraphs(html)
  const typeLabel = LETTER_TYPE_LABEL[letter.letterType as LetterType] ?? letter.letterType

  const doc = (
    <Document title={letter.referenceNumber || letter.subject}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.company}>360Ground™ / Eldix IT Technology PLC</Text>
            <Text style={styles.ref}>{letter.referenceNumber ?? 'DRAFT'}</Text>
          </View>
          <View>
            <Text style={styles.ref}>{letter.date.toISOString().slice(0, 10)}</Text>
          </View>
        </View>

        <Text style={styles.subject}>
          {typeLabel}: {letter.subject}
        </Text>

        {paragraphs.map((runs, i) => (
          <Text key={i} style={styles.paragraph}>
            {runs.map((r, j) =>
              r.missing ? (
                <Text key={j} style={styles.missing}>{r.text}</Text>
              ) : (
                <Text key={j}>{r.text}</Text>
              )
            )}
          </Text>
        ))}

        {letter.signatory?.name && (
          <Text style={styles.signature}>{letter.signatory.name}</Text>
        )}
        {letter.senderDepartment && (
          <Text style={styles.paragraph}>{letter.senderDepartment}</Text>
        )}

        {letter.enclosures.length > 0 && (
          <>
            <Text style={styles.enclosuresHeader}>Enclosures</Text>
            {letter.enclosures.map((e, i) => (
              <Text key={i} style={styles.enclosureRow}>
                {i + 1}. {e.fileName} ({formatBytes(e.fileSize)})
              </Text>
            ))}
          </>
        )}
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return { buffer, missing }
}
