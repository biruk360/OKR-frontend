/**
 * Client-safe id conventions for AI-guided creation (no Node crypto imports), so
 * the review UI can recognise generated rows, gates, clarifications, and revisions.
 */
export const AI_GUIDED_IDS = {
  rowSource: 'aisrc-',
  generationSource: 'aigen-',
  gate: 'aigate-',
  assumption: 'aiassume-',
  exclusion: 'aiexcl-',
  warning: 'aiwarn-',
  question: 'aiq-',
  change: 'aichg-',
  clarifyQuestion: 'aiclar-q-',
  clarifyAssumption: 'aiclar-a-',
  revision: 'airev-',
  revisionUndo: 'airevundo-',
} as const
