/**
 * Server-side renderer that turns a Letter (+ body HTML mirror) into a
 * self-contained printable HTML document, following the Eldix Letterhead Spec.
 *
 * Single source of truth for ALL three consumers:
 *   - GET /api/letters/[id]/html  → iframe preview in the Letter form
 *   - iframe.contentWindow.print() → browser's native print dialog
 *   - Puppeteer (GET /api/letters/[id]/pdf) → server-side PDF using THIS exact HTML
 *
 * Because all three paths render the same bytes, the screen preview, the
 * printed paper, and the downloaded PDF are byte-identical in layout.
 *
 * Asset URLs: we use absolute paths (`/fonts/...`, `/branding/...`) so the
 * same HTML works whether the iframe loads it from the app or Puppeteer
 * fetches it from `http://localhost:3000`. The renderer takes `origin` so
 * tests can render against an arbitrary base URL.
 */

import fs from 'fs'
import path from 'path'
import type { Letter, LetterEnclosure, LetterTypeDef } from '@prisma/client'
import { getLetterhead, type LetterheadInfo } from './letterhead'
import { resolvePlaceholders } from './letters'

// Cache base64-encoded fonts in memory — they're read once per process.
const fontB64Cache: Record<string, string> = {}
function readFontB64(filename: string): string {
  if (fontB64Cache[filename]) return fontB64Cache[filename]
  try {
    const p = path.join(process.cwd(), 'public', 'fonts', filename)
    const b64 = fs.readFileSync(p).toString('base64')
    fontB64Cache[filename] = b64
    return b64
  } catch {
    return ''
  }
}
function fontDataUri(filename: string): string {
  const b64 = readFontB64(filename)
  return b64 ? `data:font/truetype;base64,${b64}` : ''
}

export interface RenderHtmlArgs {
  letter: Letter & {
    signatory: { name: string | null } | null
    enclosures: Pick<LetterEnclosure, 'fileName' | 'fileSize'>[]
    letterTypeDef?: Pick<LetterTypeDef, 'id' | 'code' | 'name'> | null
  }
  /** Origin used to absolutise asset URLs (fonts, logos). Defaults to relative. */
  origin?: string
  /** Letter content language for label-switching. Default 'en'. */
  lang?: 'en' | 'am'
}

// ---------- HTML escaping ----------

