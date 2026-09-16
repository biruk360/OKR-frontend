/** @type {import('next').NextConfig} */
function normalizeBasePath() {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim()
  if (!raw || raw === '/') return undefined
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const trimmed = withLeading.replace(/\/$/, '')
  return trimmed === '' ? undefined : trimmed
}

const nextConfig = {
  basePath: normalizeBasePath(),
  // `NEXT_DIST_DIR` lets the deploy build into a scratch directory while the
  // running app keeps serving from `.next`, then swap the two with a mv.
  // Without it deploy.sh had to `rm -rf .next` before building, which left the
  // live process with no static assets for the whole build — every chunk
  // request 404'd and users got "Loading chunk N failed".
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
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
