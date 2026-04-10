"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'

type ProjectRow = { id: string; name: string; code: string | null }
type CellEntry = { id?: string; minutes: number }
type EntryMap = Record<string, Record<string, CellEntry[]>>
type DirtyMap = Record<string, Record<string, CellEntry>>
type RawTextMap = Record<string, Record<string, string>>
type ViewMode = 'monthly' | 'weekly'

import {
  getDaysInMonth,
  formatDateKey,
  formatDateFromObj,
  getMonWeekStart,
  isWeekendFromKey,
  minutesToDecimal,
  decimalToMinutes,
  minutesToHoursLabel,
  getProjectColor,
  parseViewMode,
  TIMESHEET_VIEW_MODE_KEY,
} from '@open-mercato/core/modules/staff/lib/timesheetUtils'

const DAY_NAMES_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// ─── Component ───────────────────────────────────────────────────────────────

export default function MyTimesheetsPage() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()

  const now = new Date()
  const [viewMode, setViewMode] = React.useState<ViewMode>('monthly') // SSR-safe fallback; storage read in effect below
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth())
  const [weekStart, setWeekStart] = React.useState(() => getMonWeekStart(now))
  const [projects, setProjects] = React.useState<ProjectRow[]>([])
  const [entries, setEntries] = React.useState<EntryMap>({})
  const [dirty, setDirty] = React.useState<DirtyMap>({})
  const [rawText, setRawText] = React.useState<RawTextMap>({})
  const [staffMemberId, setStaffMemberId] = React.useState<string | null>(null)
  const [staffMemberMissing, setStaffMemberMissing] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSaving, setIsSaving] = React.useState(false)
  const [canManageProjects, setCanManageProjects] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiCall<{ ok: boolean; granted: string[] }>('/api/auth/feature-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ features: ['staff.timesheets.projects.manage'] }),
        })
        if (!cancelled) {
          setCanManageProjects(new Set(res.result?.granted ?? []).has('staff.timesheets.projects.manage'))
        }
      } catch {
        // default: no manage access
      }
    })()
    return () => { cancelled = true }
  }, [])

  const daysInMonth = getDaysInMonth(year, month)

  const periodDays = React.useMemo<string[]>(() => {
    if (viewMode === 'monthly') {
      return Array.from({ length: daysInMonth }, (_, i) => formatDateKey(year, month, i + 1))
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return formatDateFromObj(d)
    })
  }, [viewMode, year, month, daysInMonth, weekStart])

  const fromDate = periodDays[0] ?? ''
  const toDate = periodDays[periodDays.length - 1] ?? ''

  const periodLabel = React.useMemo(() => {
    if (viewMode === 'monthly') {
      return new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
    }
    const start = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')
    const startStr = start.toLocaleString(undefined, { month: 'short', day: 'numeric' })
    const endStr = end.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${startStr} – ${endStr}`
  }, [viewMode, year, month, fromDate, toDate])

  const goToPrev = React.useCallback(() => {
    setDirty({})
    setRawText({})
    if (viewMode === 'monthly') {
      setMonth((prev) => {
        if (prev === 0) { setYear((y) => y - 1); return 11 }
        return prev - 1
      })
    } else {
      setWeekStart((prev) => {
        const d = new Date(prev)
        d.setDate(d.getDate() - 7)
        return d
      })
    }
  }, [viewMode])

  const goToNext = React.useCallback(() => {
    setDirty({})
    setRawText({})
    if (viewMode === 'monthly') {
      setMonth((prev) => {
        if (prev === 11) { setYear((y) => y + 1); return 0 }
        return prev + 1
      })
    } else {
      setWeekStart((prev) => {
        const d = new Date(prev)
        d.setDate(d.getDate() + 7)
        return d
      })
    }
  }, [viewMode])

  React.useEffect(() => {
    setViewMode(parseViewMode(localStorage.getItem(TIMESHEET_VIEW_MODE_KEY)))
  }, [])

  const handleSetViewMode = React.useCallback((mode: ViewMode) => {
    if (mode === viewMode) return
    setDirty({})
    setRawText({})
    if (mode === 'weekly') {
      setWeekStart(getMonWeekStart(new Date(year, month, 1)))
    } else {
      setYear(weekStart.getFullYear())
      setMonth(weekStart.getMonth())
    }
    localStorage.setItem(TIMESHEET_VIEW_MODE_KEY, mode)
    setViewMode(mode)
  }, [viewMode, year, month, weekStart])

  const loadData = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const selfRes = await readApiResultOrThrow<{ member?: { id: string; displayName: string } | null }>(
        '/api/staff/team-members/self',
        undefined,
        { errorMessage: t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), fallback: { member: null } },
      )
      const memberId = selfRes.member?.id ?? null
      setStaffMemberId(memberId)
      if (!memberId) {
        setStaffMemberMissing(true)
        setProjects([])
        setEntries({})
        setIsLoading(false)
        return
      }
      setStaffMemberMissing(false)

      // Spec N+1 Mitigation — 3-query strategy:
      // Query 1: Fetch staff_time_project_members for this staff member (assigned projects)
      const assignmentsRes = await readApiResultOrThrow<{ items?: Array<Record<string, unknown>> }>(
        `/api/staff/timesheets/my-projects?pageSize=100`,
        undefined,
        { errorMessage: t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), fallback: { items: [] } },
      )
      const assignmentItems = Array.isArray(assignmentsRes.items) ? assignmentsRes.items : []
      const assignedProjectIds = assignmentItems
        .map((item) => String(item.time_project_id ?? item.timeProjectId ?? ''))
        .filter((id) => id.length > 0)

      const [projectsRes, entriesRes] = await Promise.all([
        assignedProjectIds.length > 0
          ? readApiResultOrThrow<{ items?: Array<Record<string, unknown>> }>(
              `/api/staff/timesheets/time-projects?ids=${assignedProjectIds.join(',')}&pageSize=100`,
              undefined,
              { errorMessage: t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), fallback: { items: [] } },
            )
          : Promise.resolve({ items: [] as Array<Record<string, unknown>> }),
        readApiResultOrThrow<{ items?: Array<Record<string, unknown>> }>(
          `/api/staff/timesheets/time-entries?pageSize=100&staffMemberId=${memberId}&from=${fromDate}&to=${toDate}`,
          undefined,
          { errorMessage: t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), fallback: { items: [] } },
        ),
      ])

      const projectItems = Array.isArray(projectsRes.items) ? projectsRes.items : []
      setProjects(projectItems.map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        code: typeof item.code === 'string' ? item.code : null,
      })))

      const entryItems = Array.isArray(entriesRes.items) ? entriesRes.items : []
      const map: EntryMap = {}
      for (const item of entryItems) {
        const projectId = String(item.time_project_id ?? item.timeProjectId ?? '')
        const rawDate = String(item.date ?? '')
        const dateKey = rawDate.slice(0, 10)
        const minutes = typeof item.duration_minutes === 'number'
          ? item.duration_minutes
          : typeof item.durationMinutes === 'number'
            ? item.durationMinutes
            : 0
        const entryId = String(item.id ?? '')
        if (!map[projectId]) map[projectId] = {}
        if (!map[projectId][dateKey]) map[projectId][dateKey] = []
        map[projectId][dateKey].push({ id: entryId || undefined, minutes })
      }
      setEntries(map)
      setDirty({})
      setRawText({})
    } catch (error) {
      console.error('staff.timesheets.my.load', error)
      flash(t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, toDate, t])

  React.useEffect(() => {
    void loadData()
  }, [loadData, scopeVersion])

  const handleCellChange = React.useCallback((projectId: string, dateKey: string, value: string) => {
    setRawText((prev) => {
      const projectTexts = { ...(prev[projectId] ?? {}) }
      projectTexts[dateKey] = value
      return { ...prev, [projectId]: projectTexts }
    })
  }, [])

  const handleCellBlur = React.useCallback((projectId: string, dateKey: string) => {
    const text = rawText[projectId]?.[dateKey]
    if (text === undefined) return
    const minutes = decimalToMinutes(text)
    setDirty((prev) => {
      const projectEntries: Record<string, CellEntry> = { ...(prev[projectId] ?? {}) }
      const cellEntries = entries[projectId]?.[dateKey] ?? []
      const firstId = cellEntries[0]?.id
      projectEntries[dateKey] = { id: firstId, minutes }
      return { ...prev, [projectId]: projectEntries }
    })
    setRawText((prev) => {
      const projectTexts = { ...(prev[projectId] ?? {}) }
      delete projectTexts[dateKey]
      const hasKeys = Object.keys(projectTexts).length > 0
      if (!hasKeys) {
        const next = { ...prev }
        delete next[projectId]
        return next
      }
      return { ...prev, [projectId]: projectTexts }
    })
  }, [rawText, entries])

  const getCellValue = React.useCallback((projectId: string, dateKey: string): number => {
    const dirtyCell = dirty[projectId]?.[dateKey] as CellEntry | undefined
    if (dirtyCell !== undefined) return dirtyCell.minutes
    const cellEntries = entries[projectId]?.[dateKey] ?? []
    return cellEntries.reduce((sum, e) => sum + e.minutes, 0)
  }, [dirty, entries])

  const hasChanges = Object.keys(dirty).length > 0 || Object.keys(rawText).length > 0

  const handleSave = React.useCallback(async () => {
    if (!hasChanges) return

    const confirmed = await confirm({
      title: t('staff.timesheets.my.confirm_save.title', 'Save changes?'),
      text: t('staff.timesheets.my.confirm_save.body', 'Your timesheet entries will be saved.'),
    })
    if (!confirmed) return

    setIsSaving(true)
    try {
      const bulkEntries: Array<{ id?: string; date: string; timeProjectId: string; durationMinutes: number }> = []
      for (const [projectId, dateMap] of Object.entries(dirty)) {
        for (const [dateKey, cellValue] of Object.entries(dateMap)) {
          const cell = cellValue as CellEntry
          const cellEntries = entries[projectId]?.[dateKey] ?? []
          const firstId = cell.id ?? cellEntries[0]?.id
          bulkEntries.push({
            id: firstId,
            date: dateKey,
            timeProjectId: projectId,
            durationMinutes: cell.minutes,
          })
        }
      }
      if (bulkEntries.length === 0) return

      const res = await apiCall('/api/staff/timesheets/time-entries/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: bulkEntries }),
      })
      if (!res.ok) throw new Error(await res.response.text())

      flash(t('staff.timesheets.my.saved', 'Timesheet saved.'), 'success')
      await loadData()
    } catch (error) {
      console.error('staff.timesheets.my.save', error)
      flash(t('staff.timesheets.my.errors.save', 'Failed to save timesheets.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }, [dirty, entries, hasChanges, confirm, t, loadData])

  const handleCopyLastPeriod = React.useCallback(async () => {
    if (!staffMemberId) return

    // Build index-aligned previous-period day array.
    // For weekly: -7 days is always safe.
    // For monthly: compute the previous month once to avoid Date.setMonth() overflow
    // (e.g. March 31 → setMonth(Jan) overflows to Feb 3 in non-leap years).
    const prevDays: (string | null)[] = (() => {
      if (viewMode === 'weekly') {
        return periodDays.map((dateKey) => {
          const d = new Date(dateKey + 'T00:00:00')
          d.setDate(d.getDate() - 7)
          return formatDateFromObj(d)
        })
      }
      const firstOfCurrent = new Date(periodDays[0] + 'T00:00:00')
      const prevYear = firstOfCurrent.getMonth() === 0
        ? firstOfCurrent.getFullYear() - 1
        : firstOfCurrent.getFullYear()
      const prevMonth = firstOfCurrent.getMonth() === 0 ? 11 : firstOfCurrent.getMonth() - 1
      const daysInPrev = getDaysInMonth(prevYear, prevMonth)
      return periodDays.map((dateKey) => {
        const dayNum = new Date(dateKey + 'T00:00:00').getDate()
        return dayNum <= daysInPrev ? formatDateKey(prevYear, prevMonth, dayNum) : null
      })
    })()

    const validPrevDays = prevDays.filter((d): d is string => d !== null)
    const prevFrom = validPrevDays[0] ?? ''
    const prevTo = validPrevDays[validPrevDays.length - 1] ?? ''
    if (!prevFrom || !prevTo) return

    // Only copy into rows the user can see in the current grid (finding #3).
    const currentProjectIds = new Set(projects.map((p) => p.id))

    try {
      const res = await readApiResultOrThrow<{ items?: Array<Record<string, unknown>> }>(
        `/api/staff/timesheets/time-entries?pageSize=100&staffMemberId=${staffMemberId}&from=${prevFrom}&to=${prevTo}`,
        undefined,
        { errorMessage: t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), fallback: { items: [] } },
      )

      const entryItems = Array.isArray(res.items) ? res.items : []
      setDirty((prev) => {
        const next = { ...prev }
        for (const item of entryItems) {
          const projectId = String(item.time_project_id ?? item.timeProjectId ?? '')
          const rawDate = String(item.date ?? '')
          const srcDateKey = rawDate.slice(0, 10)
          const minutes = typeof item.duration_minutes === 'number'
            ? item.duration_minutes
            : typeof item.durationMinutes === 'number'
              ? item.durationMinutes
              : 0
          if (!projectId || minutes === 0) continue

          // Skip projects not visible in the current grid (finding #3)
          if (!currentProjectIds.has(projectId)) continue

          const srcIdx = prevDays.indexOf(srcDateKey)
          if (srcIdx < 0) continue
          const targetDateKey = periodDays[srcIdx]
          if (!targetDateKey) continue

          // Only copy into empty cells — also check in-progress rawText (finding #2)
          const existingMinutes = (next[projectId]?.[targetDateKey]?.minutes)
            ?? entries[projectId]?.[targetDateKey]?.reduce((s, e) => s + e.minutes, 0)
            ?? 0
          const pendingMinutes = rawText[projectId]?.[targetDateKey] !== undefined
            ? decimalToMinutes(rawText[projectId]![targetDateKey]!)
            : 0
          if (existingMinutes > 0 || pendingMinutes > 0) continue

          if (!next[projectId]) next[projectId] = {}
          next[projectId][targetDateKey] = { minutes }
        }
        return next
      })

      flash(t('staff.timesheets.my.copiedLastPeriod', 'Copied from last period.'), 'success')
    } catch {
      flash(t('staff.timesheets.my.errors.load', 'Failed to load timesheets.'), 'error')
    }
  }, [staffMemberId, periodDays, viewMode, projects, entries, rawText, t])

  const getRowTotal = React.useCallback((projectId: string): number => {
    let total = 0
    for (const dateKey of periodDays) {
      total += getCellValue(projectId, dateKey)
    }
    return total
  }, [periodDays, getCellValue])

  const getDayTotal = React.useCallback((dateKey: string): number => {
    let total = 0
    for (const project of projects) {
      total += getCellValue(project.id, dateKey)
    }
    return total
  }, [projects, getCellValue])

  const grandTotal = React.useMemo(() => {
    let total = 0
    for (const project of projects) {
      total += getRowTotal(project.id)
    }
    return total
  }, [projects, getRowTotal])

  const workingDays = React.useMemo(() => {
    let count = 0
    for (const dateKey of periodDays) {
      if (!isWeekendFromKey(dateKey)) {
        let dayHasHours = false
        for (const project of projects) {
          if (getCellValue(project.id, dateKey) > 0) { dayHasHours = true; break }
        }
        if (dayHasHours) count++
      }
    }
    return count
  }, [periodDays, projects, getCellValue])

  const dailyAverage = React.useMemo(() => {
    if (workingDays === 0) return 0
    return grandTotal / workingDays
  }, [grandTotal, workingDays])

  if (isLoading) {
    return <Page><PageBody><LoadingMessage label={t('staff.timesheets.my.loading', 'Loading timesheets...')} /></PageBody></Page>
  }

  if (staffMemberMissing) {
    return (
      <Page>
        <PageBody>
          <div className="py-12 text-center">
            <p className="text-lg font-semibold mb-2">
              {t('staff.timesheets.my.noProfile.title', 'Set up your profile to start tracking time')}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {t('staff.timesheets.my.noProfile', 'You need a Team Member profile to track time.')}
            </p>
            <Button asChild>
              <Link href="/backend/staff/profile/create">
                {t('staff.timesheets.my.createProfile', 'Create My Profile')}
              </Link>
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }

  const copyLabel = viewMode === 'weekly'
    ? t('staff.timesheets.my.copyLastWeek', 'Copy last week')
    : t('staff.timesheets.my.copyLastMonth', 'Copy last month')

  return (
    <Page>
      <PageBody>
        {/* Summary cards */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('staff.timesheets.my.total_hours', 'Total Hours')}</p>
            <p className="text-2xl font-semibold">{minutesToHoursLabel(grandTotal)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('staff.timesheets.my.working_days', 'Working Days')}</p>
            <p className="text-2xl font-semibold">{workingDays}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('staff.timesheets.my.daily_average', 'Daily Average')}</p>
            <p className="text-2xl font-semibold">{minutesToHoursLabel(Math.round(dailyAverage))}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t('staff.timesheets.my.status', 'Status')}</p>
            <p className="text-2xl font-semibold">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                {t('staff.timesheets.my.status_open', 'Open')}
              </span>
            </p>
          </div>
        </div>

        {/* Period navigation + view toggle + save */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToPrev}>&larr;</Button>
            <span className="text-lg font-semibold min-w-[180px] text-center">{periodLabel}</span>
            <Button variant="outline" size="sm" onClick={goToNext}>&rarr;</Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'monthly' ? 'default' : 'ghost'}
                className="rounded-none"
                onClick={() => handleSetViewMode('monthly')}
              >
                {t('staff.timesheets.my.view_monthly', 'Monthly')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'weekly' ? 'default' : 'ghost'}
                className="rounded-none border-l"
                onClick={() => handleSetViewMode('weekly')}
              >
                {t('staff.timesheets.my.view_weekly', 'Weekly')}
              </Button>
            </div>
            {hasChanges && (
              <span className="text-xs text-amber-600 font-medium">
                {t('staff.timesheets.my.unsaved', 'Unsaved changes')}
              </span>
            )}
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving ? t('staff.timesheets.my.saving', 'Saving...') : t('staff.timesheets.my.save_changes', 'Save Changes')}
            </Button>
          </div>
        </div>

        {/* Grid */}
        {projects.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-lg font-semibold mb-2">
              {t('staff.timesheets.my.noProjects.title', 'No projects assigned yet')}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {canManageProjects
                ? t('staff.timesheets.my.noProjects.admin', 'Create a project and assign yourself to start tracking time.')
                : t('staff.timesheets.my.noProjects.employee', 'Ask your manager to assign you to a project.')}
            </p>
            <div className="flex items-center justify-center gap-3">
              {canManageProjects && (
                <Button asChild>
                  <Link href="/backend/staff/timesheets/projects/create">
                    {t('staff.timesheets.my.noProjects.createProject', 'Create Project')}
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href="/backend/staff/timesheets/projects">
                  {t('staff.timesheets.my.noProjects.viewProjects', 'View Projects')}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Project distribution bar */}
            {grandTotal > 0 && (
              <div className="mb-3 flex h-5 w-full overflow-hidden rounded-full">
                {projects.map((project, index) => {
                  const projectTotal = getRowTotal(project.id)
                  if (projectTotal === 0) return null
                  const pct = (projectTotal / grandTotal) * 100
                  const color = getProjectColor(index)
                  return (
                    <div
                      key={project.id}
                      className="flex items-center overflow-hidden px-2"
                      style={{ width: `${pct}%`, backgroundColor: color, minWidth: 0 }}
                      title={`${project.name}: ${minutesToHoursLabel(projectTotal)}`}
                    >
                      <span className="truncate text-xs font-medium text-white">{project.name}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className={`sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium ${viewMode === 'weekly' ? 'min-w-[240px]' : 'min-w-[200px]'}`}>
                      {t('staff.timesheets.my.project', 'Project')}
                    </th>
                    {periodDays.map((dateKey) => {
                      const dateObj = new Date(dateKey + 'T00:00:00')
                      const dayName = DAY_NAMES_SHORT[dateObj.getDay()]
                      const dayNum = dateObj.getDate()
                      const isWeekend = isWeekendFromKey(dateKey)
                      return (
                        <th
                          key={dateKey}
                          className={`py-2 text-center font-medium ${viewMode === 'weekly' ? 'px-0.5 min-w-[40px]' : 'px-1 min-w-[56px]'} ${isWeekend ? 'bg-muted/80 text-muted-foreground' : ''}`}
                        >
                          <div className="text-xs text-muted-foreground">{dayName}</div>
                          <div>{dayNum}</div>
                        </th>
                      )
                    })}
                    <th className="px-3 py-2 text-center font-medium min-w-[72px]">
                      {t('staff.timesheets.my.total', 'Total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project, index) => {
                    const color = getProjectColor(index)
                    return (
                      <tr key={project.id} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 z-10 bg-background px-3 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <div className="min-w-0">
                              <div className={`truncate font-medium ${viewMode === 'weekly' ? '' : 'max-w-[130px]'}`} title={project.name}>
                                {project.name}
                              </div>
                              {project.code && (
                                <div className="text-xs text-muted-foreground">{project.code}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        {periodDays.map((dateKey) => {
                          const isWeekend = isWeekendFromKey(dateKey)
                          const cellMinutes = getCellValue(project.id, dateKey)
                          const isDirty = dirty[project.id]?.[dateKey] !== undefined
                          return (
                            <td
                              key={dateKey}
                              className={`py-0.5 ${viewMode === 'weekly' ? 'px-2' : 'px-0.5'} ${isWeekend ? 'bg-muted/40' : ''}`}
                            >
                              {isWeekend ? (
                                <div className="w-full rounded px-1 py-1 text-center text-xs text-muted-foreground/50">
                                  -
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className={`${viewMode === 'weekly' ? 'w-12 mx-auto' : 'w-full'} block rounded border bg-background px-1 py-1 text-center text-xs transition-colors
                                    ${isDirty ? 'border-amber-400' : 'border-border'}
                                    ${cellMinutes > 0 ? 'font-bold' : ''}
                                    hover:border-muted-foreground/40 focus:border-primary focus:outline-none`}
                                  value={rawText[project.id]?.[dateKey] ?? minutesToDecimal(cellMinutes)}
                                  onChange={(e) => handleCellChange(project.id, dateKey, e.target.value)}
                                  onBlur={() => handleCellBlur(project.id, dateKey)}
                                  placeholder="0"
                                />
                              )}
                            </td>
                          )
                        })}
                        <td className="px-3 py-1.5 text-center font-semibold text-sm">
                          {minutesToHoursLabel(getRowTotal(project.id))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/50 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyLastPeriod}
                        >
                          {copyLabel}
                        </Button>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t('staff.timesheets.my.daily_total', 'Total')}
                        </span>
                      </div>
                    </td>
                    {periodDays.map((dateKey) => {
                      const isWeekend = isWeekendFromKey(dateKey)
                      const dayMinutes = getDayTotal(dateKey)
                      return (
                        <td key={dateKey} className={`px-1 py-2 text-center text-xs ${isWeekend ? 'text-muted-foreground/50' : ''}`}>
                          {isWeekend ? '-' : (dayMinutes > 0 ? minutesToHoursLabel(dayMinutes) : '-')}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center">{minutesToHoursLabel(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </PageBody>
      {ConfirmDialogElement}
    </Page>
  )
}
