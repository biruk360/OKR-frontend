const { retiredRouteRedirects } = require('./lib/retired-routes')

/** @type {import('next').NextConfig} */
function normalizeBasePath() {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim()
  if (!raw || raw === '/') return undefined
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const trimmed = withLeading.replace(/\/$/, '')
  return trimmed === '' ? undefined : trimmed
}

const isDev = process.env.NODE_ENV === 'development'

/**
 * Content-Security-Policy for app pages (not /api/*, see headers() below).
 *
 * Allowlist, and why each origin is here:
 *  - script-src 'self' 'unsafe-inline': Next 14 streams RSC payloads as inline
 *    <script> tags and DashboardShell boots the sidebar width inline; there is
 *    no nonce plumbing yet. 'unsafe-eval' is DEV ONLY (webpack/Turbopack HMR).
 *    No production dependency needs eval (checked: SuperDoc's bundled jszip only
 *    uses `new Function` for string callbacks it never receives).
 *  - style-src 'unsafe-inline': React style props, next/font, SuperDoc/Konva.
 *    fonts.googleapis.com: the letter editor (SuperDocEditorClient) injects a
 *    Google Fonts stylesheet for the letterhead faces.
 *  - font-src fonts.gstatic.com: the font files that stylesheet references.
 *    next/font/google (app/layout.tsx) self-hosts, so it needs only 'self'.
 *  - img-src https: data: blob: — sign-in wallpapers come from www.bing.com
 *    (features/auth/services/bing-wallpaper.ts), plus avatars/link previews and
 *    canvas/blob exports. Images cannot execute, so a broad https: is accepted.
 *  - connect-src 'self' + Pusher (lib/pusher.ts; pusher-js talks to
 *    wss://ws-<cluster>.pusher.com and the https://sockjs-<cluster>.pusher.com
 *    fallback). OpenAI, Odoo, Jira, Telegram, Slack are all server-side.
 *    SuperDoc's default telemetry beacon (ingest.superdoc.dev) is deliberately
 *    NOT allowed — letters should not report document opens to a third party.
 *  - frame-src 'self' blob: — the letter preview iframes /api/letters/[id]/html.
 *  - object-src 'self' — AttachmentLightbox previews PDFs with <object> from
 *    our own attachment routes. No plugins from elsewhere.
 *  - frame-ancestors 'none' — no page is meant to be framed (the only framed
 *    document is the /api letter HTML, which gets SAMEORIGIN instead).
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  `connect-src 'self' https://*.pusher.com wss://*.pusher.com${isDev ? ' ws: wss:' : ''}`,
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]

/** Headers for every response, API included. */
const COMMON_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
]

const nextConfig = {
  basePath: normalizeBasePath(),
  poweredByHeader: false,
  // Retired OKR/analytics pages → OKR Explorer views/presets and Insights tabs
  // (lib/retired-routes.js). Permanent; the request's query string is kept.
  async redirects() {
    return retiredRouteRedirects()
  },
  async headers() {
    return [
      // Pages: full CSP, never framed.
      {
        source: '/:path((?!api/).*)',
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: CSP_DIRECTIVES.join('; ') },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      // API: no page CSP (routes that serve documents — attachments, letter
      // HTML — set their own), but only same-origin framing: the letter
      // preview iframes /api/letters/[id]/html from our own pages.
      {
        source: '/api/:path*',
        headers: [
          ...COMMON_SECURITY_HEADERS,
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
  // `NEXT_DIST_DIR` lets the deploy build into a scratch directory while the
  // running app keeps serving from `.next`, then swap the two with a mv.
  // Without it deploy.sh had to `rm -rf .next` before building, which left the
  // live process with no static assets for the whole build — every chunk
  // request 404'd and users got "Loading chunk N failed".
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  // Nothing renders through next/image (grep `next/image`), so the optimizer
  // gets no remote hosts: the previous `hostname: '**'` turned /_next/image
  // into an open image proxy that fetched any https URL on request.
  images: {
    remotePatterns: [],
    // Nothing renders through next/image, so switch the /_next/image optimizer
    // off entirely — it is the target of several Next 14 advisories (DoS, disk
    // growth, AVIF RCE) that are only patched in 15.5.x.
    unoptimized: true,
  },
  experimental: {
    // Puppeteer bundles its own Chromium binary and walks node_modules at
    // runtime (chrome-headless-shell etc). Webpack would try to inline it,
    // which fails. Keep it external so Next leaves the require() alone.
    serverComponentsExternalPackages: ['puppeteer', 'puppeteer-core', '@puppeteer/browsers'],
  },
  /**
   * Dev (`npm run dev:webpack`): in-memory webpack cache avoids corrupted pack restores that
   * trigger "Loading chunk … failed". Prefer default `npm run dev` (Turbopack), which avoids
   * webpack dev chunks entirely; keep this for fallback if Turbo misbehaves with a dependency.
   */
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.cache = { type: 'memory' }
    }
    return config
  },
}

module.exports = nextConfig
