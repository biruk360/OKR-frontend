/**
 * Produce a minimal valid .docx for letters that haven't been saved through
 * SuperDoc yet — keeps the editor happy on first open by giving it real
 * OOXML rather than HTML to parse.
 *
 * Cached per process: the empty template is identical for every letter, so
 * we render once and reuse the buffer.
 */

import { Document, Packer, Paragraph, TextRun } from 'docx'
import { DEFAULT_LETTER_DOCUMENT_FONT } from './letter-docx-font'

let cached: Buffer | null = null

export async function emptyDocxBuffer(): Promise<Buffer> {
  if (cached) return cached
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_LETTER_DOCUMENT_FONT },
        },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ children: [new TextRun('')] }),
        ],
      },
    ],
  })
  cached = await Packer.toBuffer(doc)
  return cached
}
