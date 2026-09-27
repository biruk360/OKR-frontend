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
 * Assets: fonts and logos are inlined as data: URIs so the document is fully
 * self-contained — Puppeteer renders it with JavaScript disabled and every
 * network request blocked except Google Fonts (see lib/letter-pdf-puppeteer.ts).
 * If a file cannot be read we fall back to a same-origin relative path. There
 * is deliberately NO caller-supplied origin: it used to come from `?origin=`
 * and was interpolated into <img src> unescaped (reflected XSS).
 *
 * Security: the stored body goes through the strict allowlist sanitizer in
 * lib/letter-sanitize.ts; the font name is allowlisted; every other
 * interpolated value is HTML-escaped.
 */

import fs from 'fs'
import path from 'path'
import type { Letter, LetterEnclosure, LetterTypeDef } from '@prisma/client'
import { getLetterhead, type LetterheadInfo } from './letterhead'
import { resolvePlaceholders } from './letters'
import {
  DEFAULT_LETTER_FONT_FAMILY,
  LETTER_FONT_IMPORTS,
  escapeHtml,
  resolveLetterFont,
  sanitizeLetterBodyHtml,
} from './letter-sanitize'

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

// Logos are inlined too, so neither the iframe nor Puppeteer needs to fetch
// anything from the app (and no origin has to be supplied by anyone).
const logoUriCache: Record<string, string> = {}
function logoSrc(absPath: string, fallbackRel: string): string {
  if (logoUriCache[absPath]) return logoUriCache[absPath]
  try {
    const ext = path.extname(absPath).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
    const uri = `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`
    logoUriCache[absPath] = uri
    return uri
  } catch {
    return fallbackRel
  }
}

// ---------- Google Fonts catalog ----------
// The allowlisted family → stylesheet map lives in lib/letter-sanitize.ts so
// the `?font=` allowlist and the <link> list can never drift apart.
const GOOGLE_FONTS_IMPORT: Readonly<Record<string, string>> = LETTER_FONT_IMPORTS

const DEFAULT_FONT = DEFAULT_LETTER_FONT_FAMILY

export interface RenderHtmlArgs {
  letter: Letter & {
    signatory: {
      name: string | null
      nameAmharic?: string | null
      designation?: string | null
      designationAmharic?: string | null
    } | null
    enclosures: Pick<LetterEnclosure, 'fileName' | 'fileSize'>[]
    letterTypeDef?: Pick<LetterTypeDef, 'id' | 'code' | 'name'> | null
  }
  /** Letter content language for label-switching. Default 'en'. */
  lang?: 'en' | 'am'
  /**
   * Font family for the letter body. Untrusted (comes from `?font=`): anything
   * outside the LETTER_FONT_IMPORTS allowlist falls back to the default.
   */
  font?: string
}

// ---------- HTML escaping ----------

const esc = escapeHtml

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

function src(filename: string, base = ''): string {
  // Embed as base64 data URI if readable — guarantees the font is available
  // during print and PDF generation without any network fetch.
  // Falls back to a URL (works in browser iframe but not in Puppeteer/print).
  const uri = fontDataUri(filename)
  return uri ? `url('${uri}') format('truetype')` : `url('${base}/fonts/${filename}') format('truetype')`
}

function fontFaces(base: string): string {
  // Noto Sans Ethiopic is the default letter font — embed full weight range
  // from local TTF so it renders offline (no Google Fonts request needed).
  // Other fonts in the catalog are loaded via Google Fonts <link> in the <head>.
  return `
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:400; font-style:normal; src: ${src('NotoSansEthiopic-Regular.ttf', base)}; }
    @font-face { font-family:'Noto Sans Ethiopic'; font-weight:700; font-style:normal; src: ${src('NotoSansEthiopic-Bold.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:400; font-style:normal;  src: ${src('NotoSans-Regular.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:500; font-style:normal;  src: ${src('NotoSans-Regular.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:600; font-style:normal;  src: ${src('NotoSans-Bold.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:700; font-style:normal;  src: ${src('NotoSans-Bold.ttf', base)}; }
    @font-face { font-family:'Inter'; font-style:italic; font-weight:400;  src: ${src('NotoSans-Italic.ttf', base)}; }
    @font-face { font-family:'JetBrains Mono'; font-weight:400; font-style:normal; src: ${src('JetBrainsMono-Regular.ttf', base)}; }
    @font-face { font-family:'JetBrains Mono'; font-weight:500; font-style:normal; src: ${src('JetBrainsMono-Medium.ttf', base)}; }
    @font-face { font-family:'Inter'; font-weight:100 900; font-style:normal; src: ${src('NotoSansEthiopic-Regular.ttf', base)}; unicode-range: U+1200-137F,U+1380-139F,U+2D80-2DDF,U+AB01-AB2F; }
  `
}

// ---------- Layout CSS — Design 4 "Right Rail" (master spec) ----------

function googleFontLinks(fonts: Iterable<string>): string {
  const urls = Array.from(new Set(
    Array.from(fonts)
      .map((font) => GOOGLE_FONTS_IMPORT[font])
      .filter(Boolean)
  ))
  if (urls.length === 0) return ''

  return `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />${urls
    .map((url) => `<link rel="stylesheet" href="${url}" />`)
    .join('')}`
}

