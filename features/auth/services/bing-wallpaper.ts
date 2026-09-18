import type { Wallpaper } from '../types'

/**
 * Server-side source for the sign-in backdrop: Bing's published
 * image-of-the-day archive (the same feed that paints bing.com).
 *
 * Called only from `app/api/wallpaper/route.ts`. The browser never talks to
 * Bing for metadata — it receives a normalised list from our own origin and
 * loads the image files directly, with `referrerpolicy="no-referrer"`.
 *
 * Environment:
 *   AUTH_WALLPAPER_SOURCE  `bing` (default) | `off` — `off` skips the network
 *                          entirely and the screen uses the built-in scenes.
 *   AUTH_WALLPAPER_MARKET  Bing market, default `en-US`. Drives which set of
 *                          photos (and which captions) come back.
 */

const ARCHIVE_URL = 'https://www.bing.com/HPImageArchive.aspx'
const ORIGIN = 'https://www.bing.com'
/** The archive exposes roughly a week and a half; 8 is the per-request cap. */
const COUNT = 8
const REQUEST_TIMEOUT_MS = 6_000
/** The feed changes once a day, so a six-hour memo is plenty. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface BingImage {
  startdate?: string
  urlbase?: string
  url?: string
  title?: string
  copyright?: string
  copyrightlink?: string
  hsh?: string
}

let cache: { at: number; images: Wallpaper[] } | null = null

export function isBingSourceEnabled(): boolean {
  return (process.env.AUTH_WALLPAPER_SOURCE ?? 'bing').toLowerCase() !== 'off'
}

/**
 * Bing ships the location and the photographer in one string:
 *   "Winnats Pass, Peak District, England (© Daniel Kay/Getty Images)"
 * Split it so the caption can be read on its own and the credit set smaller.
 */
function splitCopyright(raw: string): { caption: string; credit: string } {
  const match = raw.match(/^(.*?)\s*\((©[^)]*)\)\s*$/)
  if (!match) return { caption: raw.trim(), credit: '' }
  return { caption: match[1].trim(), credit: match[2].trim() }
}

/** `20260918` → `2026-09-18`. */
function parseStartDate(raw: string | undefined): string | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function toWallpaper(image: BingImage, index: number): Wallpaper | null {
  const base = image.urlbase
  if (!base) return null
  const { caption, credit } = splitCopyright(image.copyright ?? '')
  return {
    id: image.hsh || image.startdate || `bing-${index}`,
    url: `${ORIGIN}${base}_1920x1080.jpg`,
    thumbUrl: `${ORIGIN}${base}_400x240.jpg`,
    // A neutral deep wash: we cannot know the photo's palette up front, and a
    // tinted guess would flash the wrong colour before the image decodes.
    gradient:
      'radial-gradient(120% 90% at 20% 15%, oklch(0.34 0.05 258) 0%, transparent 60%), linear-gradient(165deg, oklch(0.24 0.04 258) 0%, oklch(0.15 0.03 258) 100%)',
    title: image.title?.trim() || caption || 'Photo of the day',
    caption,
    credit,
    link: image.copyrightlink ?? null,
    date: parseStartDate(image.startdate),
  }
}

/**
 * Returns the current photo set, memoised for six hours.
 *
 * On any failure it returns an empty array rather than throwing — the route
 * then falls back to the built-in scenes.
 */
export async function getBingWallpapers(): Promise<Wallpaper[]> {
  if (!isBingSourceEnabled()) return []

  if (cache && Date.now() - cache.at < CACHE_TTL_MS && cache.images.length > 0) {
    return cache.images
  }

  const market = process.env.AUTH_WALLPAPER_MARKET || 'en-US'
  const url = `${ARCHIVE_URL}?format=js&idx=0&n=${COUNT}&mkt=${encodeURIComponent(market)}`

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
      // Our own memo above is the cache of record; Next's fetch cache would
      // otherwise pin this into the build output.
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Bing archive responded ${res.status}`)

    const body = (await res.json()) as { images?: BingImage[] }
    const images = (body.images ?? [])
      .map(toWallpaper)
      .filter((w): w is Wallpaper => w !== null)

    if (images.length === 0) throw new Error('Bing archive returned no usable images')

    cache = { at: Date.now(), images }
    return images
  } catch (error) {
    console.warn('[wallpaper] Bing source unavailable, using built-in scenes:', error)
    // Serve a stale memo if we have one — an expired photo beats no photo.
    return cache?.images ?? []
  }
}
