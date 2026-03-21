/**
 * Utility functions for timeframe management
 */

export type TimeframeType = 'MONTHLY' | 'QUARTERLY' | 'SIX_MONTH' | 'YEARLY'

export interface TimeframeDateRange {
  startDate: Date
  endDate: Date
  name: string
}

/**
 * Calculate date range based on timeframe type and base date
 */
export function calculateTimeframeDates(
  type: TimeframeType,
  baseDate: Date = new Date(),
  period?: number
): TimeframeDateRange {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  let startDate: Date
  let endDate: Date
  let name: string

  switch (type) {
    case 'MONTHLY':
      startDate = new Date(year, month, 1)
      endDate = new Date(year, month + 1, 0) // Last day of the month
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December']
      name = `${monthNames[month]} ${year}`
      break

    case 'QUARTERLY':
      const quarter = Math.floor(month / 3) // 0-3
      const quarterStartMonth = quarter * 3
      startDate = new Date(year, quarterStartMonth, 1)
      endDate = new Date(year, quarterStartMonth + 3, 0) // Last day of the quarter
      name = `Q${quarter + 1} ${year}`
      break

    case 'SIX_MONTH':
      const half = Math.floor(month / 6) // 0 or 1
      const halfStartMonth = half * 6
      startDate = new Date(year, halfStartMonth, 1)
      endDate = new Date(year, halfStartMonth + 6, 0) // Last day of the half
      name = `H${half + 1} ${year}`
      break

    case 'YEARLY':
      startDate = new Date(year, 0, 1) // January 1
      endDate = new Date(year, 11, 31) // December 31
      name = `${year}`
      break

    default:
      throw new Error(`Unknown timeframe type: ${type}`)
  }

  return { startDate, endDate, name }
}

/**
 * Generate multiple timeframes of a given type
 */
export function generateTimeframes(
  type: TimeframeType,
  count: number = 4,
  startFrom: Date = new Date()
): TimeframeDateRange[] {
  const timeframes: TimeframeDateRange[] = []
  let currentDate = new Date(startFrom)

  for (let i = 0; i < count; i++) {
    const timeframe = calculateTimeframeDates(type, currentDate)
    timeframes.push(timeframe)

    // Move to next period
    switch (type) {
      case 'MONTHLY':
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        break
      case 'QUARTERLY':
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 1)
        break
      case 'SIX_MONTH':
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 6, 1)
        break
      case 'YEARLY':
        currentDate = new Date(currentDate.getFullYear() + 1, 0, 1)
        break
    }
  }

  return timeframes
}

/**
 * Get display label for timeframe type
 */
export function getTimeframeTypeLabel(type: TimeframeType): string {
  switch (type) {
    case 'MONTHLY':
      return 'Monthly'
    case 'QUARTERLY':
      return 'Quarterly'
    case 'SIX_MONTH':
      return '6-Month'
    case 'YEARLY':
      return 'Yearly'
    default:
      return type
  }
}

/**
 * Format timeframe for display
 */
export function formatTimeframeDisplay(timeframe: {
  name: string
  type: string
  startDate: Date | string
  endDate: Date | string
}): string {
  const start = new Date(timeframe.startDate)
  const end = new Date(timeframe.endDate)
  const typeLabel = getTimeframeTypeLabel(timeframe.type as TimeframeType)
  
  return `${timeframe.name} (${typeLabel}) - ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`
}

