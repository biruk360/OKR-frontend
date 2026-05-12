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
    // @react-pdf/renderer uses class components and prototype chains that
    // webpack minification mangles in production builds — symptom: PDF
    // generation throws "B.Component is not a constructor" at runtime.
    // Marking the package (and its react-pdf internals) as a server-external
    // dependency makes Next leave it as a require() at runtime instead of
    // bundling it.
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      'react-pdf',
      '@react-pdf/font',
      '@react-pdf/image',
      '@react-pdf/layout',
      '@react-pdf/pdfkit',
      '@react-pdf/primitives',
      '@react-pdf/render',
      '@react-pdf/textkit',
      '@react-pdf/types',
    ],
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
