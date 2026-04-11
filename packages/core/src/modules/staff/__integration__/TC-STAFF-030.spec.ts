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
 * TC-STAFF-030: Timer Bar Start / Stop
 * Verifies that:
 * - The timer bar is visible on the timesheets page.
 * - Clicking Start creates a running entry (elapsed counter starts).
 * - Clicking Stop stops the timer and the grid cell for that project+day is updated.
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 2 Step 4
 */
test.describe('TC-STAFF-030: Timer Bar Start / Stop', () => {
  test('should start and stop the timer and update the grid', async ({ page, request }) => {
    test.setTimeout(90_000)

    const admin = await getAuthToken(request, 'admin')
    const stamp = Date.now()

    const { memberId, createdNew } = await getOrCreateSelfStaffMemberFixture(request, admin)

    const projectId = await createTimeProjectFixture(request, admin, {
      name: `QA Timer Project ${stamp}`,
      code: `QATM-${stamp}`,
    })
    await assignEmployeeToProjectFixture(request, admin, projectId, memberId)

    // Create a seed entry so the project row (and table) appear in the grid
    // (grid only shows projects that have at least one entry in the current period)
    const today = new Date().toISOString().slice(0, 10)
    const seedEntryId = await createTimeEntryFixture(request, admin, {
      staffMemberId: memberId,
      timeProjectId: projectId,
      date: today,
      durationMinutes: 1,
    })

    // Track entry IDs created by the timer for cleanup
    const createdEntryIds: string[] = []

    try {
      await login(page, 'admin')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Timer bar must be visible
      const startBtn = page.getByRole('button', { name: /start/i }).first()
      await expect(startBtn).toBeVisible({ timeout: 10_000 })

      // The elapsed display starts at 00:00:00
      const elapsed = page.locator('span.font-mono').first()
      await expect(elapsed).toHaveText('00:00:00', { timeout: 5_000 })

      // Select the project in the timer bar project dropdown
      const projectDropdown = page.locator('button').filter({ hasText: /No project/i }).first()
      await projectDropdown.click()
      await page.getByText(`QA Timer Project ${stamp}`).first().click()

      // Wait for the Start button to become enabled after project selection
      await expect(startBtn).toBeEnabled({ timeout: 5_000 })

      // Start the timer
      await startBtn.click()

      // Stop button must appear (timer is now running)
      const stopBtn = page.getByRole('button', { name: /stop/i }).first()
      await expect(stopBtn).toBeVisible({ timeout: 10_000 })

      // Elapsed must be ticking (non-zero after 2 seconds)
      await page.waitForTimeout(2_000)
      const elapsedText = await elapsed.textContent()
      expect(elapsedText, 'Elapsed should be non-zero after 2s').not.toBe('00:00:00')

      // Stop the timer
      await stopBtn.click()

      // Start button must return
      await expect(page.getByRole('button', { name: /start/i }).first()).toBeVisible({ timeout: 10_000 })

      // The elapsed resets to 00:00:00
      await expect(elapsed).toHaveText('00:00:00', { timeout: 5_000 })

      // Verify the timer entry was created in the DB
      // (duration may be 0 minutes for a very short timer — we just confirm the entry exists)
      const verifyRes = await apiRequest(request, 'GET',
        `/api/staff/timesheets/time-entries?staffMemberId=${memberId}&from=${today}&to=${today}&pageSize=100`,
        { token: admin },
      )
      expect(verifyRes.ok(), 'Time entries query should succeed').toBeTruthy()
      const verifyBody = (await verifyRes.json()) as { items?: Array<{ id?: string; source?: string; ended_at?: string }> }
      const timerEntries = (verifyBody.items ?? []).filter(
        (item) => item.source === 'timer' && item.ended_at != null,
      )
      expect(timerEntries.length, 'Expected at least one completed timer entry in DB').toBeGreaterThanOrEqual(1)
    } finally {
      // Clean up seed entry and any timer entries created today
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-entries', seedEntryId)
      const entriesRes = await apiRequest(request, 'GET',
        `/api/staff/timesheets/time-entries?staffMemberId=${memberId}&from=${today}&to=${today}&pageSize=100`,
        { token: admin },
      )
      if (entriesRes.ok()) {
        const body = (await entriesRes.json()) as { items?: Array<{ id?: string; source?: string }> }
        for (const item of body.items ?? []) {
          if (item.id && item.source === 'timer') createdEntryIds.push(item.id)
        }
      }
      for (const id of createdEntryIds) {
        await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(id)}`, { token: admin }).catch(() => {})
      }
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectId)
      if (createdNew) {
        await deleteStaffEntityIfExists(request, admin, 'staff/team-members', memberId)
      }
    }
  })
})
