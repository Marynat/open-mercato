import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  assignEmployeeToProjectFixture,
  createTimeEntryFixture,
  deleteStaffEntityIfExists,
  getOrCreateSelfStaffMemberFixture,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-033: Project Color Assignment
 * Verifies that when a project has an admin-set color:
 * - The color dot in the grid row uses the DB color (#EF4444 for 'red'),
 *   not the sequential auto-color fallback.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 3 Step 7/8
 */
test.describe('TC-STAFF-033: Project Color Assignment', () => {
  test('should display the admin-set project color in the grid row', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()
    const projectName = `QA Color Project ${stamp}`
    const projectCode = `QACOL-${stamp}`

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)

    // Create project with color: 'red' (#EF4444 = rgb(239, 68, 68))
    const createRes = await apiRequest(request, 'POST', '/api/staff/timesheets/time-projects', {
      token: admin,
      data: { name: projectName, code: projectCode, color: 'red' },
    })
    expect(createRes.ok(), 'Project creation should succeed').toBeTruthy()
    const createBody = (await createRes.json()) as { id?: string }
    const projectId = createBody.id
    expect(projectId, 'Project ID should be returned').toBeTruthy()

    await assignEmployeeToProjectFixture(request, admin, projectId!, memberId)

    // Create a time entry so the project row appears in the grid
    // (grid only shows projects that have at least one entry in the current period)
    const today = new Date().toISOString().slice(0, 10)
    const entryId = await createTimeEntryFixture(request, admin, {
      staffMemberId: memberId,
      timeProjectId: projectId!,
      date: today,
      durationMinutes: 1,
    })

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Find the project row's color dot — it's a span with inline background-color style
      // The first td in the project's row contains a colored circle
      const projectRow = page.locator('tr').filter({ hasText: projectName })
      await expect(projectRow).toBeVisible({ timeout: 10_000 })

      const colorDot = projectRow.locator('span[style*="background-color"]').first()
      await expect(colorDot).toBeVisible()

      const bgColor = await colorDot.evaluate((el) => getComputedStyle(el).backgroundColor)
      // 'red' color key maps to #EF4444 = rgb(239, 68, 68)
      expect(bgColor, 'Color dot should use the DB-set red color').toBe('rgb(239, 68, 68)')
    } finally {
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-entries', entryId)
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId!)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
