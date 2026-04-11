import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  deleteStaffEntityIfExists,
  getOrCreateSelfStaffMemberFixture,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-032: Create Project Dialog from Grid
 * Verifies that:
 * - Clicking "+ Create a new project" in the Add row dropdown opens a dialog.
 * - Filling in name + code and submitting creates the project.
 * - The new project row appears in the grid immediately after creation.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 2 Step 6
 */
test.describe('TC-STAFF-032: Create Project Dialog', () => {
  test('should create a project via the inline dialog and show it in the grid', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()
    const projectName = `QA Dialog Project ${stamp}`
    const projectCode = `QDLG-${stamp}`

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)

    let createdProjectId: string | null = null

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      // Wait for page to be ready (may show "No projects" state or table)
      await page.waitForTimeout(3_000)

      // Open the Add row dropdown
      const addRowBtn = page.getByRole('button', { name: /\+ Add row/i })
      await expect(addRowBtn).toBeVisible({ timeout: 30_000 })
      await addRowBtn.click()

      // Click "+ Create a new project"
      await page.getByText(/\+ Create a new project/i).click()

      // Dialog must open with a "Create Project" title
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/Create Project/i).first()).toBeVisible()

      // Fill in name and code using placeholders (CrudForm renders labels without for/id binding)
      await page.getByPlaceholder('Project name').fill(projectName)
      await page.getByPlaceholder('PROJECT-001').fill(projectCode)

      // Submit the form
      await page.getByRole('button', { name: /Create/i }).click()

      // Dialog should close
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

      // The new project must appear in the grid
      await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 10_000 })

      // Retrieve the created project ID for cleanup
      const searchRes = await apiRequest(request, 'GET',
        `/api/staff/timesheets/time-projects?pageSize=10`,
        { token: admin },
      )
      if (searchRes.ok()) {
        const body = (await searchRes.json()) as { items?: Array<{ id?: string; code?: string }> }
        const found = (body.items ?? []).find((item) => item.code === projectCode)
        if (found?.id) createdProjectId = found.id
      }
    } finally {
      if (createdProjectId) {
        await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', createdProjectId)
      }
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
