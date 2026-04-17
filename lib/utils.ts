import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string, formatStr: string = 'MMM dd, yyyy') {
  return format(new Date(date), formatStr)
}

export function formatRelativeTime(date: Date | string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function getProgressColor(progress: number): string {
  if (progress >= 70) return 'bg-success-500'
  if (progress >= 40) return 'bg-warning-500'
  return 'bg-danger-500'
}

export function getProgressBarClass(progress: number): string {
  if (progress >= 70) return 'bg-success-500'
  if (progress >= 40) return 'bg-warning-500'
  return 'bg-danger-500'
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
