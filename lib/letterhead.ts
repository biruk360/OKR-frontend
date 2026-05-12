/**
 * Letterhead constants for Eldix IT Technology PLC.
 *
 * Implements the Eldix Letterhead spec — see `docs/letterhead-spec.md` (or
 * the design package handoff bundle if archived elsewhere). The PDF renderer
 * (`lib/letter-pdf.tsx`) consumes this to compose the right-rail contact
 * block, the city stamp, and the brand block at the bottom of the rail.
 *
 * Logo files (drop replacements at the same paths to update):
 *   - public/branding/eldix-primary.png   — Eldix wordmark, 2052×620 transparent PNG
 *   - public/branding/360ground.png       — 360Ground square mark, 1000×1000 transparent PNG
 *
 * Both are detected lazily; if either is missing, the corresponding slot in
 * the PDF renders empty rather than crashing.
 */

import path from 'path'
import fs from 'fs'

export interface LetterheadInfo {
  legal: string
  legalAmharic?: string
  brand: string // "360Ground™"
  pobox: string
  city: string
  addressLines: string[]
  phones: string[]
  email: string
  web: string
  /** Absolute paths to logo files (or null if not yet uploaded). */
  eldixLogoPath: string | null
  groundLogoPath: string | null
}

function detectLogo(...rels: string[]): string | null {
  for (const rel of rels) {
    const abs = path.join(process.cwd(), rel)
    try {
      if (fs.statSync(abs).isFile()) return abs
    } catch {
      // try next candidate
    }
  }
  return null
}

let cached: LetterheadInfo | null = null

export function getLetterhead(): LetterheadInfo {
  if (cached) return cached
  cached = {
    legal: 'Eldix IT Technology PLC',
    legalAmharic: 'ኤልዲክስ አይቲ ቴክኖሎጂ ኃ.የተ.የግ.ማ.',
    brand: '360Ground™',
    pobox: 'P.O. Box 14417',
    city: 'Addis Ababa, Ethiopia',
    addressLines: [
      '7th Floor, REWINA Building',
      'Equatorial Guinea St.',
      '22 Bole Sub-City',
      'Addis Ababa, Ethiopia',
    ],
    phones: ['+251 940 794 444', '+251 911 343 797', '+251 911 257 276'],
    email: 'info@360ground.com',
    web: 'www.360ground.com',
    eldixLogoPath: detectLogo(
      'public/branding/eldix-primary.png',
      'public/branding/eldix-primary.jpg',
      'public/branding/letterhead-logo.png',
    ),
    groundLogoPath: detectLogo(
      'public/branding/360ground.png',
      'public/branding/360ground.jpg',
    ),
  }
  return cached
}

export function _clearLetterheadCache(): void {
  cached = null
}
