"use client"

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { CrudForm } from '@open-mercato/ui/backend/CrudForm'
import { Button } from '@open-mercato/ui/primitives/button'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import {
  buildProjectPayload,
  createProjectFormFields,
  createProjectFormGroups,
  createProjectFormSchema,
  type ProjectFormValues,
} from '@open-mercato/core/modules/staff/backend/staff/timesheets/projects/projectFormConfig'

type ProjectRow = { id: string; name: string; code: string | null; color?: string | null }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffMemberId: string
  onProjectCreated: (project: ProjectRow) => void
}

export function CreateProjectDialog({ open, onOpenChange, staffMemberId, onProjectCreated }: Props) {
  const t = useT()
  const containerRef = React.useRef<HTMLDivElement>(null)

  const formSchema = React.useMemo(() => createProjectFormSchema(), [])
  const fields = React.useMemo(() => createProjectFormFields(t), [t])
  const groups = React.useMemo(() => createProjectFormGroups(t), [t])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        const form = containerRef.current?.querySelector('form')
        form?.requestSubmit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    },
    [onOpenChange],
  )

  const handleSubmit = React.useCallback(
    async (values: ProjectFormValues) => {
      if (!values.name?.trim() || !values.code?.trim()) {
        const fieldErrors: Record<string, string> = {}
        if (!values.name?.trim()) fieldErrors.name = 'Required'
        if (!values.code?.trim()) fieldErrors.code = 'Required'
        throw createCrudFormError(
          t('staff.timesheets.projects.errors.required', 'Name and code are required.'),
          fieldErrors,
        )
      }

      const payload = buildProjectPayload(values)

      const { result: created } = await createCrud<{ id?: string }>(
        'staff/timesheets/time-projects',
        payload,
        { errorMessage: t('staff.timesheets.projects.errors.save', 'Failed to save project.') },
      )

      const newId = created?.id
      if (!newId) throw new Error('No project id returned')

      // Auto-assign the current staff member as a project member
      const assignRes = await apiCall(`/api/staff/timesheets/time-projects/${newId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffMemberId,
          status: 'active',
          assignedStartDate: new Date().toISOString().slice(0, 10),
        }),
      })
      if (!assignRes.ok) {
        throw createCrudFormError(
          t('staff.timesheets.projects.errors.assign', 'Project created but assignment failed. Please refresh and try again.'),
        )
      }

      flash(t('staff.timesheets.projects.messages.saved', 'Project saved.'), 'success')
      onProjectCreated({
        id: newId,
        name: String(values.name).trim(),
        code: values.code ? String(values.code).trim() : null,
        color: values.color ?? null,
      })
      onOpenChange(false)
    },
    [t, staffMemberId, onProjectCreated, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('staff.timesheets.projects.dialog.createTitle', 'Create Project')}
          </DialogTitle>
        </DialogHeader>
        <div ref={containerRef} onKeyDown={handleKeyDown} className="flex-1 overflow-y-auto">
          <CrudForm<ProjectFormValues>
            embedded
            hideFooterActions
            fields={fields}
            groups={groups}
            schema={formSchema}
            initialValues={{}}
            onSubmit={handleSubmit}
          />
        </div>
        <div className="flex justify-end gap-2 border-t bg-card px-6 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('staff.timesheets.my.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => containerRef.current?.querySelector('form')?.requestSubmit()}>
            {t('staff.timesheets.projects.form.actions.create', 'Create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
