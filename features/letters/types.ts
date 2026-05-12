import type { Letter, LetterEnclosure, User } from '@prisma/client'

type UserBrief = Pick<User, 'id' | 'name' | 'avatar'>

export interface LetterListItem extends Letter {
  preparedBy: UserBrief
  signatory: UserBrief | null
  _count?: { enclosures: number }
}

export interface LetterEnclosureWithUploader extends LetterEnclosure {
  uploadedBy: UserBrief
}

export interface LetterDetail extends Letter {
  preparedBy: UserBrief & { email: string }
  signatory: (UserBrief & { email: string }) | null
  enclosures: LetterEnclosureWithUploader[]
}

export interface OdooContact {
  odoo_partner_id: string
  display_name: string
  address?: string
}
