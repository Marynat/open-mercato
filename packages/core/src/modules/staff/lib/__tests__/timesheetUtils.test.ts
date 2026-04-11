/**
 * @jest-environment node
 *
 * Unit tests for timesheet utility functions.
 *
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md
 * - Decimal hour input format (SPEC-069 §55, §551): duration_minutes stored as integer,
 *   UI converts to/from decimal hours.
 * - Monday-anchored weekly view with 7-day period.
 * - Weekend cells (Sat/Sun) are read-only.
 * - Sequential color assignment guarantees visually distinct adjacent projects.
 * - Row/day totals always show the "h" unit.
 */

import {
  getDaysInMonth,
  formatDateKey,
  formatDateFromObj,
  getMonWeekStart,
  getISOWeekNumber,
  isWeekendFromKey,
  minutesToDecimal,
  decimalToMinutes,
  minutesToHoursLabel,
  getProjectColor,
  PROJECT_AUTO_COLORS,
  parseViewMode,
  TIMESHEET_VIEW_MODE_KEY,
} from '../timesheetUtils'

// ─── getDaysInMonth ───────────────────────────────────────────────────────────

describe('getDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getDaysInMonth(2026, 0)).toBe(31)
  })

  it('returns 28 for February in a non-leap year', () => {
    expect(getDaysInMonth(2025, 1)).toBe(28)
  })

  it('returns 29 for February in a leap year', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29)
  })

  it('returns 30 for April', () => {
    expect(getDaysInMonth(2026, 3)).toBe(30)
  })

  it('returns 31 for December', () => {
    expect(getDaysInMonth(2026, 11)).toBe(31)
  })
})

// ─── formatDateKey ────────────────────────────────────────────────────────────

describe('formatDateKey', () => {
  it('formats a mid-year date with zero-padded month and day', () => {
    expect(formatDateKey(2026, 3, 10)).toBe('2026-04-10')
  })

  it('zero-pads single-digit month and day', () => {
    expect(formatDateKey(2026, 0, 1)).toBe('2026-01-01')
  })

  it('handles December (month index 11)', () => {
    expect(formatDateKey(2026, 11, 31)).toBe('2026-12-31')
  })
})

// ─── formatDateFromObj ────────────────────────────────────────────────────────

