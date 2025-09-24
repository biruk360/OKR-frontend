import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date utilities
export function formatDate(date: Date | string, formatStr: string = 'MMM dd, yyyy') {
  return format(new Date(date), formatStr)
}

export function formatRelativeTime(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function isDateInRange(date: Date, startDate: Date, endDate: Date) {
  const checkDate = startOfDay(new Date(date))
  const start = startOfDay(startDate)
  const end = endOfDay(endDate)
  
  return isAfter(checkDate, start) && isBefore(checkDate, end)
}

// Progress calculation utilities
export function calculateProgress(current: number, target: number, start: number = 0): number {
  if (target === start) return 0
  const progress = ((current - start) / (target - start)) * 100
  return Math.min(Math.max(progress, 0), 100)
}

export function getProgressColor(progress: number): string {
  if (progress >= 80) return 'text-success-600 bg-success-100'
  if (progress >= 60) return 'text-primary-600 bg-primary-100'
  if (progress >= 40) return 'text-warning-600 bg-warning-100'
  return 'text-danger-600 bg-danger-100'
}

export function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'ON_TRACK':
      return 'text-success-600 bg-success-100'
    case 'AT_RISK':
      return 'text-warning-600 bg-warning-100'
    case 'OFF_TRACK':
      return 'text-danger-600 bg-danger-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

// String utilities
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Validation utilities
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

// Array utilities
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const group = String(item[key])
    groups[group] = groups[group] || []
    groups[group].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

export function sortBy<T>(array: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  })
}

// Permission utilities
export function hasPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = {
    'EMPLOYEE': 1,
    'DEPARTMENT_LEAD': 2,
    'EXECUTIVE': 3,
    'ADMIN': 4
  }
  
  return (roleHierarchy[userRole as keyof typeof roleHierarchy] || 0) >= 
         (roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0)
}

export function canEditObjective(userRole: string, objectiveLevel: string): boolean {
  switch (objectiveLevel) {
    case 'COMPANY':
      return ['ADMIN', 'EXECUTIVE'].includes(userRole)
    case 'DEPARTMENT':
      return ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(userRole)
    case 'INDIVIDUAL':
      return true // All users can edit their own individual objectives
    default:
      return false
  }
}

// Error handling utilities
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unknown error occurred'
}

// Local storage utilities
export function getFromLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  
  try {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch {
    return defaultValue
  }
}

export function setToLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently fail if localStorage is not available
  }
}
