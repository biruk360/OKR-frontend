import type { Wallpaper, WallpaperPayload } from '../types'

/**
 * Built-in backdrop scenes.
 *
 * These are pure CSS — no network, no third party — so the sign-in screen is
 * never blank: they paint instantly under every photo while it decodes, and
 * they are the entire backdrop when the photo source is unreachable or turned
 * off (`AUTH_WALLPAPER_SOURCE=off`). The colours are literal oklch because
 * they stand in for photography; see the note on `Wallpaper.gradient`.
 */
export const FALLBACK_SCENES: Wallpaper[] = [
  {
    id: 'scene-dawn',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(120% 90% at 18% 12%, oklch(0.72 0.17 40) 0%, transparent 58%), radial-gradient(110% 80% at 88% 20%, oklch(0.62 0.16 330) 0%, transparent 55%), linear-gradient(160deg, oklch(0.33 0.12 285) 0%, oklch(0.19 0.08 265) 62%, oklch(0.14 0.05 260) 100%)',
    title: 'First light',
    caption: 'A quarter begins the way a morning does',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
  {
    id: 'scene-tide',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(100% 80% at 78% 18%, oklch(0.74 0.13 200) 0%, transparent 60%), radial-gradient(120% 90% at 10% 82%, oklch(0.46 0.15 245) 0%, transparent 62%), linear-gradient(155deg, oklch(0.36 0.11 232) 0%, oklch(0.20 0.07 245) 70%, oklch(0.15 0.05 250) 100%)',
    title: 'Deep current',
    caption: 'Steady progress, measured in fathoms',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
  {
    id: 'scene-canopy',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(110% 85% at 22% 78%, oklch(0.66 0.16 150) 0%, transparent 58%), radial-gradient(100% 70% at 82% 12%, oklch(0.78 0.14 120) 0%, transparent 55%), linear-gradient(165deg, oklch(0.34 0.10 165) 0%, oklch(0.20 0.06 170) 68%, oklch(0.14 0.04 175) 100%)',
    title: 'Canopy',
    caption: 'Growth compounds quietly, then all at once',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
  {
    id: 'scene-dusk',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(110% 80% at 85% 78%, oklch(0.70 0.18 20) 0%, transparent 56%), radial-gradient(120% 90% at 12% 18%, oklch(0.58 0.17 300) 0%, transparent 60%), linear-gradient(150deg, oklch(0.30 0.12 310) 0%, oklch(0.18 0.07 295) 66%, oklch(0.13 0.05 285) 100%)',
    title: 'Long shadows',
    caption: 'Every review closes on a summit',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
  {
    id: 'scene-aurora',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(90% 70% at 30% 8%, oklch(0.80 0.16 165) 0%, transparent 52%), radial-gradient(110% 80% at 72% 42%, oklch(0.60 0.18 270) 0%, transparent 58%), linear-gradient(170deg, oklch(0.26 0.09 258) 0%, oklch(0.16 0.06 258) 72%, oklch(0.12 0.04 258) 100%)',
    title: 'Aurora',
    caption: 'Alignment, visible from a long way off',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
  {
    id: 'scene-summit',
    url: null,
    thumbUrl: null,
    gradient:
      'radial-gradient(120% 90% at 50% 100%, oklch(0.78 0.10 250) 0%, transparent 55%), radial-gradient(90% 70% at 20% 10%, oklch(0.55 0.14 262) 0%, transparent 58%), linear-gradient(175deg, oklch(0.32 0.08 255) 0%, oklch(0.19 0.05 255) 70%, oklch(0.13 0.03 255) 100%)',
    title: 'Above the cloud line',
    caption: 'The objective was always the view',
    credit: 'Generated scene',
    link: null,
    date: null,
  },
]

export const FALLBACK_PAYLOAD: WallpaperPayload = {
  source: 'fallback',
  images: FALLBACK_SCENES,
}

/**
 * Loads the backdrop set for the sign-in screen.
 *
 * Never rejects and never returns an empty set — any failure (offline, source
 * disabled, malformed response) degrades to the built-in scenes, because the
 * one thing a sign-in page may not do is fail to render.
 */
export async function fetchWallpapers(signal?: AbortSignal): Promise<WallpaperPayload> {
  try {
    const res = await fetch('/api/wallpaper', { signal, cache: 'no-store' })
    if (!res.ok) return FALLBACK_PAYLOAD
    const body = (await res.json()) as { success?: boolean; data?: WallpaperPayload }
    const images = body?.data?.images
    if (!body?.success || !Array.isArray(images) || images.length === 0) return FALLBACK_PAYLOAD
    return { source: body.data?.source ?? 'fallback', images }
  } catch {
    return FALLBACK_PAYLOAD
  }
}

/**
 * Picks a starting photo that is not the one shown on the previous visit, so
 * two consecutive sign-ins never open on the same frame.
 */
export function pickStartIndex(images: Wallpaper[], lastShownId: string | null): number {
  if (images.length <= 1) return 0
  const candidates = images.map((_, i) => i).filter((i) => images[i].id !== lastShownId)
  const pool = candidates.length > 0 ? candidates : images.map((_, i) => i)
  return pool[Math.floor(Math.random() * pool.length)]
}
