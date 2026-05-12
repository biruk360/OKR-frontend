/**
 * Server-side PDF generation by feeding our HTML letter template into
 * headless Chromium via Puppeteer.
 *
 * Why this instead of @react-pdf:
 *   - The screen preview, browser print, and PDF download all consume the
 *     SAME HTML (lib/letter-html.tsx). What you see is exactly what prints.
 *   - Tables, page-break behavior, font rendering, and complex CSS work
 *     because we use a real browser engine — no parser limitations.
 *   - Amharic/Ge'ez glyphs render via the bundled @font-face rules instead
 *     of a hand-built font subset.
 *
 * Cost:
 *   - Chromium adds ~300MB to node_modules (auto-downloaded by Puppeteer)
 *   - First request after a cold start spins up Chromium (~1.5s); subsequent
 *     requests reuse the browser instance (~250ms per PDF).
 *
 * Lifecycle: we keep one browser instance per process and recycle it after
 * `MAX_PAGES` PDFs to avoid memory drift. On a fresh process, the first PDF
 * pays the launch cost; everyone else gets a warm pool.
 */

import type { Browser } from 'puppeteer'
import type { Letter, LetterEnclosure, LetterTypeDef } from '@prisma/client'
import { renderLetterHtml } from './letter-html'

let browserPromise: Promise<Browser> | null = null
let pagesRendered = 0
const MAX_PAGES = 200 // recycle the browser every 200 PDFs to bound memory

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise

  // Dynamic import — keeps Puppeteer out of the cold-start path for any
  // other API route. Only the PDF route pays the load cost.
  const puppeteer = await import('puppeteer')

  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      // The VPS runs as root; --no-sandbox is required because the user has
      // no SUID-helper. This is the same trade-off ERPNext / Frappe / every
      // headless-Chromium PDF service makes in container/server environments.
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Reduce memory pressure: disables a few subsystems we never use.
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  })
  return browserPromise
}

async function recycleIfNeeded() {
  if (pagesRendered < MAX_PAGES) return
  const b = browserPromise
  browserPromise = null
  pagesRendered = 0
  if (b) await (await b).close().catch(() => {})
}

export interface RenderToPdfArgs {
  letter: Letter & {
    signatory: { name: string | null } | null
    enclosures: Pick<LetterEnclosure, 'fileName' | 'fileSize'>[]
    letterTypeDef?: Pick<LetterTypeDef, 'id' | 'code' | 'name'> | null
  }
  lang?: 'en' | 'am'
  /** Absolute base URL so Puppeteer can fetch fonts/logos from /branding & /fonts. */
  origin: string
}

/**
 * Render a letter to a PDF buffer. Uses the same HTML the iframe preview
 * shows, so the printed output is identical.
 */
export async function renderLetterToPdf({
  letter,
  lang = 'en',
  origin,
}: RenderToPdfArgs): Promise<{ pdf: Buffer; missing: string[] }> {
  const { html, missing } = renderLetterHtml({ letter, lang, origin })
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    // setContent in Puppeteer v24 no longer accepts `networkidle0` —
    // wait for fonts + images manually so the PDF doesn't render with the
    // Times fallback.
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })
    await page.evaluate(async () => {
      // Wait for web fonts. Document.fonts.ready resolves when all loaded
      // @font-face rules have downloaded.
      if (document.fonts && document.fonts.ready) await document.fonts.ready
      // Wait for every <img> to finish (loaded or errored).
      const imgs = Array.from(document.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) =>
          (img as HTMLImageElement).complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener('load', () => res())
                img.addEventListener('error', () => res())
              })
        )
      )
    })
    // A4 was already declared via @page in the CSS; printBackground keeps
    // the letterhead band's hairline borders and any tinted cells.
    const pdfBuf = (await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      // Margins are controlled by the .pad inset in our CSS — let the page
      // hit edge-to-edge so the design matches the spec exactly.
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })) as unknown as Buffer
    pagesRendered++
    return { pdf: Buffer.from(pdfBuf), missing }
  } finally {
    await page.close().catch(() => {})
    await recycleIfNeeded()
  }
}
