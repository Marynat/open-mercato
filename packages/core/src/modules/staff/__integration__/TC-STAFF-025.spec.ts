import { test, expect } from '@playwright/test'
import { login } from '@open-mercato/core/helpers/integration/auth'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createTimeProjectFixture,
  assignEmployeeToProjectFixture,
  createTimeEntryFixture,
  deleteStaffEntityIfExists,
} from '@open-mercato/core/helpers/integration/timesheetFixtures'

/**
 * TC-STAFF-025: Distribution Bar and Project Color Dots
 * Verifies that when hours are tracked across multiple projects:
 * - A colored distribution bar is rendered above the grid.
 * - Each project row has a color dot (inline circle) in the project name column.
 * - Color dots for adjacent projects are visually distinct (different colors).
 * Spec reference: .ai/specs/2026-04-08-timesheets-ux-enhancements.md — Phase 1 Step 1b
 */
test.describe('TC-STAFF-025: Distribution Bar and Project Color Dots', () => {
  test('should render the distribution bar and per-project color dots when hours are tracked', async ({ page, request }) => {
    test.setTimeout(60_000)

    const admin = await getAuthToken(request, 'admin')
    const employeeToken = await getAuthToken(request, 'employee')
    const stamp = Date.now()

    const selfRes = await apiRequest(request, 'GET', '/api/staff/team-members/self', { token: employeeToken })
    const selfBody = (await selfRes.json()) as { member?: { id?: string } }
    const employeeStaffMemberId = selfBody.member?.id ?? ''
    expect(employeeStaffMemberId.length > 0, 'Employee must have a staff member profile').toBeTruthy()

    // Create two distinct projects
    const projectIdA = await createTimeProjectFixture(request, admin, {
      name: `QA Color Alpha ${stamp}`,
      code: `QACA-${stamp}`,
    })
    const projectIdB = await createTimeProjectFixture(request, admin, {
      name: `QA Color Beta ${stamp}`,
      code: `QACB-${stamp}`,
    })

    await assignEmployeeToProjectFixture(request, admin, projectIdA, employeeStaffMemberId)
    await assignEmployeeToProjectFixture(request, admin, projectIdB, employeeStaffMemberId)

    // Create one entry per project so grandTotal > 0 (triggers distribution bar)
    const entryIdA = await createTimeEntryFixture(request, employeeToken, {
      staffMemberId: employeeStaffMemberId,
      timeProjectId: projectIdA,
      date: '2026-04-07',
      durationMinutes: 120,
    })
    const entryIdB = await createTimeEntryFixture(request, employeeToken, {
      staffMemberId: employeeStaffMemberId,
      timeProjectId: projectIdB,
      date: '2026-04-07',
      durationMinutes: 180,
    })

    try {
      await login(page, 'employee')
      await page.goto('/backend/staff/timesheets')
      await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 })

      // Distribution bar: a full-width rounded container that appears above the grid
      // It is a flex div with overflow-hidden rounded-full containing colored segments.
      // Each segment has a title attribute "ProjectName: X h" and a white label inside.
      const barAlpha = page.locator('[title*="QA Color Alpha"]')
      const barBeta = page.locator('[title*="QA Color Beta"]')
      await expect(barAlpha).toBeVisible({ timeout: 15_000 })
      await expect(barBeta).toBeVisible({ timeout: 5_000 })

      // Color dots: small rounded-full spans with inline backgroundColor style
      // One per project row, rendered as <span class="h-2.5 w-2.5 ... rounded-full" style="background-color: #...">
      const colorDots = page.locator('span.rounded-full[style*="background-color"]')
      const dotCount = await colorDots.count()
      expect(dotCount).toBeGreaterThanOrEqual(2)

      // Collect dot colors — the two adjacent projects must have distinct colors
      const colors: string[] = []
      for (let i = 0; i < dotCount; i++) {
        const style = await colorDots.nth(i).getAttribute('style') ?? ''
        const match = style.match(/background-color:\s*(#[0-9A-Fa-f]{6})/)
        if (match) colors.push(match[1])
      }
      const colorSet = new Set(colors)
      // At least 2 distinct colors for the 2 project rows
      expect(colorSet.size).toBeGreaterThanOrEqual(2)
    } finally {
      await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(entryIdA)}`, { token: employeeToken }).catch(() => {})
      await apiRequest(request, 'DELETE', `/api/staff/timesheets/time-entries?id=${encodeURIComponent(entryIdB)}`, { token: employeeToken }).catch(() => {})
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectIdA)
      await deleteStaffEntityIfExists(request, admin, 'staff/timesheets/time-projects', projectIdB)
    }
  })
})
