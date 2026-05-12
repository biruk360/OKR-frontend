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

function fontFaces(base: string): string {
  // Ethiopic fonts are embedded as base64 data URIs so Chrome's print renderer
  // never needs a network fetch — URL-based @font-face declarations are skipped
  // during print/PDF generation, causing Amharic glyphs to render as boxes.
  const ethRegUri = fontDataUri('NotoSansEthiopic-Regular.ttf') || `${base}/fonts/NotoSansEthiopic-Regular.ttf`
  const ethBoldUri = fontDataUri('NotoSansEthiopic-Bold.ttf') || `${base}/fonts/NotoSansEthiopic-Bold.ttf`
  const ethRegSrc = ethRegUri.startsWith('data:') ? `url('${ethRegUri}') format('truetype')` : `url('${ethRegUri}') format('truetype')`
  const ethBoldSrc = ethBoldUri.startsWith('data:') ? `url('${ethBoldUri}') format('truetype')` : `url('${ethBoldUri}') format('truetype')`
  return `
    @font-face { font-family:'Inter'; font-weight:400; font-style:normal;
                 src: url('${base}/fonts/NotoSans-Regular.ttf') format('truetype'); }
    @font-face { font-family:'Inter'; font-weight:500; font-style:normal;
                 src: url('${base}/fonts/NotoSans-Regular.ttf') format('truetype'); }
    @font-face { font-family:'Inter'; font-weight:600; font-style:normal;
                 src: url('${base}/fonts/NotoSans-Bold.ttf') format('truetype'); }
    @font-face { font-family:'Inter'; font-weight:700; font-style:normal;
                 src: url('${base}/fonts/NotoSans-Bold.ttf') format('truetype'); }
    @font-face { font-family:'Inter'; font-style:italic; font-weight:400;
                 src: url('${base}/fonts/NotoSans-Italic.ttf') format('truetype'); }
    @font-face { font-family:'JetBrains Mono'; font-weight:400; font-style:normal;
                 src: url('${base}/fonts/JetBrainsMono-Regular.ttf') format('truetype'); }
    @font-face { font-family:'JetBrains Mono'; font-weight:500; font-style:normal;
                 src: url('${base}/fonts/JetBrainsMono-Medium.ttf') format('truetype'); }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:400; font-style:normal;
                 src: ${ethRegSrc}; }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:500; font-style:normal;
                 src: ${ethRegSrc}; }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:600; font-style:normal;
                 src: ${ethBoldSrc}; }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:700; font-style:normal;
                 src: ${ethBoldSrc}; }
  `
}

// ---------- Layout CSS — Design 4 "Right Rail" (master spec) ----------

