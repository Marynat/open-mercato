// Pure utility functions for the My Timesheets page.
// Extracted here so they can be unit-tested without importing the React component.

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Format a year/month(0-based)/day triple to an ISO date string (YYYY-MM-DD). */
export function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/** Format a Date object to an ISO date string (YYYY-MM-DD) using local time. */
export function formatDateFromObj(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Return the Monday of the ISO week that contains the given date (local time). */
export function getMonWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sun, 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** Return true when the ISO date string falls on Saturday or Sunday. */
export function isWeekendFromKey(dateKey: string): boolean {
  const d = new Date(dateKey + 'T00:00:00').getDay()
  return d === 0 || d === 6
}

// ─── Time format helpers ──────────────────────────────────────────────────────

/**
 * Convert stored minutes to a decimal-hours display string.
 * 0 → '' (empty, so the input cell shows the placeholder).
 * 60 → '1', 90 → '1.5', 75 → '1.25'
 */
export function minutesToDecimal(minutes: number): string {
  if (minutes === 0) return ''
  const hours = minutes / 60
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Parse a decimal-hour string entered by the user into integer minutes.
 * '4' → 240, '7.5' → 450, '' → 0, negative → 0, > 24 h clamped to 1440.
 */
export function decimalToMinutes(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0
  const num = parseFloat(trimmed)
  if (isNaN(num) || num < 0) return 0
  return Math.min(Math.round(num * 60), 1440)
}

/**
 * Format stored minutes as a human-readable hours label for totals.
 * Always includes the "h" unit. Uses one decimal place when fractional.
 * 0 → '0 h', 60 → '1 h', 90 → '1.5 h', 75 → '1.3 h'
 */
export function minutesToHoursLabel(minutes: number): string {
  if (minutes === 0) return '0 h'
  const hours = minutes / 60
  const rounded = Math.round(hours * 10) / 10
  return rounded % 1 === 0 ? `${rounded} h` : `${rounded.toFixed(1)} h`
}

// ─── Week number ─────────────────────────────────────────────────────────────

/**
 * Return the ISO 8601 week number for the given date.
 * Week 1 is the week containing the first Thursday of the year (Mon-anchored).
 */
export function getISOWeekNumber(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = tmp.getUTCDay() || 7 // Sun=0→7, Mon=1, …, Sat=6
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum) // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

// ─── View mode persistence helpers ───────────────────────────────────────────

export const TIMESHEET_VIEW_MODE_KEY = 'staff.timesheets.viewMode'

/**
 * Validate a raw localStorage value into a ViewMode.
 * Returns 'monthly' for any absent or unrecognised value.
 */
export function parseViewMode(stored: string | null): 'monthly' | 'weekly' {
  return stored === 'weekly' || stored === 'monthly' ? stored : 'monthly'
}

// ─── Color helpers ────────────────────────────────────────────────────────────

export const PROJECT_AUTO_COLORS = [
  '#22C55E', '#3B82F6', '#A855F7', '#EF4444',
  '#F97316', '#EAB308', '#EC4899', '#14B8A6',
  '#6366F1', '#06B6D4', '#10B981', '#64748B',
] as const

export const PROJECT_COLOR_MAP: Record<string, string> = {
  green:   '#22C55E',
  blue:    '#3B82F6',
  purple:  '#A855F7',
  red:     '#EF4444',
  orange:  '#F97316',
  yellow:  '#EAB308',
  pink:    '#EC4899',
  teal:    '#14B8A6',
  indigo:  '#6366F1',
  cyan:    '#06B6D4',
  emerald: '#10B981',
  slate:   '#64748B',
}

/**
 * Return a colour for a project. Prefers the admin-set DB colour key when
 * provided; falls back to a deterministic sequential-index auto-colour so
 * adjacent projects always get distinct colours.
 */
export function getProjectColor(index: number, dbColor?: string | null): string {
  if (dbColor && PROJECT_COLOR_MAP[dbColor]) return PROJECT_COLOR_MAP[dbColor]!
  return PROJECT_AUTO_COLORS[index % PROJECT_AUTO_COLORS.length] ?? '#64748B'
}
