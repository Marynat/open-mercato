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
 * TC-STAFF-024: Decimal Hour Input Format
 * Verifies that time entries stored as integer minutes are displayed as decimal hours
 * in the grid cells (e.g. 90 min → "1.5", 60 min → "1"), row totals use "X h" format,
 * and the cell placeholder is "0" (not "0:00").
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — §55, §551 (SPEC-069)
 */
test.describe('TC-STAFF-024: Decimal Hour Input Format', () => {
  test('should display minutes as decimal hours and show "X h" row totals', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA Decimal Project ${stamp}`,
      code: `QAD-${stamp}`,
    })

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)
    await assignEmployeeToProjectFixture(request, admin, projectId, memberId)

    // Create two entries: 90 min (→ "1.5") and 60 min (→ "1") in current month (April 2026)
    const entryIdA = await createTimeEntryFixture(request, admin, {
      staffMemberId: memberId,
      timeProjectId: projectId,
      date: '2026-04-07',
      durationMinutes: 90,
    })
    const entryIdB = await createTimeEntryFixture(request, admin, {
      staffMemberId: memberId,
      timeProjectId: projectId,
      date: '2026-04-08',
      durationMinutes: 60,
    })

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Decimal values must appear in cells: "1.5" for 90 min, "1" for 60 min.
      // Wait for at least one cell to be non-empty then scan input values.
      const inputs = page.locator('input[inputmode="decimal"]')
      await expect(inputs.first()).toBeVisible({ timeout: 15_000 })

      // Collect all cell values and assert the expected decimals are present
      const cellValues: string[] = []
      const inputCount = await inputs.count()
      for (let i = 0; i < inputCount; i++) {
        cellValues.push(await inputs.nth(i).inputValue())
      }
      expect(cellValues, 'Expected cell value "1.5" (90 min) to appear in grid').toContain('1.5')
      expect(cellValues, 'Expected cell value "1" (60 min) to appear in grid').toContain('1')

      // Row total must show "2.5 h" (90 + 60 = 150 min = 2.5 h)
      await expect(page.getByText('2.5 h').first()).toBeVisible()

      // No cell should display H:MM format (colon in numeric context)
      for (let i = 0; i < inputCount; i++) {
        const val = await inputs.nth(i).inputValue()
        if (val.length > 0) {
          expect(val, `Cell value "${val}" must not contain a colon`).not.toContain(':')
        }
      }

      // All empty cells should have placeholder "0" (not "0:00")
      for (let i = 0; i < inputCount; i++) {
        const placeholder = await inputs.nth(i).getAttribute('placeholder')
        if (placeholder !== null) {
          expect(placeholder, 'Empty cell placeholder must be "0"').toBe('0')
        }
      }
    } finally {
      await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(entryIdA)}`, { token: admin }).catch(() => {})
      await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(entryIdB)}`, { token: admin }).catch(() => {})
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
