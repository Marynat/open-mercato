import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { createTimeProjectFixture, assignEmployeeToProjectFixture, deleteStaffEntityIfExists } from '@open-mercato/core/helpers/integration/timesheetFixtures'

const STORAGE_KEY = 'staff.timesheets.viewMode'

/**
 * TC-STAFF-027: View Mode Persisted in localStorage
 * Verifies that the selected weekly/monthly view mode survives navigation away
 * from the page and is restored on the next visit.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Design Decisions
 */
test.describe('TC-STAFF-027: View Mode Persistence', () => {
  test('should restore weekly view after navigating away and back', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA Persist Project ${stamp}`,
      code: `QAPP-${stamp}`,
    })

    const employeeToken = await getAuthToken(request, 'employee')
    const selfRes = await apiRequest(request, 'GET', '/api/staff/team-members/self', { token: employeeToken })
    const selfBody = (await selfRes.json()) as { member?: { id?: string } }
    const employeeStaffMemberId = selfBody.member?.id ?? ''
    expect(employeeStaffMemberId.length > 0, 'Employee must have a staff member profile').toBeTruthy()

    await assignEmployeeToProjectFixture(request, admin, projectId, employeeStaffMemberId)

    try {
      await login(page, 'employee')

      // Clear any pre-existing stored preference so the test starts from a known state
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)

      // Visit the timesheets page — default should be monthly (no stored value)
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Verify monthly is the default when nothing is stored
      const storedBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
      expect(storedBefore, 'No preference stored yet before first interaction').toBeNull()

      // Switch to weekly — this should write to localStorage
      await page.getByRole('button', { name: /weekly/i }).click()
      await page.waitForTimeout(300)

      // Confirm the preference is now written
      const storedAfterToggle = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
      expect(storedAfterToggle).toBe('weekly')

      // Navigate away to a different page
      await page.goto('/backend')
      await page.waitForLoadState('domcontentloaded')

      // Navigate back to timesheets
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Weekly view must be restored — exactly 9 header columns (project + 7 days + total)
      const headerCount = await page.locator('thead th').count()
      expect(headerCount).toBe(9)

      // Weekly button should appear active (variant="default" renders with primary bg)
      // The Monthly button should be in ghost/inactive style — verify by checking header column count
      // rather than internal CSS class, which is implementation-specific
      for (const dayAbbr of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
        await expect(page.getByText(dayAbbr).first()).toBeVisible()
      }

      // Now switch back to monthly and verify it is also persisted
      await page.getByRole('button', { name: /monthly/i }).click()
      await page.waitForTimeout(300)

      const storedMonthly = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
      expect(storedMonthly).toBe('monthly')

      await page.goto('/backend')
      await page.waitForLoadState('domcontentloaded')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Monthly view restored — ≥ 30 header columns
      const monthlyHeaderCount = await page.locator('thead th').count()
      expect(monthlyHeaderCount).toBeGreaterThanOrEqual(30)
    } finally {
      // Restore neutral state so other tests are not affected
      await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY).catch(() => {})
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
    }
  })
})
