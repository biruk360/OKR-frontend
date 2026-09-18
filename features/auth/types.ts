/**
 * Types for the sign-in experience (`app/auth/signin`).
 *
 * The backdrop rotates through a set of photographs the way the Bing homepage
 * does — a different one on every visit, with its caption and credit shown in
 * the corner. `Wallpaper` is the normalised shape both the Bing source and the
 * built-in offline scenes are mapped into.
 */

export interface Wallpaper {
  /** Stable id — used to remember which photo was shown last. */
  id: string
  /**
   * Full-size photograph (1920×1080). `null` for the built-in scenes, which
   * are pure CSS and need no network at all.
   */
  url: string | null
  /** Tiny version of the same frame, shown blurred while the full one loads. */
  thumbUrl: string | null
  /**
   * Colour wash painted under the photo. It is what the viewer sees for the
   * few hundred ms before the image decodes, and it is the whole backdrop when
   * `url` is null.
   *
   * Deliberately literal oklch rather than `--ap-*` tokens: this is imagery,
   * the stand-in for a photograph, not a UI surface colour.
   */
  gradient: string
  /** Short headline, e.g. "Through the heart of the pass". */
  title: string
  /** Where the photo was taken. */
  caption: string
  /** Photographer / agency, e.g. "© Daniel Kay/Getty Images". */
  credit: string
  /** "Learn more" target, when the source provides one. */
  link: string | null
  /** ISO date the photo was featured, when known. */
  date: string | null
}

export type WallpaperSource = 'bing' | 'fallback'

export interface WallpaperPayload {
  source: WallpaperSource
  images: Wallpaper[]
}