function styles(base: string): string {
  return `
    ${fontFaces(base)}

    /* === Tokens === */
    :root {
      --paper:#ffffff; --ink:#0e0e0e; --ink-soft:#2a2a2a;
      --muted:#8a8a86; --rule:#c4c4be;
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

    /* === Page shell — strictly A4, overflow hidden === */
    .lh {
      width: 210mm; height: 297mm;
      background: var(--paper); color: var(--ink);
      position: relative; overflow: hidden;
      font-size: 10pt; line-height: 1.5;
      margin: 20px auto;
      box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 12px 40px rgba(0,0,0,.10);
    }
    /* Stack multiple pages with a gutter between them */
    .page-stack {
      display: flex; flex-direction: column;
      align-items: center; gap: 28px;
    }

    /* === Padding container fills the A4 inset === */
    .lh .pad {
      position: absolute; inset: 12mm 10mm 14mm 14mm;
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
      color: var(--muted); font-weight: 500; margin-bottom: 1mm;
    }
    .main-hdr .hdr-refdate .item .val {
      font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;
      color: var(--ink); font-size: 8.5pt; font-weight: 500; white-space: nowrap;
    }

    /* === Body grid: main column + right rail === */
    .body-grid {
      flex: 1; display: grid; grid-template-columns: 1fr 42mm;
      gap: 6mm; min-height: 0;
    }
    .main { display: flex; flex-direction: column; padding-right: 2mm; min-width: 0; }
    .body-wrap { flex: 1; }

    /* === Page number === */
    .page-num {
      margin-top: auto; padding-top: 6mm; text-align: right;
      font-family: 'JetBrains Mono', monospace; font-size: 6pt;
      letter-spacing: .18em; text-transform: uppercase; color: var(--muted);
    }

    /* === Right rail === */
    .rail {
      border-left: 1px solid var(--rule); padding-left: 5mm;
      display: flex; flex-direction: column; gap: 5mm;
    }
    .rail .info .label {
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .18em; text-transform: uppercase;
      color: var(--muted); font-weight: 500; margin-bottom: 1mm;
    }
    .rail .info .val { font-size: 7pt; line-height: 1.55; color: var(--ink-soft); }
    .rail .info .val > div { white-space: nowrap; }
    .rail .spacer { flex: 1; }
    .rail .brand-block {
      padding-top: 8mm; display: flex; flex-direction: column;
      gap: 3mm; align-items: flex-start;
    }
    .rail .brand-block .eldix-mark  { height: 9mm; width: auto; }
    .rail .brand-block .ground-mark { height: 13mm; width: auto; opacity: .92; }
    .rail .brand-block .city-stamp {
      display: inline-flex; align-items: center; gap: 2mm;
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .28em; text-transform: uppercase;
      color: var(--muted); font-weight: 500; margin-top: 3mm;
    }
    .rail .brand-block .city-stamp .flag { width: 5mm; height: 2.5mm; flex-shrink: 0; display: block; }

    /* === Body content === */
    .lh-body {
      font-family: 'Noto Sans Ethiopic', 'Inter', sans-serif;
      font-size: 10pt; line-height: 1.55; color: var(--ink-soft);
    }
    .to-line {
      margin-bottom: 5mm; display: flex; align-items: baseline; gap: 3mm;
    }
    .to-line .label {
      font-family: 'Noto Sans Ethiopic', 'Inter', sans-serif; font-size: 9.5pt;
      color: var(--muted); font-weight: 500; line-height: 1;
    }
    .to-line .recipient { font-family: 'Inter', sans-serif; font-weight: 600; color: var(--ink); font-size: 10pt; }
    h1.subject {
      font-family: 'Noto Sans Ethiopic', 'Inter', sans-serif;
      font-size: 11pt; font-weight: 600; line-height: 1.4;
      color: var(--ink); margin: 0 0 4mm;
    }
    h1.subject .subject-label {
      display: inline-block; font-size: 10pt; color: var(--muted);
      font-weight: 500; margin-right: 3mm;
    }
    h1.subject .subject-text {
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
      color: var(--muted); margin: 0 0 2.5mm;
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
    .sig .closing { margin-bottom: 3mm; color: var(--ink-soft); }
    .sig .line { width: 50mm; height: 11mm; border-bottom: 1px solid var(--ink); margin-bottom: 1.5mm; }
    .sig .name { font-weight: 600; color: var(--ink); font-size: 10pt; }
    .sig .title { font-size: 8.5pt; color: var(--muted); }

    /* === Enclosures === */
    .enclosures {
      margin-top: 6mm; padding-top: 2mm; border-top: 1px solid var(--rule);
      font-size: 9pt; color: var(--ink-soft);
    }
    .enclosures .enc-heading {
      font-family: 'JetBrains Mono', monospace; font-size: 5.5pt;
      letter-spacing: .18em; text-transform: uppercase;
      color: var(--muted); font-weight: 500; margin-bottom: 1mm;
    }
    .enclosures ol { margin: 0; padding-left: 5mm; }
    .enclosures li { margin-bottom: 0.5mm; }

    /* === Print === */
    @page { size: A4; margin: 0; }
    @media print {
      html, body { background: #fff; }
      .page-stack { gap: 0; }
      .lh { box-shadow: none; margin: 0; page-break-after: always; }
    }
  `
}

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
      <div class="label">Address</div>
      <div class="val">${head.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
    </div>
    <div class="info">
      <div class="label">Telephone</div>
      <div class="val">${head.phones.map((p) => `<div>${esc(p)}</div>`).join('')}</div>
    </div>
    <div class="info">
      <div class="label">Email · Web</div>
      <div class="val"><div>${esc(head.email)}</div><div>${esc(head.web)}</div></div>
    </div>
    <div class="info">
      <div class="label">Mailing</div>
      <div class="val"><div>${esc(head.pobox)}</div><div>${esc(head.city)}</div></div>
    </div>
    <div class="spacer"></div>
    <div class="brand-block">
      ${head.eldixLogoPath ? `<img class="eldix-mark" src="${eldixLogoUrl}" alt="Eldix" />` : ''}
      ${head.groundLogoPath ? `<img class="ground-mark" src="${groundLogoUrl}" alt="360Ground" />` : ''}
      <div class="city-stamp">
        <span>Addis Ababa · Ethiopia</span>
        <svg class="flag" viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" aria-label="Ethiopian flag">
          <rect width="60" height="10" fill="#078930" />
          <rect y="10" width="60" height="10" fill="#FCDD09" />
          <rect y="20" width="60" height="10" fill="#DA121A" />
          <circle cx="30" cy="15" r="5.5" fill="#0F47AF" />
          <polygon points="30,11 30.94,13.71 33.80,13.76 31.52,15.49 32.35,18.24 30,16.6 27.65,18.24 28.48,15.49 26.20,13.76 29.06,13.71" fill="#FCDD09" />
        </svg>
      </div>
    </div>
  `

  // Enclosures block (only if present).
  const enclosuresHtml =
    letter.enclosures.length > 0
      ? `<div class="enclosures">
           <div class="enc-heading">Enclosures</div>
           <ol>${letter.enclosures
             .map((e) => `<li>${esc(e.fileName)} (${formatBytes(e.fileSize)})</li>`)
             .join('')}</ol>
         </div>`
      : ''

  // Signature block (only if a signatory is assigned).
  const sigHtml = letter.signatory?.name
    ? `<div class="sig">
         <div class="closing">Sincerely,</div>
         <div class="line"></div>
         <div class="name">${esc(letter.signatory.name)}</div>
         ${letter.senderDepartment ? `<div class="title">${esc(letter.senderDepartment)}</div>` : ''}
       </div>`
    : ''

  // To-line (only if a customer is assigned).
  const toHtml = letter.customerName
    ? `<div class="to-line"><span class="label">ለ</span><span class="recipient">${esc(letter.customerName)}</span></div>`
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
          <div class="label">Reference</div>
          <div class="val">${esc(refNumber)}</div>
        </div>
        <div class="item">
          <div class="label">Date</div>
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
              <span class="subject-label">ጉዳዩ</span>
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
