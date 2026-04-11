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
 * TC-STAFF-023: Weekly / Monthly View Toggle
 * Verifies that the view toggle switches between a 7-column weekly grid and a full-month grid.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 1 Step 1
 */
test.describe('TC-STAFF-023: Weekly / Monthly View Toggle', () => {
  test('should switch between monthly and weekly grids via the toggle buttons', async ({ page, request }) => {
    test.setTimeout(60_000)

    const adminToken = await getAuthToken(request, 'admin')
    const projectId = await createTimeProjectFixture(request, adminToken, {
      name: `QA Toggle Project ${Date.now()}`,
      code: `QAT-${Date.now()}`,
    })

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, adminToken)
    await assignEmployeeToProjectFixture(request, adminToken, projectId, memberId)

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Default is monthly — Monthly button should appear active (bg-primary style applied)
      const monthlyBtn = page.getByRole('button', { name: /monthly/i })
      const weeklyBtn = page.getByRole('button', { name: /weekly/i })
      await expect(monthlyBtn).toBeVisible()
      await expect(weeklyBtn).toBeVisible()

      // Monthly view: day header cells include day numbers up to 28+
      // Verify that there are many day columns (≥ 28 for any valid month)
      const headerCells = page.locator('thead th')
      const headerCount = await headerCells.count()
      // Monthly: 1 (project) + 28-31 (days) + 1 (Total) = 30-33
      expect(headerCount).toBeGreaterThanOrEqual(30)

      // Switch to Weekly view — wait for MON header to confirm re-render
      await weeklyBtn.click()
      await expect(page.getByText('MON').first()).toBeVisible({ timeout: 10_000 })

      // Weekly view: exactly 7 day columns + 1 project col + 1 total col = 9 headers
      const weeklyHeaderCells = page.locator('thead th')
      const weeklyHeaderCount = await weeklyHeaderCells.count()
      expect(weeklyHeaderCount).toBe(9)

      // Day abbreviations MON through SUN should be visible in the header
      for (const dayAbbr of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
        await expect(page.getByText(dayAbbr).first()).toBeVisible()
      }

      // Period label changes to a date range (contains "–" or "-")
      const periodLabel = page.locator('span.text-lg.font-semibold')
      const labelText = await periodLabel.textContent()
      expect(labelText).toMatch(/[–\-]/)

      // Switch back to Monthly view and wait for the table to re-render
      await monthlyBtn.click()
      await expect(page.locator('thead th').nth(29)).toBeVisible({ timeout: 10_000 })

      const monthlyHeaderCount = await page.locator('thead th').count()
      expect(monthlyHeaderCount).toBeGreaterThanOrEqual(30)
    } finally {
      await deleteStaffEntityIfExists(request, adminToken, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, adminToken, 'staff/team-members', memberId)
      }
    }
  })
})
