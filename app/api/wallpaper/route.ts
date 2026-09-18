import { apiSuccess } from '@/lib/api/apiResponse'
import { getBingWallpapers } from '@/features/auth/services/bing-wallpaper'
import { FALLBACK_SCENES } from '@/features/auth/services/wallpaper'
import type { WallpaperPayload } from '@/features/auth/types'

/**
 * Backdrop photos for the sign-in screen.
 *
 * Deliberately unauthenticated — it feeds the page you see *before* you have a
 * session, and it exposes nothing but public photo metadata. The upstream
 * fetch is memoised for six hours inside `getBingWallpapers()`, so a burst of
 * sign-ins costs one outbound request, not one per visitor.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const bing = await getBingWallpapers()
  const payload: WallpaperPayload =
    bing.length > 0
      ? { source: 'bing', images: bing }
      : { source: 'fallback', images: FALLBACK_SCENES }

  return apiSuccess(payload)
}
