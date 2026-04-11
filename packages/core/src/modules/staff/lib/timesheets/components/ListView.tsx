"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { getProjectColor, minutesToHoursLabel } from '@open-mercato/core/modules/staff/lib/timesheetUtils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type ProjectRow = { id: string; name: string; code: string | null; color?: string | null }
type CellEntry = {
  id?: string
  minutes: number
  source?: string
  startedAt?: string | null
  endedAt?: string | null
  notes?: string | null
}
type EntryMap = Record<string, Record<string, CellEntry[]>>

type ListEntry = {
  entryId: string
  projectId: string
  projectIndex: number
  minutes: number
  source: string
  startedAt: string | null
  endedAt: string | null
  notes: string | null
}

type Props = {
  projects: ProjectRow[]
  entries: EntryMap
  periodDays: string[]
  onRefresh: () => void
}

function formatHMS(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}:00`
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function ListView({ projects, entries, periodDays, onRefresh }: Props) {
  const t = useT()

  const todayKey = new Date().toISOString().slice(0, 10)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const projectIndexMap = React.useMemo(() => {
    const map: Record<string, number> = {}
    projects.forEach((p, i) => { map[p.id] = i })
    return map
  }, [projects])

  const projectMap = React.useMemo(() => {
    const map: Record<string, ProjectRow> = {}
    projects.forEach((p) => { map[p.id] = p })
    return map
  }, [projects])

  const dayGroups = React.useMemo(() => {
    const groups: Record<string, ListEntry[]> = {}
    for (const dateKey of periodDays) {
      for (const project of projects) {
        const dayEntries = entries[project.id]?.[dateKey] ?? []
        for (const entry of dayEntries) {
          if (!entry.id) continue
          if (!groups[dateKey]) groups[dateKey] = []
          groups[dateKey].push({
            entryId: entry.id,
            projectId: project.id,
            projectIndex: projectIndexMap[project.id] ?? 0,
            minutes: entry.minutes,
            source: entry.source ?? 'manual',
            startedAt: entry.startedAt ?? null,
            endedAt: entry.endedAt ?? null,
            notes: entry.notes ?? null,
          })
        }
      }
      if (groups[dateKey]) {
        groups[dateKey].sort((a, b) => {
          if (a.startedAt && b.startedAt) {
            return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
          }
          if (a.startedAt) return -1
          if (b.startedAt) return 1
          return 0
        })
      }
    }
    return [...periodDays]
      .reverse()
      .filter((d) => (groups[d]?.length ?? 0) > 0)
      .map((d) => ({ dateKey: d, items: groups[d] ?? [] }))
  }, [periodDays, projects, entries, projectIndexMap])

  const [descEdits, setDescEdits] = React.useState<Record<string, string>>({})

  const formatDayLabel = React.useCallback((dateKey: string): string => {
    if (dateKey === todayKey) return t('staff.timesheets.my.list.today', 'Today')
    if (dateKey === yesterdayKey) return t('staff.timesheets.my.list.yesterday', 'Yesterday')
    const d = new Date(dateKey + 'T00:00:00')
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  }, [t, todayKey, yesterdayKey])

  const handleDescChange = React.useCallback((entryId: string, value: string) => {
    setDescEdits((prev) => ({ ...prev, [entryId]: value }))
  }, [])

  const handleDescBlur = React.useCallback(async (entryId: string, originalNotes: string | null) => {
    const newValue = descEdits[entryId]
    if (newValue === undefined) return
    const original = originalNotes ?? ''
    if (newValue === original) return

    try {
      const res = await apiCall('/api/staff/timesheets/time-entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entryId, notes: newValue || null }),
      })
      if (!res.ok) throw new Error()
      onRefresh()
    } catch {
      flash(t('staff.timesheets.my.errors.save', 'Failed to save timesheets.'), 'error')
    }
  }, [descEdits, onRefresh, t])

  if (dayGroups.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {t('staff.timesheets.my.noEntries', 'No time entries for this period.')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {dayGroups.map(({ dateKey, items }) => {
        const dayTotal = items.reduce((s, e) => s + e.minutes, 0)
        return (
          <div key={dateKey} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
              <span className="font-semibold">{formatDayLabel(dateKey)}</span>
              <span className="font-semibold tabular-nums">{formatHMS(dayTotal)}</span>
            </div>
            <div className="divide-y">
              {items.map((entry) => {
                const project = projectMap[entry.projectId]
                const color = getProjectColor(entry.projectIndex, project?.color)
                const isTimer = entry.source === 'timer'
                const descValue = descEdits[entry.entryId] ?? (entry.notes ?? '')
                return (
                  <div key={entry.entryId} className="flex items-center gap-3 px-4 py-2.5">
                    <input
                      type="text"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                      placeholder={t('staff.timesheets.my.list.addDescription', 'Add description')}
                      value={descValue}
                      onChange={(e) => handleDescChange(entry.entryId, e.target.value)}
                      onBlur={() => void handleDescBlur(entry.entryId, entry.notes)}
                    />
                    {project && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-muted-foreground">{project.name}</span>
                      </div>
                    )}
                    <div className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {isTimer && entry.startedAt ? (
                        <span>
                          {formatTime(entry.startedAt)}
                          {entry.endedAt ? ` \u2013 ${formatTime(entry.endedAt)}` : null}
                        </span>
                      ) : (
                        <span>{minutesToHoursLabel(entry.minutes)}</span>
                      )}
                    </div>
                    <div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
                      {formatHMS(entry.minutes)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
