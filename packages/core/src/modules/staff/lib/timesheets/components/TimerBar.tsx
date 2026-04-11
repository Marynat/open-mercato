"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { getProjectColor } from '@open-mercato/core/modules/staff/lib/timesheetUtils'

type ProjectRow = { id: string; name: string; code: string | null; color?: string | null }

type Props = {
  staffMemberId: string
  projects: ProjectRow[]
  onTimerStopped: (projectId: string, dateKey: string, durationMinutes: number) => void
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TimerBar({ staffMemberId, projects, onTimerStopped }: Props) {
  const t = useT()

  const [description, setDescription] = React.useState('')
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('')
  const [isProjectOpen, setIsProjectOpen] = React.useState(false)
  const [runningEntryId, setRunningEntryId] = React.useState<string | null>(null)
  const [runningProjectId, setRunningProjectId] = React.useState<string | null>(null)
  const [startedAt, setStartedAt] = React.useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
  const [isStarting, setIsStarting] = React.useState(false)
  const [isStopping, setIsStopping] = React.useState(false)
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const projectDropdownRef = React.useRef<HTMLDivElement>(null)

  const isRunning = runningEntryId !== null

  // Detect running timer on mount
  React.useEffect(() => {
    if (!staffMemberId) return
    let cancelled = false
    void (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const res = await readApiResultOrThrow<{ items?: Array<Record<string, unknown>> }>(
          `/api/staff/timesheets/time-entries?staffMemberId=${staffMemberId}&from=${today}&to=${today}&pageSize=100`,
          undefined,
          { errorMessage: '', fallback: { items: [] } },
        )
        if (cancelled) return
        const items = Array.isArray(res.items) ? res.items : []
        const running = items.find((item) => item.started_at != null && item.ended_at == null)
        if (running && typeof running.id === 'string') {
          const projectId = typeof running.time_project_id === 'string' ? running.time_project_id : null
          const startedAtStr = String(running.started_at)
          const startedAtDate = new Date(startedAtStr)
          setRunningEntryId(running.id)
          setRunningProjectId(projectId)
          setSelectedProjectId(projectId ?? '')
          setStartedAt(startedAtDate)
          setElapsedSeconds(Math.floor((Date.now() - startedAtDate.getTime()) / 1000))
          if (typeof running.notes === 'string') setDescription(running.notes)
        }
      } catch {
        // silent — non-critical
      }
    })()
    return () => { cancelled = true }
  }, [staffMemberId])

  // Tick interval when running
  React.useEffect(() => {
    if (isRunning && startedAt) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAt.getTime()) / 1000))
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, startedAt])

  // Close project dropdown on outside click
  React.useEffect(() => {
    if (!isProjectOpen) return
    const handler = (e: PointerEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [isProjectOpen])

  const handlePlay = React.useCallback(async () => {
    if (isStarting || isRunning) return
    setIsStarting(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const createRes = await apiCall('/api/staff/timesheets/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffMemberId,
          timeProjectId: selectedProjectId || null,
          date: today,
          durationMinutes: 0,
          source: 'timer',
          notes: description.trim() || null,
        }),
      })
      if (!createRes.ok) throw new Error('Failed to create entry')
      const createBody = (await createRes.response.json()) as { id?: string }
      const entryId = createBody.id
      if (!entryId) throw new Error('No entry id')

      const startRes = await apiCall(`/api/staff/timesheets/time-entries/${entryId}/timer-start`, {
        method: 'POST',
      })
      if (!startRes.ok) throw new Error('Failed to start timer')

      const now = new Date()
      setRunningEntryId(entryId)
      setRunningProjectId(selectedProjectId || null)
      setStartedAt(now)
      setElapsedSeconds(0)
    } catch {
      flash(t('staff.timesheets.my.errors.save', 'Failed to save timesheets.'), 'error')
    } finally {
      setIsStarting(false)
    }
  }, [isStarting, isRunning, staffMemberId, selectedProjectId, description, t])

  const handleStop = React.useCallback(async () => {
    if (isStopping || !runningEntryId || !runningProjectId) return
    setIsStopping(true)
    try {
      const stopRes = await apiCall(`/api/staff/timesheets/time-entries/${runningEntryId}/timer-stop`, {
        method: 'POST',
      })
      if (!stopRes.ok) throw new Error('Failed to stop timer')
      const stopBody = (await stopRes.response.json()) as { durationMinutes?: number }
      const durationMinutes = stopBody.durationMinutes ?? elapsedSeconds / 60

      const today = new Date().toISOString().slice(0, 10)
      onTimerStopped(runningProjectId, today, Math.round(durationMinutes))

      setRunningEntryId(null)
      setRunningProjectId(null)
      setStartedAt(null)
      setElapsedSeconds(0)
      setDescription('')
    } catch {
      flash(t('staff.timesheets.my.errors.save', 'Failed to save timesheets.'), 'error')
    } finally {
      setIsStopping(false)
    }
  }, [isStopping, runningEntryId, runningProjectId, elapsedSeconds, onTimerStopped, t])

  const selectedProject = projects.find((p) => p.id === (runningProjectId ?? selectedProjectId))
  const selectedProjectIndex = selectedProject ? projects.indexOf(selectedProject) : -1

  const canStart = !!selectedProjectId

  return (
    <div className="mb-4 flex flex-col gap-1">
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${isRunning ? 'border-primary/30 bg-primary/5' : 'bg-card'}`}>
      <input
        type="text"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        placeholder={t('staff.timesheets.my.timer.placeholder', 'What are you working on?')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isRunning}
        onKeyDown={(e) => { if (e.key === 'Enter' && !isRunning) void handlePlay() }}
      />

      {/* Project selector */}
      <div ref={projectDropdownRef} className="relative shrink-0">
        <Button
          type="button"
          variant="outline"
          disabled={isRunning}
          onClick={() => setIsProjectOpen((v) => !v)}
          className="h-auto gap-1.5 px-2 py-1 text-xs hover:bg-muted/50"
        >
          {selectedProject ? (
            <>
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getProjectColor(selectedProjectIndex, selectedProject.color) }}
              />
              <span className="max-w-[120px] truncate">{selectedProject.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('staff.timesheets.my.timer.noProject', 'No project')}</span>
          )}
          <span className="ml-0.5 text-muted-foreground">▾</span>
        </Button>
        {isProjectOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border bg-popover shadow-md">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
              onClick={() => { setSelectedProjectId(''); setIsProjectOpen(false) }}
            >
              {t('staff.timesheets.my.timer.noProject', 'No project')}
            </Button>
            {projects.map((p, i) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
                onClick={() => { setSelectedProjectId(p.id); setIsProjectOpen(false) }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getProjectColor(i, p.color) }} />
                <span className="truncate">{p.name}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Play / Stop */}
      {isRunning ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => void handleStop()}
          disabled={isStopping}
          aria-label={t('staff.timesheets.my.timer.stop', 'Stop Timer')}
        >
          ■ {t('staff.timesheets.my.timer.stop', 'Stop')}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={() => void handlePlay()}
          disabled={isStarting || !canStart}
          aria-label={t('staff.timesheets.my.timer.start', 'Start Timer')}
          title={!canStart ? t('staff.timesheets.my.timer.selectProjectHint', 'Select a project to start the timer') : undefined}
        >
          ▶ {t('staff.timesheets.my.timer.start', 'Start')}
        </Button>
      )}

      {/* Elapsed */}
      <span className={`w-20 shrink-0 text-right font-mono text-sm tabular-nums ${isRunning ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
        {formatElapsed(elapsedSeconds)}
      </span>
      </div>
      {!isRunning && !canStart && (
        <p className="px-1 text-xs text-muted-foreground">
          {t('staff.timesheets.my.timer.selectProjectHint', 'Select a project to start the timer')}
        </p>
      )}
    </div>
  )
}
