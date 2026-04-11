"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  getMonWeekStart,
  getISOWeekNumber,
  formatDateFromObj,
} from '@open-mercato/core/modules/staff/lib/timesheetUtils'

type Props = {
  weekStart: Date
  onSelectWeek: (monday: Date) => void
  onClose: () => void
}

const DAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

/** Build 5–6 Monday-anchored week rows covering the entire given month. */
function buildCalendarWeeks(year: number, month: number): Date[][] {
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const calStart = getMonWeekStart(firstOfMonth)

  const weeks: Date[][] = []
  let d = new Date(calStart.getFullYear(), calStart.getMonth(), calStart.getDate())

  while (d <= lastOfMonth || weeks.length === 0) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    }
    weeks.push(week)
  }

  return weeks
}

export function CalendarPicker({ weekStart, onSelectWeek }: Props) {
  const t = useT()
  const [calYear, setCalYear] = React.useState(weekStart.getFullYear())
  const [calMonth, setCalMonth] = React.useState(weekStart.getMonth())

  const weeks = React.useMemo(() => buildCalendarWeeks(calYear, calMonth), [calYear, calMonth])

  const selectedMonday = formatDateFromObj(weekStart)

  const goToPrevMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
    else setCalMonth((m) => m - 1)
  }

  const goToNextMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
    else setCalMonth((m) => m + 1)
  }

  const handleSelectThisWeek = () => {
    onSelectWeek(getMonWeekStart(new Date()))
  }

  const handleSelectLastWeek = () => {
    const prev = getMonWeekStart(new Date())
    prev.setDate(prev.getDate() - 7)
    onSelectWeek(prev)
  }

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg">
      {/* Quick links */}
      <div className="border-b px-3 py-2 space-y-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleSelectThisWeek}
        >
          {t('staff.timesheets.my.calendar.thisWeek', 'This week')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={handleSelectLastWeek}
        >
          {t('staff.timesheets.my.calendar.lastWeek', 'Last week')}
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToPrevMonth}
          aria-label="Previous month"
        >
          ◀
        </Button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={goToNextMonth}
          aria-label="Next month"
        >
          ▶
        </Button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-8 px-2 pt-2 pb-0.5">
        <div className="text-center text-xs text-muted-foreground">W</div>
        {DAY_ABBR.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="px-2 pb-2">
        {weeks.map((week) => {
          const weekMonday = week[0]!
          const weekKey = formatDateFromObj(weekMonday)
          const isSelected = weekKey === selectedMonday
          const weekNum = getISOWeekNumber(weekMonday)

          return (
            <Button
              key={weekKey}
              type="button"
              variant="ghost"
              onClick={() => onSelectWeek(new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate()))}
              className={`grid h-auto grid-cols-8 w-full rounded p-0 py-0.5 text-xs transition-colors hover:bg-accent ${
                isSelected ? 'bg-primary/10 font-semibold' : ''
              }`}
            >
              <span className="text-center text-muted-foreground">W{weekNum}</span>
              {week.map((day) => {
                const isCurrentMonth = day.getMonth() === calMonth
                return (
                  <span
                    key={day.getDate() + '-' + day.getMonth()}
                    className={`text-center ${isCurrentMonth ? '' : 'text-muted-foreground/40'}`}
                  >
                    {day.getDate()}
                  </span>
                )
              })}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
