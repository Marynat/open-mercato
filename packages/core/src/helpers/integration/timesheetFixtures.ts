import { expect, type APIRequestContext } from '@playwright/test'
import { apiRequest } from './api'
import { deleteStaffEntityIfExists } from './staffFixtures'

/**
 * Create (or retrieve if already exists) the staff member profile linked to the
 * authenticated user identified by `token`.
 *
 * Returns the member ID and a flag indicating whether the profile was freshly
 * created so callers can clean up conditionally.
 */
export async function getOrCreateSelfStaffMemberFixture(
  request: APIRequestContext,
  token: string,
): Promise<{ memberId: string; createdNew: boolean }> {
  const createRes = await apiRequest(request, 'POST', '/api/staff/team-members/self', {
    token,
    data: { displayName: 'QA Test Member' },
  })

  if (createRes.status() === 201) {
    const body = (await createRes.json()) as { id?: string }
    if (typeof body.id === 'string' && body.id.length > 0) {
      return { memberId: body.id, createdNew: true }
    }
  }

  // 409 = profile already exists; retrieve it
  const selfRes = await apiRequest(request, 'GET', '/api/staff/team-members/self', { token })
  expect(selfRes.ok(), 'GET /api/staff/team-members/self should succeed after create-or-409').toBeTruthy()
  const selfBody = (await selfRes.json()) as { member?: { id?: string } }
  const memberId = selfBody.member?.id ?? ''
  expect(memberId.length > 0, 'Staff member profile must exist after getOrCreate').toBeTruthy()
  return { memberId, createdNew: false }
}

export async function createTimeProjectFixture(
  request: APIRequestContext,
  token: string,
  input?: { name?: string; code?: string },
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/staff/timesheets/time-projects', {
    token,
    data: {
      name: input?.name ?? `QA Project ${Date.now()}`,
      code: input?.code ?? `QA-${Date.now()}`,
      projectType: 'internal',
      status: 'active',
    },
  })
  expect(response.ok(), `Failed to create time project fixture: ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { id?: string }
  expect(typeof body.id === 'string' && body.id.length > 0).toBeTruthy()
  return body.id as string
}

export async function assignEmployeeToProjectFixture(
  request: APIRequestContext,
  token: string,
  projectId: string,
  staffMemberId: string,
): Promise<string> {
  const response = await apiRequest(request, 'POST', `/api/staff/timesheets/time-projects/${projectId}/employees`, {
    token,
    data: { staffMemberId, status: 'active', assignedStartDate: new Date().toISOString().slice(0, 10) },
  })
  expect(response.ok(), `Failed to assign employee to project: ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { id?: string }
  return body.id ?? ''
}

export async function createTimeEntryFixture(
  request: APIRequestContext,
  token: string,
  input: { staffMemberId: string; timeProjectId: string; date: string; durationMinutes: number },
): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/staff/timesheets/time-entries', {
    token,
    data: {
      staffMemberId: input.staffMemberId,
      timeProjectId: input.timeProjectId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      source: 'manual',
    },
  })
  expect(response.ok(), `Failed to create time entry fixture: ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { id?: string }
  expect(typeof body.id === 'string' && body.id.length > 0).toBeTruthy()
  return body.id as string
}

export { deleteStaffEntityIfExists }