describe('formatDateFromObj', () => {
  it('formats a Date object to YYYY-MM-DD', () => {
    expect(formatDateFromObj(new Date(2026, 3, 10))).toBe('2026-04-10')
  })

  it('zero-pads single-digit month and day', () => {
    expect(formatDateFromObj(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

// ─── getMonWeekStart ──────────────────────────────────────────────────────────

describe('getMonWeekStart', () => {
  it('returns the same Monday when given a Monday', () => {
    const monday = new Date(2026, 3, 6) // Mon 6 Apr 2026
    const result = getMonWeekStart(monday)
    expect(formatDateFromObj(result)).toBe('2026-04-06')
  })

  it('returns the previous Monday when given a Wednesday', () => {
    const wednesday = new Date(2026, 3, 8) // Wed 8 Apr 2026
    const result = getMonWeekStart(wednesday)
    expect(formatDateFromObj(result)).toBe('2026-04-06')
  })

  it('returns the previous Monday when given a Sunday', () => {
    const sunday = new Date(2026, 3, 12) // Sun 12 Apr 2026
    const result = getMonWeekStart(sunday)
    expect(formatDateFromObj(result)).toBe('2026-04-06')
  })

  it('returns the previous Monday when given a Saturday', () => {
    const saturday = new Date(2026, 3, 11) // Sat 11 Apr 2026
    const result = getMonWeekStart(saturday)
    expect(formatDateFromObj(result)).toBe('2026-04-06')
  })

  it('crosses month boundary correctly (Sunday 1 Nov → Mon 26 Oct)', () => {
    const sunday = new Date(2026, 10, 1) // Sun 1 Nov 2026
    const result = getMonWeekStart(sunday)
    expect(formatDateFromObj(result)).toBe('2026-10-26')
  })

  it('returns a date with time zeroed to midnight', () => {
    const date = new Date(2026, 3, 8, 14, 30, 0)
    const result = getMonWeekStart(date)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })
})

// ─── getISOWeekNumber ─────────────────────────────────────────────────────────

describe('getISOWeekNumber', () => {
  it('returns W1 for Jan 1 2026 (Thursday — first week)', () => {
    expect(getISOWeekNumber(new Date(2026, 0, 1))).toBe(1)
  })

  it('returns W16 for Mon Apr 13 2026', () => {
    expect(getISOWeekNumber(new Date(2026, 3, 13))).toBe(16)
  })

  it('returns W16 for Sun Apr 19 2026 (same week as Apr 13)', () => {
    expect(getISOWeekNumber(new Date(2026, 3, 19))).toBe(16)
  })

  it('returns W1 for the Monday starting week 1 (Dec 29 2025 belongs to W1 of 2026)', () => {
    expect(getISOWeekNumber(new Date(2025, 11, 29))).toBe(1)
  })

  it('returns W52 for Dec 28 2026 — but actually W53 since Dec 28 is a Monday in its own final week', () => {
    // Dec 28 2026 is a Monday; its Thursday is Dec 31 → yearStart=2026-01-01
    // days diff = 364, week = ceil((364+1)/7) = ceil(52.14) = 53
    expect(getISOWeekNumber(new Date(2026, 11, 28))).toBe(53)
  })

  it('returns a positive integer for any date', () => {
    const dates = [
      new Date(2026, 0, 4),   // Jan 4
      new Date(2026, 5, 15),  // Jun 15
      new Date(2026, 11, 31), // Dec 31
    ]
    for (const d of dates) {
      const w = getISOWeekNumber(d)
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(53)
    }
  })
})

// ─── isWeekendFromKey ─────────────────────────────────────────────────────────

describe('isWeekendFromKey', () => {
  it('returns true for Saturday', () => {
    expect(isWeekendFromKey('2026-04-11')).toBe(true)
  })

  it('returns true for Sunday', () => {
    expect(isWeekendFromKey('2026-04-12')).toBe(true)
  })

  it('returns false for Monday', () => {
    expect(isWeekendFromKey('2026-04-13')).toBe(false)
  })

  it('returns false for Friday', () => {
    expect(isWeekendFromKey('2026-04-10')).toBe(false)
  })

  it('returns false for mid-week days', () => {
    expect(isWeekendFromKey('2026-04-08')).toBe(false) // Wed
    expect(isWeekendFromKey('2026-04-09')).toBe(false) // Thu
  })
})

// ─── minutesToDecimal ─────────────────────────────────────────────────────────

describe('minutesToDecimal', () => {
  it('returns empty string for 0 minutes (shows placeholder instead)', () => {
    expect(minutesToDecimal(0)).toBe('')
  })

  it('returns whole number string for exact hours', () => {
    expect(minutesToDecimal(60)).toBe('1')
    expect(minutesToDecimal(480)).toBe('8')
    expect(minutesToDecimal(1440)).toBe('24')
  })

  it('returns decimal string for fractional hours', () => {
    expect(minutesToDecimal(90)).toBe('1.5')
    expect(minutesToDecimal(450)).toBe('7.5')
    expect(minutesToDecimal(30)).toBe('0.5')
  })

  it('trims trailing zeros after decimal point', () => {
    expect(minutesToDecimal(75)).toBe('1.25')
    expect(minutesToDecimal(15)).toBe('0.25')
  })
})

// ─── decimalToMinutes ─────────────────────────────────────────────────────────

describe('decimalToMinutes', () => {
  it('returns 0 for empty string', () => {
    expect(decimalToMinutes('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(decimalToMinutes('   ')).toBe(0)
  })

  it('converts whole-hour input', () => {
    expect(decimalToMinutes('4')).toBe(240)
    expect(decimalToMinutes('8')).toBe(480)
  })

  it('converts decimal-hour input', () => {
    expect(decimalToMinutes('7.5')).toBe(450)
    expect(decimalToMinutes('0.5')).toBe(30)
    expect(decimalToMinutes('1.25')).toBe(75)
  })

  it('trims whitespace from input', () => {
    expect(decimalToMinutes('  4  ')).toBe(240)
  })

  it('returns 0 for negative input', () => {
    expect(decimalToMinutes('-1')).toBe(0)
  })

  it('returns 0 for non-numeric input', () => {
    expect(decimalToMinutes('abc')).toBe(0)
    expect(decimalToMinutes('4:30')).toBe(0) // H:MM not supported
  })

  it('clamps to 1440 minutes (24 h) maximum', () => {
    expect(decimalToMinutes('25')).toBe(1440)
    expect(decimalToMinutes('24')).toBe(1440)
  })

  it('rounds to nearest integer minute', () => {
    // 0.1 h = 6 minutes exactly
    expect(decimalToMinutes('0.1')).toBe(6)
  })
})

// ─── minutesToHoursLabel ──────────────────────────────────────────────────────

describe('minutesToHoursLabel', () => {
  it('returns "0 h" for zero', () => {
    expect(minutesToHoursLabel(0)).toBe('0 h')
  })

  it('returns whole number with unit for exact hours', () => {
    expect(minutesToHoursLabel(60)).toBe('1 h')
    expect(minutesToHoursLabel(480)).toBe('8 h')
  })

  it('returns one decimal place with unit for fractional hours', () => {
    expect(minutesToHoursLabel(90)).toBe('1.5 h')
    expect(minutesToHoursLabel(450)).toBe('7.5 h')
    expect(minutesToHoursLabel(30)).toBe('0.5 h')
  })

  it('rounds to one decimal place', () => {
    // 75 min = 1.25 h → rounds to 1.3
    expect(minutesToHoursLabel(75)).toBe('1.3 h')
    // 80 min = 1.333... h → rounds to 1.3
    expect(minutesToHoursLabel(80)).toBe('1.3 h')
  })

  it('always includes the "h" unit suffix', () => {
    expect(minutesToHoursLabel(120)).toMatch(/ h$/)
    expect(minutesToHoursLabel(90)).toMatch(/ h$/)
    expect(minutesToHoursLabel(0)).toMatch(/ h$/)
  })
})

// ─── getProjectColor ──────────────────────────────────────────────────────────

describe('getProjectColor', () => {
  it('returns the first palette colour for index 0', () => {
    expect(getProjectColor(0)).toBe(PROJECT_AUTO_COLORS[0])
  })

  it('returns the second palette colour for index 1', () => {
    expect(getProjectColor(1)).toBe(PROJECT_AUTO_COLORS[1])
  })

  it('wraps around after the last palette entry', () => {
    const paletteLength = PROJECT_AUTO_COLORS.length
    expect(getProjectColor(paletteLength)).toBe(PROJECT_AUTO_COLORS[0])
    expect(getProjectColor(paletteLength + 1)).toBe(PROJECT_AUTO_COLORS[1])
  })

  it('returns a valid hex colour string', () => {
    for (let i = 0; i < PROJECT_AUTO_COLORS.length * 2; i++) {
      expect(getProjectColor(i)).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('returns distinct colours for the first 12 consecutive indices', () => {
    const colours = Array.from({ length: 12 }, (_, i) => getProjectColor(i))
    const unique = new Set(colours)
    expect(unique.size).toBe(12)
  })
})

// ─── parseViewMode ────────────────────────────────────────────────────────────

describe('parseViewMode', () => {
  it('returns "monthly" for null (key absent from storage)', () => {
    expect(parseViewMode(null)).toBe('monthly')
  })

  it('returns "monthly" for an empty string', () => {
    expect(parseViewMode('')).toBe('monthly')
  })

  it('returns "monthly" for an unrecognised value', () => {
    expect(parseViewMode('daily')).toBe('monthly')
    expect(parseViewMode('WEEKLY')).toBe('monthly') // case-sensitive
    expect(parseViewMode('  weekly  ')).toBe('monthly') // no trim
  })

  it('returns "weekly" for the stored value "weekly"', () => {
    expect(parseViewMode('weekly')).toBe('weekly')
  })

  it('returns "monthly" for the stored value "monthly"', () => {
    expect(parseViewMode('monthly')).toBe('monthly')
  })
})

// ─── TIMESHEET_VIEW_MODE_KEY ──────────────────────────────────────────────────

describe('TIMESHEET_VIEW_MODE_KEY', () => {
  it('equals the expected storage key string', () => {
    expect(TIMESHEET_VIEW_MODE_KEY).toBe('staff.timesheets.viewMode')
  })
})
