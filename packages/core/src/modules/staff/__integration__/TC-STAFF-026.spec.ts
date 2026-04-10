import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createTimeProjectFixture, assignEmployeeToProjectFixture, deleteStaffEntityIfExists } from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-026: Copy Last Period Button
 * Verifies that:
 * - "Copy last month" button is visible in monthly view (plain button, not a dropdown).
 * - After switching to weekly view, the label changes to "Copy last week".
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 1 Step 1b
 */
test.describe('TC-STAFF-026: Copy Last Period Button', () => {
  test('should render the Copy button that adapts its label to the active view mode', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA Copy Project ${stamp}`,
      code: `QACP-${stamp}`,
    })

    const employeeToken = await getAuthToken(request, 'employee')
    const selfRes = await apiRequest(request, 'GET', '/api/staff/team-members/self', { token: employeeToken })
    const selfBody = (await selfRes.json()) as { member?: { id?: string } }
    const employeeStaffMemberId = selfBody.member?.id ?? ''
    expect(employeeStaffMemberId.length > 0, 'Employee must have a staff member profile').toBeTruthy()

    await assignEmployeeToProjectFixture(request, admin, projectId, employeeStaffMemberId)

    try {
      await login(page, 'employee')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Monthly view: "Copy last month" button must be visible
      const copyMonthBtn = page.getByRole('button', { name: /copy last month/i })
      await expect(copyMonthBtn).toBeVisible()

      // It must be a plain <button> — not a dropdown trigger (no aria-haspopup)
      const ariaHasPopup = await copyMonthBtn.getAttribute('aria-haspopup')
      expect(ariaHasPopup, '"Copy last month" must not be a dropdown trigger').toBeNull()

      // Switch to Weekly view
      await page.getByRole('button', { name: /weekly/i }).click()
      await page.waitForTimeout(300)

      // Label changes to "Copy last week"
      await expect(page.getByRole('button', { name: /copy last week/i })).toBeVisible()

      // "Copy last month" must no longer be present
      await expect(page.getByRole('button', { name: /copy last month/i })).toHaveCount(0)
    } finally {
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
    }
  })
})
