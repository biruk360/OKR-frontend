import { User, Objective, KeyResult, Todo, Comment, Notification, Department, Timeframe } from '@prisma/client'

export type UserRole = 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE'
export type ObjectiveLevel = 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
export type ObjectiveStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED'
export type ConfidenceLevel = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'
export type TodoStatus = 'PENDING' | 'IN_PROGRESS' | 'IN_REVIEW' | 'STUCK' | 'COMPLETED' | 'CANCELLED'
export type NotificationType = 
  | 'OBJECTIVE_CREATED'
  | 'OBJECTIVE_UPDATED'
  | 'OBJECTIVE_ARCHIVED'
  | 'KEY_RESULT_UPDATED'
  | 'TODO_ASSIGNED'
  | 'TODO_COMPLETED'
  | 'COMMENT_ADDED'
  | 'MENTION'
  | 'REMINDER'

// Extended types with relationships
export interface UserWithRelations extends User {
  ownedObjectives?: ObjectiveWithRelations[]
  ownedKeyResults?: KeyResultWithRelations[]
  assignedTodos?: TodoWithRelations[]
  departmentMemberships?: DepartmentMembershipWithDepartment[]
  managerRelationships?: ManagerRelationshipWithUser[]
  directReports?: ManagerRelationshipWithUser[]
}

export interface ObjectiveWithRelations extends Objective {
  owner: User
  timeframe: Timeframe
  department?: Department
  parentObjective?: ObjectiveWithRelations
  childObjectives?: ObjectiveWithRelations[]
  keyResults?: KeyResultWithRelations[]
  comments?: CommentWithAuthor[]
  _count?: {
    keyResults: number
    childObjectives: number
  }
}

export interface KeyResultWithRelations extends KeyResult {
  owner: User
  objective: ObjectiveWithRelations
  todos: TodoWithRelations[]
  comments?: CommentWithAuthor[]
  _count?: {
    todos: number
  }
}

export interface TodoWithRelations extends Todo {
  assignee: User
  creator: User
  keyResult: KeyResultWithRelations
}

export interface CommentWithAuthor extends Comment {
  author: User
  replies?: CommentWithAuthor[]
}

export interface DepartmentMembershipWithDepartment {
  id: string
  role?: string
  joinedAt: Date
  department: Department
}

export interface ManagerRelationshipWithUser {
  id: string
  startedAt: Date
  endedAt?: Date
  manager?: User
  directReport?: User
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Form types
export type AlignmentType = 'LOOSE' | 'STRICT_DEPENDENCY'
export type RollupCalculation = 'NONE' | 'AVERAGE' | 'SUM'

export interface CreateObjectiveForm {
  title: string
  description?: string
  level: ObjectiveLevel
  ownerId: string
  timeframeId: string
  departmentId?: string
  parentObjectiveId?: string
  isPrivate?: boolean
  goalStatus?: string
  startDate?: string
  endDate?: string
  alignmentType?: AlignmentType
  rollupCalculation?: RollupCalculation
}

export interface UpdateObjectiveForm {
  title?: string
  description?: string
  ownerId?: string
  parentObjectiveId?: string
  isPrivate?: boolean
  alignmentType?: AlignmentType
  rollupCalculation?: RollupCalculation
}

export interface CreateKeyResultForm {
  title: string
  description?: string
  startValue: number
  targetValue: number
  unit: string
  ownerId: string
  objectiveId: string
  isPrivate?: boolean
}

export interface UpdateKeyResultForm {
  title?: string
  description?: string
  currentValue?: number
  confidence?: ConfidenceLevel
  isPrivate?: boolean
}

export interface CreateTodoForm {
  title: string
  description?: string
  dueDate?: Date
  assigneeId: string
  keyResultId: string
}

export interface UpdateTodoForm {
  title?: string
  description?: string
  status?: TodoStatus
  dueDate?: Date
  assigneeId?: string
}

export interface CreateCommentForm {
  content: string
  objectiveId?: string
  keyResultId?: string
  parentId?: string
}

// Dashboard types
export interface DashboardStats {
  totalObjectives: number
  activeObjectives: number
  completedObjectives: number
  totalKeyResults: number
  completedKeyResults: number
  totalTodos: number
  completedTodos: number
  averageProgress: number
}

export interface ProgressData {
  date: string
  progress: number
  objectiveId?: string
  keyResultId?: string
}

// Filter and search types
export interface ObjectiveFilters {
  level?: ObjectiveLevel[]
  status?: ObjectiveStatus[]
  ownerId?: string
  departmentId?: string
  timeframeId?: string
  search?: string
}

export interface KeyResultFilters {
  confidence?: ConfidenceLevel[]
  ownerId?: string
  objectiveId?: string
  search?: string
}

// Letter Management — see docs/letter_management_requirements.md
export type LetterType = 'COVER' | 'OFFER' | 'GUARANTEE'
export type LetterStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SENT' | 'ARCHIVED'
export type LetterDispatchMethod = 'EMAIL' | 'PRINTED' | 'COURIER'

export const LETTER_TYPE_CODE: Record<LetterType, 'CL' | 'OF' | 'GR'> = {
  COVER: 'CL',
  OFFER: 'OF',
  GUARANTEE: 'GR',
}

export const LETTER_TYPE_LABEL: Record<LetterType, string> = {
  COVER: 'Cover Letter',
  OFFER: 'Offer Letter',
  GUARANTEE: 'Guarantee Letter',
}

export const LETTER_STATUS_LABEL: Record<LetterStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  SENT: 'Sent',
  ARCHIVED: 'Archived',
}

export interface CreateLetterForm {
  subject: string
  letterType: LetterType
  date?: string
  customerName: string
  odooPartnerId?: string | null
  recipientAddress?: string
  salutation?: string
  closing?: string
  senderDepartment?: string
  signatoryId?: string | null
  bodyContent?: string
}

export type UpdateLetterForm = Partial<CreateLetterForm>

export interface LetterFilters {
  status?: LetterStatus[]
  letterType?: LetterType[]
  preparedById?: string
  signatoryId?: string
  search?: string
  mine?: boolean
  includeArchived?: boolean
}

// Real-time event types
export interface RealtimeEvent {
  type: 'objective_updated' | 'keyresult_updated' | 'todo_updated' | 'comment_added' | 'letter_updated'
  data: any
  timestamp: Date
}

// Export all Prisma types for convenience
export * from '@prisma/client'
