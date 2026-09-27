import type { Letter, LetterEnclosure, LetterTypeDef, User } from '@prisma/client'

type UserBrief = Pick<User, 'id' | 'name' | 'avatar'>
type LetterTypeBrief = Pick<LetterTypeDef, 'id' | 'code' | 'name'>

export interface LetterListItem extends Letter {
  preparedBy: UserBrief
  signatory: UserBrief | null
  letterTypeDef?: LetterTypeBrief | null
  _count?: { enclosures: number }
}

export interface LetterEnclosureWithUploader extends LetterEnclosure {
  uploadedBy: UserBrief
}

export interface LetterDetail extends Letter {
  preparedBy: UserBrief & { email: string }
  signatory: (UserBrief & { email: string }) | null
  letterTypeDef?: LetterTypeBrief | null
  enclosures: LetterEnclosureWithUploader[]
}

export interface OdooContact {
  odoo_partner_id: string
  display_name: string
  address?: string
}

/** A letter body template as returned by GET /api/letters/templates. */
export interface LetterTemplateRecord {
  id: string
  name: string
  /** LetterTypeDef.code (CL / OF / GR / custom). */
  letterType: string
  language: 'en' | 'am' | string
  bodyHtml: string
  isActive: boolean
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  updatedBy: { id: string; name: string } | null
}

export interface LetterTemplateDraft {
  name: string
  letterType: string
  language: 'en' | 'am'
  bodyHtml: string
}

/** FR-16 report payload (shape owned by lib/letter-reports.ts). */
export type { LetterReport } from '@/lib/letter-reports'
