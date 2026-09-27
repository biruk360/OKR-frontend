/**
 * Link previews (LPV) — SERVER barrel. Pulls in Node built-ins via `./fetch`,
 * so never import this from client code. Client code imports
 * `@/lib/link-preview/extract` and `@/lib/link-preview/types` directly.
 */
export {
  getLinkPreview,
  fetchPreviewHtml,
  assertPreviewableUrl,
  createSafeLookup,
  clearLinkPreviewCache,
  LinkPreviewError,
  LINK_PREVIEW_TIMEOUT_MS,
  LINK_PREVIEW_MAX_BYTES,
  LINK_PREVIEW_MAX_REDIRECTS,
} from './fetch'
export type { LinkPreviewErrorCode, FetchPreviewHtmlResult } from './fetch'
export { isBlockedAddress } from './ip'
export { parsePreviewMeta } from './parse'
export { extractPreviewUrls } from './extract'
export type { LinkPreviewData, ParsedPreviewMeta } from './types'
