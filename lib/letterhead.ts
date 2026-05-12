/**
 * Letterhead constants for Eldix IT Technology PLC.
 *
 * These render at the top of every Letter PDF (FR-7 / FR-8). Update this file
 * when contact info changes — there's no admin UI for letterhead settings yet
 * (deferred to a Letter Settings page in a future pass).
 *
 * Logo: drop a square PNG or JPG at `public/branding/letterhead-logo.png`.
 * The PDF renderer detects the file at process start; if it's missing, the
 * letterhead degrades to text-only without crashing.
 */

import path from 'path'
import fs from 'fs'

export interface LetterheadInfo {
  companyName: string
  companyNameAmharic?: string
  tagline?: string
  /** Each address line shown stacked under the company name. */
  addressLines: string[]
  phone?: string
  email?: string
  website?: string
  /** Absolute file path to the logo if it exists, otherwise null. */
  logoPath: string | null
}

const LOGO_CANDIDATES = [
  'public/branding/letterhead-logo.png',
  'public/branding/letterhead-logo.jpg',
  'public/branding/letterhead-logo.jpeg',
]

function detectLogo(): string | null {
  for (const rel of LOGO_CANDIDATES) {
    const abs = path.join(process.cwd(), rel)
    try {
      if (fs.statSync(abs).isFile()) return abs
    } catch {
      // ENOENT — try the next candidate
    }
  }
  return null
}

// Cached at module load — the logo file changes only at deploy time.
let cached: LetterheadInfo | null = null

export function getLetterhead(): LetterheadInfo {
  if (cached) return cached
  cached = {
    companyName: 'Eldix IT Technology PLC',
    companyNameAmharic: 'ኤልዲክስ አይቲ ቴክኖሎጂ ኃ.የተ.የግ.ማ.',
    tagline: '360Ground™ — Internal Platform',
    addressLines: [
      'Addis Ababa, Ethiopia',
    ],
    phone: '+251 11 000 0000',
    email: 'info@360ground.com',
    website: 'https://360ground.com',
    logoPath: detectLogo(),
  }
  return cached
}

/** Test-only — let unit tests / probe scripts reset the cache. */
export function _clearLetterheadCache(): void {
  cached = null
}
