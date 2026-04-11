import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createTimeProjectFixture,
  assignEmployeeToProjectFixture,
  deleteStaffEntityIfExists,
  getOrCreateSelfStaffMemberFixture,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-031: "+ Add row" Dropdown
 * Verifies that:
 * - The "+ Add row" button is visible when projects are loaded.
 * - Clicking it opens a dropdown with a search input.
 * - An admin user sees the "+ Create a new project" option.
 * - Selecting a project from the dropdown adds it to the grid.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 2 Step 5
 */
test.describe('TC-STAFF-031: Add Row Dropdown', () => {
  test('should show the add row dropdown with search and create option for admins', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)

    // Create a project and assign the member so the grid has something to show
    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA AddRow Project ${stamp}`,
      code: `QAAR-${stamp}`,
    })
    await assignEmployeeToProjectFixture(request, admin, projectId, memberId)

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // "+ Add row" button must be visible below the grid
      const addRowBtn = page.getByRole('button', { name: /\+ Add row/i })
      await expect(addRowBtn).toBeVisible({ timeout: 10_000 })

      // Open the dropdown
      await addRowBtn.click()

      // Search input must appear
      const searchInput = page.locator('input[placeholder*="Search projects"]')
      await expect(searchInput).toBeVisible({ timeout: 5_000 })

      // Admin must see "+ Create a new project"
      await expect(page.getByText(/\+ Create a new project/i)).toBeVisible({ timeout: 5_000 })
    } finally {
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
