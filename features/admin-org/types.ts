export interface OrgPerson {
  id: string
  name: string | null
  email: string
  avatar?: string | null
  role: string
  isActive?: boolean
  manager?: {
    id: string
    name: string | null
    email: string
    avatar?: string | null
  } | null
}

export interface OrgMembership {
  membershipId: string
  role: 'HEAD' | 'MEMBER' | 'SECONDARY_MEMBER'
  isPrimary: boolean
  user: OrgPerson
}

export interface OrgDepartment {
  id: string
  name: string
  description?: string | null
  head: OrgPerson | null
  members: OrgMembership[]
  objectiveCount: number
}

export interface OrgTree {
  company: { name: string; ceo: OrgPerson | null; objectives?: any[] }
  departments: OrgDepartment[]
  unassignedUsers: OrgPerson[]
}

export interface OrgSettings {
  id: string
  companyName: string
  companyCeoUserId: string | null
  allowMatrixReporting: boolean
  allowMultipleDeptHeads: boolean
  ceo: OrgPerson | null
}

export interface OrgDiagnostics {
  usersWithoutDepartment: number
  departmentsWithoutHead: number
  departmentObjectivesMissingDepartment: number
  individualObjectivesUnaligned: number
}