function collectInlineFonts(html: string): string[] {
  const fonts = new Set<string>()
  let match: RegExpExecArray | null
  const familyRe = /font-family\s*:\s*([^;"']+)/gi
  // Sanitized attributes carry quotes as entities; restore them so quoted
  // family names are still recognised.
  const text = html.replace(/&#39;|&quot;/g, "'")

  while ((match = familyRe.exec(text)) !== null) {
    match[1]
      .split(',')
      .map((family) => family.trim().replace(/^['"]|['"]$/g, ''))
      .filter((family) => GOOGLE_FONTS_IMPORT[family])
      .forEach((family) => fonts.add(family))
  }

  return Array.from(fonts)
}

function styles(base: string, lang: 'en' | 'am' = 'en', font: string = DEFAULT_FONT): string {
  // JetBrains Mono has zero Ethiopic glyph coverage — Ethiopic chars render as
  // tofu boxes. For Amharic labels switch to Noto Sans Ethiopic.
  // text-transform:uppercase also causes Ethiopic chars to vanish (no uppercase
  // form exists), so suppress it. letter-spacing looks wrong on Ethiopic too.
  const labelFont      = lang === 'am' ? "'Noto Sans Ethiopic', sans-serif" : "'JetBrains Mono', monospace"
  const labelTransform = lang === 'am' ? 'none' : 'uppercase'
  const labelSpacing   = lang === 'am' ? 'normal' : '.18em'
  // Body font stack: selected Google Font, with Noto Ethiopic as Ethiopic-script
  // fallback and system-ui as last resort.
  const bodyFont = `'${font}', 'Noto Sans Ethiopic', system-ui, sans-serif`
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
      font-family: ${bodyFont};
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
      font-family: ${labelFont}; font-size: 5.5pt;
      letter-spacing: ${labelSpacing}; text-transform: ${labelTransform};
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
      font-family: ${labelFont}; font-size: 5.5pt;
      letter-spacing: ${labelSpacing}; text-transform: ${labelTransform};
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
      font-family: ${bodyFont};
      font-size: 10pt; line-height: 1.55; color: #000000;
    }
    .to-line {
      margin-bottom: 5mm; display: flex; align-items: baseline; gap: 3mm;
    }
    .to-line .label {
      font-family: ${bodyFont}; font-size: 9.5pt;
      color: #000000; font-weight: 500; line-height: 1;
    }
    .to-line .recipient { font-family: ${bodyFont}; font-weight: 600; color: var(--ink); font-size: 10pt; }
    h1.subject {
      font-family: ${bodyFont};
      font-size: 11pt; font-weight: 600; line-height: 1.4;
      color: var(--ink); margin: 0 0 4mm;
    }
    h1.subject .subject-label {
      display: inline-block; font-size: 10pt; color: #000000;
      font-weight: 500; margin-right: 3mm;
    }
    h1.subject .subject-text {
      font-family: ${bodyFont};
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
    .lh-body .letter-page-break {
      break-before: page;
      page-break-before: always;
      height: 0;
    }
    .lh-body .letter-column-break {
      break-before: column;
      height: 0;
    }

    .placeholder-missing { color: #b91c1c; font-weight: 600; }

    /* === Signature === */
    .sig { margin-top: 7mm; font-family: ${bodyFont}; }
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
      font-family: ${labelFont}; font-size: 5.5pt;
      letter-spacing: ${labelSpacing}; text-transform: ${labelTransform};
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
 * dependencies: fonts and logos are inlined as data: URIs).
 */
export function renderLetterHtml({ letter, lang: rawLang = 'en', font: rawFont = DEFAULT_FONT }: RenderHtmlArgs): {
  html: string
  missing: string[]
} {
  // Both come from query strings — normalise before they reach markup/CSS.
  const lang: 'en' | 'am' = rawLang === 'am' ? 'am' : 'en'
  const font = resolveLetterFont(rawFont)
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
  const bodyHtml = sanitizeLetterBodyHtml(resolvedBody).replace(
    /\[MISSING:\s*([a-z_]+)\]/gi,
    '<span class="placeholder-missing">[MISSING: $1]</span>'
  )
  const fontsToLoad = [font, ...collectInlineFonts(bodyHtml)]

  // Asset URLs — inlined data: URIs (see logoSrc). Relative fallback only.
  const base = ''
  const eldixLogoUrl = head.eldixLogoPath ? logoSrc(head.eldixLogoPath, '/branding/eldix-primary.png') : ''
  const groundLogoUrl = head.groundLogoPath ? logoSrc(head.groundLogoPath, '/branding/360ground.png') : ''

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
  // For Amharic letters prefer the Amharic name/title fields if populated.
  const sigName = (lang === 'am' && letter.signatory?.nameAmharic?.trim())
    ? letter.signatory.nameAmharic.trim()
    : (letter.signatory?.name ?? '')
  // Priority: lang-specific signatoryTitle → signatory user's lang-specific designation → senderDepartment
  const sigTitle = (lang === 'am'
    ? (letter.signatoryTitleAmharic?.trim() || letter.signatory?.designationAmharic?.trim())
    : (letter.signatoryTitle?.trim() || letter.signatory?.designation?.trim()))
    || letter.senderDepartment?.trim()
    || ''
  const sigHtml = letter.signatory?.name
    ? `<div class="sig">
         <div class="closing">${esc(closingText)}</div>
         <div class="line"></div>
         <div class="name">${esc(sigName)}</div>
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
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8" />
<title>${esc(refNumber)}</title>
${googleFontLinks(fontsToLoad)}
<style>${styles(base, lang, font)}</style>
</head>
<body>
${pageHtml('Page 01 / 01')}
</body>
</html>`,
  }
}
