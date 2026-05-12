/**
 * Produce a minimal valid .docx for letters that haven't been saved through
 * SuperDoc yet — keeps the editor happy on first open by giving it real
 * OOXML rather than HTML to parse.
 *
 * Cached per process: the empty template is identical for every letter, so
 * we render once and reuse the buffer.
 */

import { Document, Packer, Paragraph, TextRun } from 'docx'

let cached: Buffer | null = null

export async function emptyDocxBuffer(): Promise<Buffer> {
  if (cached) return cached
  const doc = new Document({
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
