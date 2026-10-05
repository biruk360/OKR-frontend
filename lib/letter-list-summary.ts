import type { Prisma } from '@prisma/client'

/** The inbox needs metadata, never the DOCX blob or body HTML. */
export const LETTER_LIST_SUMMARY_SELECT = {
  id: true,
  referenceNumber: true,
  subject: true,
  letterType: true,
  letterTypeId: true,
  status: true,
  date: true,
  customerName: true,
  preparedBy: { select: { id: true, name: true } },
  signatory: { select: { id: true, name: true } },
  letterTypeDef: { select: { id: true, code: true, name: true } },
  _count: { select: { enclosures: true } },
} satisfies Prisma.LetterSelect
