'use client'

/**
 * Components-level entry to the CON-5 alignment trail, so feature modules (e.g.
 * the Filters quick views) can show it without importing `features/okr-links`
 * directly ("features never import other features").
 */
import { AlignmentTrail, type AlignmentTrailProps } from '@/features/okr-links'

export type ObjectiveAlignmentTrailProps = Omit<AlignmentTrailProps, 'entityType'>

export default function ObjectiveAlignmentTrail(props: ObjectiveAlignmentTrailProps) {
  return <AlignmentTrail entityType="OBJECTIVE" {...props} />
}
