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
  /** Google Font family name to use for the letter body. */
  font?: string
  /** Absolute base URL so Puppeteer can fetch fonts/logos from /branding & /fonts. */
  origin: string
}

export interface RenderHtmlToPdfArgs {
  html: string
  format?: 'A4' | 'Letter'
  landscape?: boolean
}

export interface RenderHtmlToPngArgs {
  html: string
  width?: number
  height?: number
}

/** Render arbitrary trusted HTML to PDF using the shared warm Puppeteer browser. */
export async function renderHtmlToPdf({
  html,
  format = 'A4',
  landscape = false,
}: RenderHtmlToPdfArgs): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready
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
    const pdfBuf = (await page.pdf({
      format,
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })) as unknown as Buffer
    pagesRendered++
    return Buffer.from(pdfBuf)
  } finally {
    await page.close().catch(() => {})
    await recycleIfNeeded()
  }
}

/** Render arbitrary trusted HTML to PNG using the shared warm Puppeteer browser. */
export async function renderHtmlToPng({
  html,
  width = 1600,
  height = 1000,
}: RenderHtmlToPngArgs): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 })
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready
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
    const pngBuf = (await page.screenshot({ type: 'png', fullPage: true })) as unknown as Buffer
    pagesRendered++
    return Buffer.from(pngBuf)
  } finally {
    await page.close().catch(() => {})
    await recycleIfNeeded()
  }
}

/**
 * Render a letter to a PDF buffer. Uses the same HTML the iframe preview
 * shows, so the printed output is identical.
 */
export async function renderLetterToPdf({
  letter,
  lang = 'en',
  font,
  origin,
}: RenderToPdfArgs): Promise<{ pdf: Buffer; missing: string[] }> {
  const { html, missing } = renderLetterHtml({ letter, lang, font, origin })
  const pdf = await renderHtmlToPdf({ html })
  return { pdf, missing }
}
