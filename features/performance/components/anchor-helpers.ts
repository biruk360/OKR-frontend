/**
 * Shared helpers for rubric anchor values.
 *
 * Anchors may be stored as a plain string (legacy/English only) or as a
 * bilingual `{ en, am }` object when an Amharic translation is present.
 */
export type AnchorValue = string | { en?: string; am?: string }

/** English text of an anchor value. */
export function anchorEn(value: AnchorValue | undefined): string {
  if (value && typeof value === 'object') return value.en ?? ''
  return value ?? ''
}

/** Amharic text of an anchor value, if present. */
export function anchorAm(value: AnchorValue | undefined): string {
  return value && typeof value === 'object' ? value.am ?? '' : ''
}

/** Persist as `{ en, am }` only when Amharic is present; plain string otherwise. */
export function buildAnchorValue(en: string, am: string): AnchorValue {
  return am.trim() ? { en, am } : en
}
