/**
 * Movement Sheet (department × date) and Run Sheet (driver × date) builders.
 * These are derived views — no separate stored model for the Movement Sheet.
 */

import { prisma } from '@/lib/prisma'
import type { TripMode, Flexibility, ModeOfMovement } from '@/types/dtp'

export interface MovementSheetRow {
  stopId: string
  planId: string
  employeeId: string
  employeeName: string
  seq: number
  plannedStart: string
  plannedEnd: string // plannedStart + dwellMinutes
  dwellMinutes: number
  destinationName: string
  destinationAddress: string
  destinationLat: number | null
  destinationLng: number | null
  purposeCode: string
  reason: string
  tripMode: TripMode
  flexibility: Flexibility
  modeOfMovement: ModeOfMovement
  joiners: { id: string; name: string }[]
  trafficFlagged: boolean
  status: string
}

export interface MovementSheet {
  date: Date
  departmentId: string | null
  departmentName: string | null
  rows: MovementSheetRow[]
}

import { addMinutes } from './time'

function parseTrafficFlag(json: string | null): boolean {
  if (!json) return false
  try {
    const o = JSON.parse(json) as { flagged?: boolean }
    return !!o.flagged
  } catch {
    return false
  }
}

export async function buildMovementSheet(departmentId: string | null, date: Date): Promise<MovementSheet> {
  const dayStart = startOfUtcDay(date)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const plans = await prisma.dailyTripPlan.findMany({
    where: {
      tripDate: { gte: dayStart, lt: dayEnd },
      departmentId: departmentId ?? undefined,
      status: { notIn: ['DRAFT', 'WITHDRAWN', 'CANCELLED', 'EXPIRED', 'RETURNED'] },
      deletedAt: null,
    },
    include: {
      requester: { select: { id: true, name: true } },
      stops: { orderBy: { seq: 'asc' } },
    },
  })

  // Resolve all unique joiner ids in one query for naming.
  const joinerIds = new Set<string>()
  for (const p of plans) for (const s of p.stops) for (const j of s.withWhom.split(',').filter(Boolean)) joinerIds.add(j)
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(joinerIds) } },
    select: { id: true, name: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  const rows: MovementSheetRow[] = []
  for (const p of plans) {
    for (const s of p.stops) {
      const joiners = s.withWhom.split(',').filter(Boolean).map((id) => ({
        id,
        name: userById.get(id)?.name ?? id,
      }))
      rows.push({
        stopId: s.id,
        planId: p.id,
        employeeId: p.requester.id,
        employeeName: p.requester.name,
        seq: s.seq,
        plannedStart: s.plannedStart,
        plannedEnd: addMinutes(s.plannedStart, s.dwellMinutes),
        dwellMinutes: s.dwellMinutes,
        destinationName: s.destinationName,
        destinationAddress: s.destinationAddress,
        destinationLat: s.destinationLat,
        destinationLng: s.destinationLng,
        purposeCode: s.purposeCode,
        reason: s.reason,
        tripMode: s.tripMode as TripMode,
        flexibility: s.flexibility as Flexibility,
        modeOfMovement: ((s.modeOfMovement as ModeOfMovement | null) ?? (p.defaultModeOfMovement as ModeOfMovement)),
        joiners,
        trafficFlagged: parseTrafficFlag(s.trafficEstimate),
        status: p.status,
      })
    }
  }
  rows.sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : a.plannedStart > b.plannedStart ? 1 : 0))

  let departmentName: string | null = null
  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } })
    departmentName = dept?.name ?? null
  }
  return { date: dayStart, departmentId, departmentName, rows }
}

export interface RunSheetLeg {
  legId: string
  scheduledTime: string
  legType: 'DROPOFF' | 'RETURN_PICKUP'
  fromLabel: string
  toLabel: string
  passengers: { id: string; name: string; phone: string | null }[]
  dwellWindowMin: number | null // populated for DROPOFF when its sibling RETURN_PICKUP exists
  status: string
  tripStopId: string
}

export interface RunSheet {
  driverId: string
  driverName: string
  vehiclePlate: string | null
  date: Date
  legs: RunSheetLeg[]
}

export async function buildRunSheet(driverId: string, date: Date): Promise<RunSheet | null> {
  const dayStart = startOfUtcDay(date)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const driver = await prisma.driver.findUnique({ where: { id: driverId } })
  if (!driver) return null

  const sheet = await prisma.dailyRunSheet.findFirst({
    where: { driverId, runDate: { gte: dayStart, lt: dayEnd } },
    include: { vehicle: true },
  })

  const legs = await prisma.tripLeg.findMany({
    where: {
      driverId,
      plan: { tripDate: { gte: dayStart, lt: dayEnd } },
    },
    orderBy: { scheduledTime: 'asc' },
    include: { tripStop: true },
  })

  const passengerIds = new Set<string>()
  for (const l of legs) for (const id of l.passengerIds.split(',').filter(Boolean)) passengerIds.add(id)
  // No phone column on User; phone lives in Driver only — leave null for now.
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(passengerIds) } },
    select: { id: true, name: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  // For each DROPOFF, find a sibling RETURN_PICKUP on the same trip_stop to
  // surface the driver's free-window duration on the card.
  const returnByStop = new Map<string, typeof legs[number]>()
  for (const l of legs) if (l.legType === 'RETURN_PICKUP') returnByStop.set(l.tripStopId, l)

  const out: RunSheetLeg[] = legs.map((l) => {
    const passengers = l.passengerIds.split(',').filter(Boolean).map((id) => ({
      id,
      name: userById.get(id)?.name ?? id,
      phone: null as string | null,
    }))
    let dwellWindowMin: number | null = null
    if (l.legType === 'DROPOFF') {
      const ret = returnByStop.get(l.tripStopId)
      if (ret) dwellWindowMin = l.tripStop.dwellMinutes
    }
    return {
      legId: l.id,
      scheduledTime: l.scheduledTime,
      legType: l.legType as 'DROPOFF' | 'RETURN_PICKUP',
      fromLabel: l.fromLabel,
      toLabel: l.toLabel,
      passengers,
      dwellWindowMin,
      status: l.status,
      tripStopId: l.tripStopId,
    }
  })

  return {
    driverId,
    driverName: driver.fullName,
    vehiclePlate: sheet?.vehicle?.plate ?? null,
    date: dayStart,
    legs: out,
  }
}

export function startOfUtcDay(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}
