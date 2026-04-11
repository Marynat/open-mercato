"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { getProjectColor } from '@open-mercato/core/modules/staff/lib/timesheetUtils'

type ProjectRow = { id: string; name: string; code: string | null; color?: string | null }

type Props = {
  allAssignedProjects: ProjectRow[]
  gridProjectIds: Set<string>
  canManageProjects: boolean
  onAddProject: (project: ProjectRow) => void
  onOpenCreateDialog: () => void
}

export function AddRowDropdown({
  allAssignedProjects,
  gridProjectIds,
  canManageProjects,
  onAddProject,
  onOpenCreateDialog,
}: Props) {
  const t = useT()
  const [isOpen, setIsOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const dropdownRef = React.useRef<HTMLDivElement>(null)

  const available = allAssignedProjects.filter((p) => !gridProjectIds.has(p.id))

  const filtered = search.trim().length > 0
    ? available.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.code?.toLowerCase().includes(search.toLowerCase()) ?? false),
      )
    : available

  React.useEffect(() => {
    if (!isOpen) return
    const handler = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [isOpen])

  return (
    <div ref={dropdownRef} className="relative mt-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen((v) => !v)}
      >
        {t('staff.timesheets.my.addRow', '+ Add row')}
      </Button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-popover shadow-md">
          <div className="p-2">
            <input
              type="text"
              autoFocus
              className="w-full rounded border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              placeholder={t('staff.timesheets.my.addRow.search', 'Search projects...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && !canManageProjects && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t('staff.timesheets.my.addRow.empty', 'All projects are already in the grid.')}
              </p>
            )}
            {filtered.length === 0 && canManageProjects && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t('staff.timesheets.my.addRow.empty', 'All projects are already in the grid.')}
              </p>
            )}
            {filtered.map((project) => {
              const index = allAssignedProjects.indexOf(project)
              const color = getProjectColor(index, project.color)
              return (
                <Button
                  key={project.id}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                  onClick={() => {
                    onAddProject(project)
                    setIsOpen(false)
                    setSearch('')
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.code && (
                    <span className="shrink-0 text-xs text-muted-foreground">{project.code}</span>
                  )}
                </Button>
              )
            })}
          </div>

          {canManageProjects && (
            <div className="border-t p-1">
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-sm text-primary hover:bg-muted/50"
                onClick={() => {
                  setIsOpen(false)
                  setSearch('')
                  onOpenCreateDialog()
                }}
              >
                {t('staff.timesheets.my.addRow.createNew', '+ Create a new project')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
