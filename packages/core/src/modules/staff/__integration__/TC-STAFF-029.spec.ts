import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createTimeProjectFixture,
  assignEmployeeToProjectFixture,
  createTimeEntryFixture,
  deleteStaffEntityIfExists,
  getOrCreateSelfStaffMemberFixture,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-029: View Type Toggle (Timesheet | List view)
 * Verifies that:
 * - [Timesheet] and [List view] toggle buttons are visible in the toolbar.
 * - Clicking [List view] switches the view and reflects ?viewType=list in the URL.
 * - In list view, day group headers are rendered (Today / Yesterday / formatted date).
 * - Each entry row is visible with a project color dot.
 * - Switching back to [Timesheet] restores the grid.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 1 Step 3
 */
test.describe('TC-STAFF-029: View Type Toggle', () => {
  test('should switch between timesheet grid and list view', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA List View Project ${stamp}`,
      code: `QALV-${stamp}`,
    })
    await assignEmployeeToProjectFixture(request, admin, projectId, memberId)

    // Create an entry for today so it appears in the list view
    const today = new Date().toISOString().slice(0, 10)
    const entryId = await createTimeEntryFixture(request, admin, {
      staffMemberId: memberId,
      timeProjectId: projectId,
      date: today,
      durationMinutes: 120,
    })

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Both toggle buttons must be present in the toolbar
      const timesheetBtn = page.getByRole('button', { name: 'Timesheet', exact: true })
      const listViewBtn = page.getByRole('button', { name: 'List view', exact: true })
      await expect(timesheetBtn).toBeVisible()
      await expect(listViewBtn).toBeVisible()

      // Default view is "timesheet" — table must be visible
      await expect(page.getByRole('table')).toBeVisible()

      // Switch to List view
      await listViewBtn.click()
      await page.waitForLoadState('domcontentloaded')

      // URL must contain ?viewType=list
      await expect(page).toHaveURL(/viewType=list/, { timeout: 5_000 })

      // Table must be gone in list view
      await expect(page.getByRole('table')).toHaveCount(0)

      // A day group header must appear (Today or the formatted date)
      // The header is a div.rounded-lg.border containing the day label
      const dayHeader = page.locator('.rounded-lg.border .font-semibold').first()
      await expect(dayHeader).toBeVisible({ timeout: 10_000 })

      // Project color dot must be visible in the entry row
      const colorDot = page.locator('span.rounded-full[style*="background-color"]').first()
      await expect(colorDot).toBeVisible({ timeout: 5_000 })

      // Project name must appear in the entry row
      await expect(page.getByText(`QA List View Project ${stamp}`).first()).toBeVisible()

      // Switch back to Timesheet view
      await timesheetBtn.click()
      await page.waitForLoadState('domcontentloaded')

      // URL must contain ?viewType=timesheet (or no viewType=list)
      await expect(page).not.toHaveURL(/viewType=list/, { timeout: 5_000 })

      // Grid table must be restored
      await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 })
    } finally {
      await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(entryId)}`, { token: admin }).catch(() => {})
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
