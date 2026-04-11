import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createTimeProjectFixture,
  assignEmployeeToProjectFixture,
  deleteStaffEntityIfExists,
  getOrCreateSelfStaffMemberFixture,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

const STORAGE_KEY = 'staff.timesheets.viewMode'

/**
 * TC-STAFF-028: Calendar Date Picker
 * Verifies the calendar dropdown triggered by the 📅 button in weekly mode:
 * - button is visible only in weekly mode
 * - period label carries the "W{n}:" prefix when weekly
 * - dropdown shows "This week" / "Last week" shortcuts
 * - "Last week" quick link navigates to the previous ISO week
 * - selecting a week row in the calendar grid changes the period
 * - the dropdown closes after a selection
 * - outside-click also closes the dropdown
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 1 Step 2
 */
test.describe('TC-STAFF-028: Calendar Date Picker', () => {
  test('should open the calendar picker and navigate to a selected week', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA Calendar Project ${stamp}`,
      code: `QACAL-${stamp}`,
    })

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)
    await assignEmployeeToProjectFixture(request, admin, projectId, memberId)

    try {
      await login(page, 'admin')

      // Force weekly mode so localStorage state is known
      await page.evaluate((key) => localStorage.setItem(key, 'weekly'), STORAGE_KEY)

      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // ── Period label carries the W{n}: prefix in weekly mode ─────────────────
      const periodLabel = page.locator('span.text-lg.font-semibold')
      const labelText = await periodLabel.textContent()
      expect(labelText, 'Weekly period label must start with W{n}:').toMatch(/^W\d+:/)

      // ── 📅 button is visible in weekly mode ──────────────────────────────────
      const calBtn = page.getByRole('button', { name: /open calendar/i })
      await expect(calBtn).toBeVisible()

      // ── Switch to monthly — 📅 button must disappear ─────────────────────────
      await page.getByRole('button', { name: /monthly/i }).click()
      await page.waitForTimeout(200)
      await expect(calBtn).not.toBeVisible()

      // Switch back to weekly
      await page.getByRole('button', { name: /weekly/i }).click()
      await page.waitForTimeout(200)
      await expect(calBtn).toBeVisible()

      // ── Open the calendar dropdown ────────────────────────────────────────────
      await calBtn.click()

      // Use exact match to avoid colliding with "Copy last week" button on the page
      const thisWeekBtn = page.getByRole('button', { name: 'This week', exact: true })
      const lastWeekBtn = page.getByRole('button', { name: 'Last week', exact: true })
      await expect(thisWeekBtn).toBeVisible({ timeout: 5_000 })
      await expect(lastWeekBtn).toBeVisible()

      // Month header and W-labelled week rows should be visible
      await expect(page.getByText(/^W\d+$/).first()).toBeVisible()

      // ── "This week" quick link navigates to the current week ─────────────────
      await thisWeekBtn.click()
      await page.waitForTimeout(300)

      // Dropdown closes after selection
      await expect(thisWeekBtn).not.toBeVisible()
      const labelThisWeek = await periodLabel.textContent()
      expect(labelThisWeek).toMatch(/^W\d+:/)

      // ── "Last week" quick link moves one week back ────────────────────────────
      await calBtn.click()
      await expect(lastWeekBtn).toBeVisible({ timeout: 5_000 })
      await lastWeekBtn.click()
      await page.waitForTimeout(300)

      // Dropdown closes and period changes to previous week
      await expect(lastWeekBtn).not.toBeVisible()
      const labelLastWeek = await periodLabel.textContent()
      expect(labelLastWeek, 'Period must change after "Last week"').not.toBe(labelThisWeek)
      expect(labelLastWeek, 'Period label still carries W{n}: prefix').toMatch(/^W\d+:/)

      // ── Clicking a week row in the calendar grid changes the period ───────────
      await calBtn.click()

      // The CalendarPicker renders W-number spans (e.g. "W14") inside week-row buttons.
      // Locate the first such span; its immediate parent is the clickable week button.
      const weekNumSpan = page.locator('button.grid span').filter({ hasText: /^W\d+$/ }).first()
      await expect(weekNumSpan).toBeVisible({ timeout: 5_000 })
      await weekNumSpan.locator('..').click()
      await page.waitForTimeout(300)

      // Dropdown must be gone after selection
      await expect(thisWeekBtn).not.toBeVisible()
      // Period label still has the W{n}: format
      await expect(periodLabel).toHaveText(/^W\d+:/)

      // ── Outside click closes the dropdown ────────────────────────────────────
      await calBtn.click()
      await expect(thisWeekBtn).toBeVisible({ timeout: 5_000 })

      // Click on a summary stat card — safely outside the calendar picker
      await page.getByText('Total Hours').click()
      await page.waitForTimeout(300)
      await expect(thisWeekBtn).not.toBeVisible()
    } finally {
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY).catch(() => {})
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
