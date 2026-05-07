/**
 * Public types for the DTP feature module. These are the shapes the API
 * returns + a few client-only helpers.
 */

export type {
  DtpStatus,
  DtpPriority,
  ModeOfMovement,
  TripMode,
  Flexibility,
  PickupBackTo,
  LegType,
  LegStatus,
  ManagerEndorsementMode,
  DtpAction,
  TrafficEstimate,
  CoordinatorAdjustments,
} from '@/types/dtp'

export interface DtpPlanSummary {
  id: string
  requesterId: string
  departmentId: string | null
  tripDate: string
  status: string
  priority: string
  defaultModeOfMovement: string
  late: boolean
  emergency: boolean
  adjusted: boolean
  submittedAt: string | null
  decisionAt: string | null
  decisionById: string | null
  decisionNote: string | null
  managerEndorsedAt: string | null
  managerEndorsedById: string | null
  acknowledgedAt: string | null
  totalEstDurationMin: number | null
  totalEstDistanceKm: number | null
  estimatedCostEtb: number | null
  /** Populated by the list and detail endpoints (not by mutations). */
  requester?: { id: string; name: string; email: string }
  /** Populated by the list and detail endpoints when a decision was made. */
  decidedBy?: { id: string; name: string } | null
}

export interface DtpStop {
  id: string
  planId: string
  seq: number
  tripTypeId: string | null
  purposeCode: string
  destinationName: string
  destinationAddress: string
  destinationLat: number | null
  destinationLng: number | null
  destinationPlaceId: string | null
  contactPerson: string | null
  contactPhone: string | null
  plannedStart: string
  dwellMinutes: number
  flexibility: string
  tripMode: string
  modeOfMovement: string | null
  pickupBackTo: string | null
  pickupBackAddress: string | null
  pickupBackLat: number | null
  pickupBackLng: number | null
  requiresVehicle: boolean
  requiresCashAdvance: boolean
  cashAdvanceAmount: number | null
  reason: string
  expectedOutcome: string | null
  withWhom: string
  trafficEstimate: string | null
  coordinatorAdjustments: string | null
  originalSnapshot: string | null
}

export interface DtpPlanWithStops extends DtpPlanSummary {
  requester: { id: string; name: string; email: string }
  decidedBy: { id: string; name: string } | null
  stops: DtpStop[]
}

export interface DtpEventRow {
  id: string
  planId: string
  actorId: string | null
  action: string
  fromStatus: string | null
  toStatus: string | null
  payload: string | null
  createdAt: string
  actor: { id: string; name: string } | null
}

export interface DtpTripType {
  id: string
  code: string
  label: string
  icon: string | null
  color: string | null
  defaultDwellMin: number
  isActive: boolean
  sortOrder: number
}

export interface DtpDriver {
  id: string
  fullName: string
  phone: string | null
  license: string | null
  photoUrl: string | null
  userId: string | null
  defaultVehicleId: string | null
  workStart: string | null
  workEnd: string | null
  isActive: boolean
  defaultVehicle?: { id: string; plate: string } | null
  user?: { id: string; name: string; email: string } | null
}

export interface DtpVehicle {
  id: string
  plate: string
  model: string | null
  capacity: number
  defaultDriverId: string | null
  isActive: boolean
  defaultDriver?: { id: string; fullName: string } | null
}

export interface MovementSheetRow {
  stopId: string
  planId: string
  employeeId: string
  employeeName: string
  seq: number
  plannedStart: string
  plannedEnd: string
  dwellMinutes: number
  destinationName: string
  destinationAddress: string
  destinationLat: number | null
  destinationLng: number | null
  purposeCode: string
  reason: string
  tripMode: string
  flexibility: string
  modeOfMovement: string
  joiners: { id: string; name: string }[]
  trafficFlagged: boolean
  status: string
}

export interface MovementSheet {
  date: string
  departmentId: string | null
  departmentName: string | null
  rows: MovementSheetRow[]
}

export interface RunSheetLeg {
  legId: string
  scheduledTime: string
  legType: 'DROPOFF' | 'RETURN_PICKUP'
  fromLabel: string
  toLabel: string
  passengers: { id: string; name: string; phone: string | null }[]
  dwellWindowMin: number | null
  status: string
  tripStopId: string
}

export interface RunSheet {
  driverId: string
  driverName: string
  vehiclePlate: string | null
  date: string
  legs: RunSheetLeg[]
}

export interface DtpSettings {
  id: string
  submissionCutoff: string
  approvalSlaTime: string
  officeAnchorLat: number
  officeAnchorLng: number
  officeLabel: string
  workStart: string
  workEnd: string
  sameAreaRadiusM: number
  defaultTripMode: string
  trafficAware: boolean
  trafficModel: string
  trafficBufferPct: number
  optimizationEnabled: boolean
  optimizationMaxGroupSize: number
  optimizationMaxDetourMin: number
  optimizationMaxPassengersPerVehicle: number
  adjustmentRequiresAcknowledgement: boolean
  poolCoordinatorIds: string
  operationsManagerIds: string
  notifyEmail: boolean
  notifyInApp: boolean
  notifySms: boolean
  notifyTelegram: boolean
}

export interface DtpDepartmentApproval {
  id: string
  departmentId: string | null
  primaryCoordinatorId: string | null
  alternateCoordinatorId: string | null
  failoverHours: number
  managerEndorsementMode: string
}

/** Helpers for visual lists. */
export const TRIP_TYPE_DEFAULTS = [
  { code: 'MEETING', label: 'Meeting', icon: 'briefcase', defaultDwellMin: 60 },
  { code: 'PAYMENT_FOLLOWUP', label: 'Payment Followup', icon: 'banknote', defaultDwellMin: 60 },
  { code: 'LETTER_SUBMISSION', label: 'Letter Submission', icon: 'mail', defaultDwellMin: 30 },
  { code: 'CONTRACT_SIGNING', label: 'Contract Signing', icon: 'file-signature', defaultDwellMin: 60 },
  { code: 'PROJECT_VISIT', label: 'Project Visit', icon: 'map-pin', defaultDwellMin: 120 },
  { code: 'BID_SUBMISSION', label: 'Bid Submission', icon: 'file-check', defaultDwellMin: 30 },
  { code: 'BANK_VISIT', label: 'Bank Visit', icon: 'landmark', defaultDwellMin: 90 },
  { code: 'GOVERNMENT_OFFICE', label: 'Government Office', icon: 'building-2', defaultDwellMin: 180 },
  { code: 'CLIENT_PICKUP', label: 'Client Pickup', icon: 'user-round', defaultDwellMin: 30 },
  { code: 'VENDOR_VISIT', label: 'Vendor Visit', icon: 'store', defaultDwellMin: 60 },
  { code: 'TRAINING', label: 'Training', icon: 'graduation-cap', defaultDwellMin: 240 },
  { code: 'OTHER', label: 'Other', icon: 'more-horizontal', defaultDwellMin: 60 },
] as const