const ESC: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
function esc(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/[&<>"']/g, (c) => ESC[c])
}

// Mammoth's HTML output is already safe and matches what Tiptap emits; we
// allow it through unmodified into the body.
function sanitizeBody(html: string | null | undefined): string {
  if (!html) return ''
  // Strip script/style for safety regardless of source.
  return String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Spec §11: date as "MMM dd, yyyy" — e.g. "Jan 02, 2026". */
function formatDate(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`
}

// ---------- @font-face block ----------
//
// Bundled TTFs under /public/fonts. Inter is substituted with Noto Sans
// (similar metrics, already bundled) to avoid shipping yet another family.

function src(filename: string, base: string): string {
  // Embed as base64 data URI if readable — guarantees the font is available
  // during print and PDF generation without any network fetch.
  // Falls back to a URL (works in browser iframe but not in Puppeteer/print).
  const uri = fontDataUri(filename)
  return uri ? `url('${uri}') format('truetype')` : `url('${base}/fonts/${filename}') format('truetype')`
}

function fontFaces(base: string): string {
  // ALL fonts embedded as base64 — no URL fetches during print/PDF.
  return `
    @font-face { font-family:'Inter'; font-weight:400; font-style:normal;  src: ${src('NotoSans-Regular.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:500; font-style:normal;  src: ${src('NotoSans-Regular.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:600; font-style:normal;  src: ${src('NotoSans-Bold.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:700; font-style:normal;  src: ${src('NotoSans-Bold.ttf', base)}; }
    @font-face { font-family:'Inter'; font-style:italic; font-weight:400;  src: ${src('NotoSans-Italic.ttf', base)}; }
    @font-face { font-family:'JetBrains Mono'; font-weight:400; font-style:normal; src: ${src('JetBrainsMono-Regular.ttf', base)}; }
    @font-face { font-family:'JetBrains Mono'; font-weight:500; font-style:normal; src: ${src('JetBrainsMono-Medium.ttf', base)}; }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:100 900; font-style:normal; src: ${src('NotoSansEthiopic-Regular.ttf', base)}; unicode-range: U+1200-137F,U+1380-139F,U+2D80-2DDF,U+AB01-AB2F; }
    @font-face { font-family:'Inter'; font-weight:100 900; font-style:normal; src: ${src('NotoSansEthiopic-Regular.ttf', base)}; unicode-range: U+1200-137F,U+1380-139F,U+2D80-2DDF,U+AB01-AB2F; }
  `
}

// ---------- Layout CSS — Design 4 "Right Rail" (master spec) ----------

function styles(base: string): string {
  return `
    ${fontFaces(base)}

    /* === Tokens === */
    :root {
      --paper:#ffffff; --ink:#000000; --ink-soft:#000000;
      --rule:#c4c4be;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #e8e8e3;
      font-family: 'Inter', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* === Page shell — flows naturally for multi-page content === */
    .lh {
      width: 210mm; min-height: 297mm;
      background: var(--paper); color: var(--ink);
      font-size: 10pt; line-height: 1.5;
      margin: 20px auto;
      box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 12px 40px rgba(0,0,0,.10);
    }

    /* === Padding container — normal flow, min-height fills A4 === */
    .lh .pad {
      padding: 12mm 10mm 14mm 14mm;
      min-height: calc(297mm - 26mm);
      display: flex; flex-direction: column;
    }

    /* === Header === */
    .main-hdr {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 4mm; margin-bottom: 5mm; gap: 8mm;
    }
    .main-hdr .hdr-logo { height: 15mm; width: auto; }
    .main-hdr .hdr-refdate { display: flex; gap: 8mm; align-items: flex-start; }
    .main-hdr .hdr-refdate .item .label {
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .18em; text-transform: uppercase;
      color: #000000; font-weight: 500; margin-bottom: 1mm;
    }
    .main-hdr .hdr-refdate .item .val {
      font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;
      color: var(--ink); font-size: 8.5pt; font-weight: 500; white-space: nowrap;
    }

    /* === Body grid: main column + right rail === */
    /* The rail column separator is drawn as a background gradient on the grid
       so it spans the full content height regardless of column length. */
    .body-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 42mm;
      gap: 0;
      background-image: linear-gradient(var(--rule), var(--rule));
      background-size: 1px 100%;
      background-position: calc(100% - 42mm) 0;
      background-repeat: no-repeat;
    }
    .main { display: flex; flex-direction: column; padding-right: 8mm; min-width: 0; }
    .body-wrap { flex: 1; }

    /* === Page number ===
       Screen: shown at bottom of content column.
       Print/PDF: hidden (browser @page counter handles it via @bottom-right). */
    .page-num {
      padding-top: 6mm; text-align: right;
      font-family: 'JetBrains Mono', monospace; font-size: 6pt;
      letter-spacing: .18em; text-transform: uppercase; color: #000000;
    }
    @media print {
      .page-num { display: none; }
    }

    /* === Right rail — no border-left (gradient handles it) === */
    .rail {
      padding-left: 5mm;
      display: flex; flex-direction: column; gap: 5mm;
    }
    .rail .info .label {
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .18em; text-transform: uppercase;
      color: #000000; font-weight: 500; margin-bottom: 1mm;
    }
    .rail .info .val { font-size: 7pt; line-height: 1.55; color: #000000; }
    .rail .info .val > div { white-space: nowrap; }
    .rail .brand-block {
      padding-top: 8mm; display: flex; flex-direction: column;
      gap: 3mm; align-items: flex-start;
    }
    .rail .brand-block .eldix-mark  { height: 9mm; width: auto; }
    .rail .brand-block .ground-mark { height: 13mm; width: auto; opacity: .92; }

    /* === Body content === */
    .lh-body {
      font-family: 'Inter', sans-serif;
      font-size: 10pt; line-height: 1.55; color: #000000;
    }
    .to-line {
      margin-bottom: 5mm; display: flex; align-items: baseline; gap: 3mm;
    }
    .to-line .label {
      font-family: 'Inter', sans-serif; font-size: 9.5pt;
      color: #000000; font-weight: 500; line-height: 1;
    }
    .to-line .recipient { font-family: 'Inter', sans-serif; font-weight: 600; color: var(--ink); font-size: 10pt; }
    h1.subject {
      font-family: 'Inter', sans-serif;
      font-size: 11pt; font-weight: 600; line-height: 1.4;
      color: var(--ink); margin: 0 0 4mm;
    }
    h1.subject .subject-label {
      display: inline-block; font-size: 10pt; color: #000000;
      font-weight: 500; margin-right: 3mm;
    }
    h1.subject .subject-text {
      font-family: 'Inter', sans-serif;
      text-decoration: underline; text-decoration-thickness: 1px;
      text-underline-offset: 3px; text-decoration-color: var(--ink);
    }
    .lh-body p { margin: 0 0 2.5mm; font-weight: 400; }
    .lh-body h2 { font-size: 12pt; font-weight: 700; margin: 4mm 0 2mm; color: var(--ink); }
    .lh-body h3 { font-size: 11pt; font-weight: 700; margin: 3mm 0 1.5mm; color: var(--ink); }
    .lh-body ul, .lh-body ol { margin: 0 0 2.5mm; padding-left: 6mm; }
    .lh-body li { margin-bottom: 1mm; }
    .lh-body blockquote {
      border-left: 1px solid var(--rule); padding-left: 3mm;
      color: #000000; margin: 0 0 2.5mm;
    }
    .lh-body table {
      border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 9pt;
    }
    .lh-body table th, .lh-body table td {
      border: 1px solid var(--rule); padding: 1.5mm 2mm; vertical-align: top;
    }
    .lh-body table th { background: #fafaf7; font-weight: 600; text-align: left; }
    .lh-body strong { font-weight: 700; color: var(--ink); }
    .lh-body em { font-style: italic; }
    .lh-body a { color: inherit; text-decoration: underline; }

    .placeholder-missing { color: #b91c1c; font-weight: 600; }

    /* === Signature === */
    .sig { margin-top: 7mm; font-family: 'Inter', sans-serif; }
    .sig .closing { margin-bottom: 3mm; color: #000000; }
    .sig .line { width: 50mm; height: 11mm; border-bottom: 1px solid #000000; margin-bottom: 1.5mm; }
    .sig .name { font-weight: 600; color: #000000; font-size: 10pt; }
    .sig .title { font-size: 8.5pt; color: #000000; font-style: italic; }

    /* === Enclosures === */
    .enclosures {
      margin-top: 6mm; padding-top: 2mm; border-top: 1px solid var(--rule);
      font-size: 9pt; color: #000000;
    }
    .enclosures .enc-heading {
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .18em; text-transform: uppercase;
      color: #000000; font-weight: 500; margin-bottom: 1mm;
    }
    .enclosures ol { margin: 0; padding-left: 5mm; }
    .enclosures li { margin-bottom: 0.5mm; }

    /* === Print === */
    @page {
      size: A4;
      margin: 12mm 10mm 18mm 14mm;
      @bottom-right {
        content: "Page " counter(page) " / " counter(pages);
        font-family: 'JetBrains Mono', monospace;
        font-size: 6pt; letter-spacing: .18em;
        text-transform: uppercase; color: #000000;
      }
    }
    @media print {
      html, body { background: #fff; }
      .lh { box-shadow: none; margin: 0; width: 100%; min-height: 0; }
      .lh .pad { padding: 0; min-height: 0; }
      .main-hdr { page-break-inside: avoid; }
      .sig { page-break-inside: avoid; }
      .enclosures { page-break-inside: avoid; }
      .lh-body table { page-break-inside: auto; }
      .lh-body tr { page-break-inside: avoid; }
    }
  `
}

// ---------- Localised label strings ----------

const LABELS = {
  en: {
    to: 'To',
    subject: 'Subject',
    reference: 'Reference',
    date: 'Date',
    enclosures: 'Enclosures',
    address: 'Address',
    telephone: 'Telephone',
    emailWeb: 'Email · Web',
    mailing: 'Mailing',
    sincerely: 'Sincerely,',
  },
  am: {
    to: 'ለ',
    subject: 'ጉዳዩ',
    reference: 'ቁጥር',
    date: 'ቀን',
    enclosures: 'ተያያዥ ሰነዶች',
    address: 'አድራሻ',
    telephone: 'ስልክ',
    emailWeb: 'ኢሜል · ድር',
    mailing: 'ፖስታ ሣጥን',
    sincerely: 'ከሰላምታ ጋር',
  },
} as const

// ---------- HTML rendering ----------

/**
 * Build the complete HTML document. Self-contained (no external network
 * dependencies once fonts/logos resolve under `origin`).
 */
export function renderLetterHtml({ letter, origin = '', lang = 'en' }: RenderHtmlArgs): {
  html: string
  missing: string[]
} {
  const head: LetterheadInfo = getLetterhead()
  const lbl = LABELS[lang] ?? LABELS.en

  // Resolve {{placeholders}} in the body. The resolver returns the HTML
  // with `[MISSING: x]` markers for unresolved tokens, plus an array of
  // names so the UI can warn about it.
  const { html: resolvedBody, missing } = resolvePlaceholders(letter.bodyContent || '', {
    customerName: letter.customerName,
    date: letter.date,
    referenceNumber: letter.referenceNumber,
    signatoryName: letter.signatory?.name ?? null,
    senderDepartment: letter.senderDepartment,
    salutation: letter.salutation,
    closing: letter.closing,
  })

  // Wrap the [MISSING: x] markers in a span so they render red in both
  // the preview and the printed PDF.
  const bodyHtml = sanitizeBody(resolvedBody).replace(
    /\[MISSING:\s*([a-z_]+)\]/gi,
    '<span class="placeholder-missing">[MISSING: $1]</span>'
  )

  // Asset URLs. When `origin` is provided (Puppeteer needs absolute URLs
  // because it loads the HTML as `file://` or a temp doc with no base),
  // prepend it; otherwise relative paths work fine in the iframe.
  const base = origin.replace(/\/$/, '')
  const eldixLogoUrl = `${base}/branding/eldix-primary.png`
  const groundLogoUrl = `${base}/branding/360ground.png`

  // Right-rail HTML — contact info stack + spacer + brand block at bottom.
  const railHtml = `
    <div class="info">
      <div class="label">${lbl.address}</div>
      <div class="val">${head.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    </div>
    <div class="info">
      <div class="label">${lbl.telephone}</div>
      <div class="val">${head.phones.map((p) => `<div>${esc(p)}</div>`).join('')}</div>
    </div>
    <div class="info">
      <div class="label">${lbl.emailWeb}</div>
      <div class="val"><div>${esc(head.email)}</div><div>${esc(head.web)}</div></div>
    </div>
    <div class="info">
      <div class="label">${lbl.mailing}</div>
      <div class="val"><div>${esc(head.pobox)}</div><div>${esc(head.city)}</div></div>
    </div>
    <div class="brand-block">
      ${head.eldixLogoPath ? `<img class="eldix-mark" src="${eldixLogoUrl}" alt="Eldix" />` : ''}
      ${head.groundLogoPath ? `<img class="ground-mark" src="${groundLogoUrl}" alt="360Ground" />` : ''}
    </div>
  `

  // Enclosures block (only if present).
  const enclosuresHtml =
    letter.enclosures.length > 0
      ? `<div class="enclosures">
           <div class="enc-heading">${lbl.enclosures}</div>
           <ol>${letter.enclosures
             .map((e) => `<li>${esc(e.fileName)} (${formatBytes(e.fileSize)})</li>`)
             .join('')}</ol>
         </div>`
      : ''

  // Signature block (only if a signatory is assigned).
  const closingText = letter.closing?.trim() || lbl.sincerely
  const sigTitle = letter.signatoryTitle?.trim() || letter.senderDepartment?.trim() || ''
  const sigHtml = letter.signatory?.name
    ? `<div class="sig">
         <div class="closing">${esc(closingText)}</div>
         <div class="line"></div>
         <div class="name">${esc(letter.signatory.name)}</div>
         ${sigTitle ? `<div class="title">${esc(sigTitle)}</div>` : ''}
       </div>`
    : ''

  // To-line (only if a customer is assigned).
  const toHtml = letter.customerName
    ? `<div class="to-line"><span class="label">${lbl.to}</span><span class="recipient">${esc(letter.customerName)}</span></div>`
    : ''

  const refNumber = letter.referenceNumber || 'DRAFT'
  const dateStr = formatDate(letter.date)

  // Single page instance — reused for both the one-page and (future) multi-page case.
  const pageHtml = (pageLabel: string) => `
<article class="lh">
  <div class="pad">
    <div class="main-hdr">
      ${head.eldixLogoPath
        ? `<img class="hdr-logo" src="${eldixLogoUrl}" alt="Eldix" />`
        : `<div style="font-size:14pt;font-weight:700;letter-spacing:.1em;">ELDIX</div>`}
      <div class="hdr-refdate">
        <div class="item">
          <div class="label">${lbl.reference}</div>
          <div class="val">${esc(refNumber)}</div>
        </div>
        <div class="item">
          <div class="label">${lbl.date}</div>
          <div class="val">${esc(dateStr)}</div>
        </div>
      </div>
    </div>

    <div class="body-grid">
      <section class="main">
        <div class="body-wrap">
          <div class="lh-body">
            ${toHtml}
            <h1 class="subject">
              <span class="subject-label">${lbl.subject}</span>
              <span class="subject-text">${esc(letter.subject)}</span>
            </h1>
            ${bodyHtml}
            ${sigHtml}
            ${enclosuresHtml}
          </div>
        </div>
        <div class="page-num">${pageLabel}</div>
      </section>
      <aside class="rail">${railHtml}</aside>
    </div>
  </div>
</article>`

  return {
    missing,
    html: `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(refNumber)}</title>
<style>${styles(base)}</style>
</head>
<body>
${pageHtml('Page 01 / 01')}
</body>
</html>`,
  }
}
