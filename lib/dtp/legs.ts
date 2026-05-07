/**
 * Leg generator. On approval, every TripStop with `requiresVehicle = true`
 * produces:
 *   - one DROPOFF leg (always)
 *   - one RETURN_PICKUP leg (only when tripMode = ROUND_TRIP)
 *
 * Travel time from origin → destination is set to a placeholder (10 min) until
 * the Distance Matrix integration ships — see TODO below. This is intentionally
 * simple: the spec's Phase-1 backbone targets correctness of leg structure and
 * the data flow into the Run Sheet, not real-time ETA.
 */

import { prisma } from '@/lib/prisma'
import { addMinutes } from './time'
import { getDtpSettings } from './settings'

const DEFAULT_TRAVEL_MIN = 10

export interface GeneratedLeg {
  legType: 'DROPOFF' | 'RETURN_PICKUP'
  fromLabel: string
  fromLat: number | null
  fromLng: number | null
  toLabel: string
  toLat: number | null
  toLng: number | null
  scheduledTime: string // HH:MM
  estimatedTrafficMin: number
  passengerIds: string
  tripStopId: string
  planId: string
}

/**
 * Build legs for an approved plan. Caller is responsible for persisting them.
 * `office` lat/lng/label come from DtpSettings.
 *
 * TODO(distance-matrix): Replace DEFAULT_TRAVEL_MIN with a real call to Google
 * Distance Matrix using `departure_time = scheduledTime` and the configured
 * traffic model. Cache results 30 min per (origin, destination, time bucket).
 */
export async function generateLegsForPlan(planId: string): Promise<GeneratedLeg[]> {
  const [plan, settings] = await Promise.all([
    prisma.dailyTripPlan.findUnique({
      where: { id: planId },
      include: {
        stops: { orderBy: { seq: 'asc' } },
      },
    }),
    getDtpSettings(),
  ])
  if (!plan) return []

  const office = {
    label: settings.officeLabel,
    lat: settings.officeAnchorLat,
    lng: settings.officeAnchorLng,
  }

  const out: GeneratedLeg[] = []
  let cursor: { label: string; lat: number | null; lng: number | null } = office

  for (let i = 0; i < plan.stops.length; i++) {
    const s = plan.stops[i]
    if (!s.requiresVehicle) continue

    const passengers = [plan.requesterId, ...s.withWhom.split(',').filter(Boolean)].join(',')

    // DROPOFF: cursor → stop, scheduled to arrive at plannedStart.
    const dropoffSchedule = addMinutes(s.plannedStart, -DEFAULT_TRAVEL_MIN)
    out.push({
      legType: 'DROPOFF',
      fromLabel: cursor.label,
      fromLat: cursor.lat,
      fromLng: cursor.lng,
      toLabel: s.destinationName,
      toLat: s.destinationLat,
      toLng: s.destinationLng,
      scheduledTime: dropoffSchedule,
      estimatedTrafficMin: DEFAULT_TRAVEL_MIN,
      passengerIds: passengers,
      tripStopId: s.id,
      planId: plan.id,
    })

    if (s.tripMode === 'ROUND_TRIP') {
      // RETURN_PICKUP: stop → pickupBackTo, at plannedStart + dwell.
      const ret = resolveReturnTarget(s, plan.stops[i + 1] ?? null, office)
      const pickupTime = addMinutes(s.plannedStart, s.dwellMinutes)
      out.push({
        legType: 'RETURN_PICKUP',
        fromLabel: s.destinationName,
        fromLat: s.destinationLat,
        fromLng: s.destinationLng,
        toLabel: ret.label,
        toLat: ret.lat,
        toLng: ret.lng,
        scheduledTime: pickupTime,
        estimatedTrafficMin: DEFAULT_TRAVEL_MIN,
        passengerIds: passengers,
        tripStopId: s.id,
        planId: plan.id,
      })
      // After a round trip the cursor is back at the return target.
      cursor = ret
    } else {
      // ONE_WAY: cursor stays at the destination — driver continues from there
      // for the next leg unless some other route logic supersedes (Phase 2).
      cursor = { label: s.destinationName, lat: s.destinationLat, lng: s.destinationLng }
    }
  }
  return out
}

function resolveReturnTarget(
  stop: { pickupBackTo: string | null; pickupBackAddress: string | null; pickupBackLat: number | null; pickupBackLng: number | null },
  next: { destinationName: string; destinationLat: number | null; destinationLng: number | null } | null,
  office: { label: string; lat: number; lng: number },
): { label: string; lat: number | null; lng: number | null } {
  switch (stop.pickupBackTo) {
    case 'NEXT_STOP':
      if (next) return { label: next.destinationName, lat: next.destinationLat, lng: next.destinationLng }
      return office
    case 'CUSTOM':
      return {
        label: stop.pickupBackAddress ?? 'Custom address',
        lat: stop.pickupBackLat,
        lng: stop.pickupBackLng,
      }
    case 'OFFICE':
    default:
      return office
  }
}

/** Replace this plan's existing legs with a freshly generated set. Used on
 * Approve and on any post-approval re-optimization trigger. */
export async function rebuildLegsForPlan(planId: string): Promise<void> {
  const legs = await generateLegsForPlan(planId)
  await prisma.$transaction([
    prisma.tripLeg.deleteMany({ where: { planId, status: 'SCHEDULED' } }),
    ...legs.map((l) => prisma.tripLeg.create({ data: { ...l } })),
  ])
}
