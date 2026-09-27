/**
 * Link preview (LPV) — shared contract between `GET /api/link-preview`, the
 * `useLinkPreview` hook and `components/shared/LinkPreview`. Pure types; safe
 * to import from client code.
 */
export interface LinkPreviewData {
  /** The requested URL, normalised (fragment removed). */
  url: string
  /** The URL after redirects (equals `url` when the fetch failed). */
  finalUrl: string
  /** Hostname of `finalUrl` without a leading `www.`. */
  domain: string
  /** `og:site_name`, else `domain`. */
  siteName: string
  title: string | null
  description: string | null
  /** Absolute `https:` thumbnail URL, or null (LPV-7: no mixed content). */
  image: string | null
  /** Absolute `https:` favicon URL, or null (the UI shows a globe). */
  favicon: string | null
  /** False when the page could not be fetched/parsed — the UI renders the fallback row (LPV-3). */
  ok: boolean
}

/** What `parsePreviewMeta` extracts from a page. */
export type ParsedPreviewMeta = Pick<
  LinkPreviewData,
  'domain' | 'siteName' | 'title' | 'description' | 'image' | 'favicon'
>
