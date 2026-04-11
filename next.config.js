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
