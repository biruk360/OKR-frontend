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
