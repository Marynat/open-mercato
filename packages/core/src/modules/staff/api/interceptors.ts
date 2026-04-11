import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { getStaffMemberByUserId } from '../lib/staffMemberResolver'
import { StaffTimeEntry } from '../data/entities'

export const interceptors: ApiInterceptor[] = [
  {
    id: 'staff.timesheets.self-scope-time-entries',
    targetRoute: 'staff/timesheets/time-entries',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    priority: 70,
    async before(request, context) {
      const userFeatures = context.userFeatures ?? []
      if (userFeatures.includes('staff.timesheets.manage_all') || userFeatures.includes('staff.*')) {
        return { ok: true }
      }

      const staffMember = await getStaffMemberByUserId(
        context.em,
        context.userId,
        context.tenantId ?? null,
        context.organizationId ?? null,
      )

      if (!staffMember) {
        return { ok: false, statusCode: 403, message: 'User is not a staff member.' }
      }

      if (request.method === 'GET') {
        return {
          ok: true,
          query: { ...request.query, staffMemberId: staffMember.id },
        }
      }

      if (request.method === 'POST') {
        return {
          ok: true,
          body: { ...request.body, staffMemberId: staffMember.id },
        }
      }

      // PUT / DELETE: verify the target entry belongs to the caller.
      // For custom actions.delete routes, the factory does NOT forward query params
      // to the interceptor's request.query — only body is passed. Fall back to
      // parsing the URL directly so ?id=<uuid> DELETEs are still protected.
      const urlQueryId = (() => {
        try { return new URL(request.url).searchParams.get('id') }
        catch { return null }
      })()
      const entryId =
        typeof request.body?.id === 'string'
          ? request.body.id
          : typeof request.query?.id === 'string'
            ? request.query.id
            : urlQueryId

      if (!entryId) {
        return { ok: false, statusCode: 403, message: 'Access denied.' }
      }

      const entry = await context.em.findOne(StaffTimeEntry, {
        id: entryId,
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        deletedAt: null,
      })
      if (!entry || entry.staffMemberId !== staffMember.id) {
        return { ok: false, statusCode: 403, message: 'Access denied.' }
      }

      return { ok: true }
    },
  },
  {
    id: 'staff.timesheets.self-scope-widget-data',
    targetRoute: 'dashboards/widgets/data',
    methods: ['POST'],
    priority: 70,
    async before(request, context) {
      const entityType = request.body?.entityType
      if (entityType !== 'staff:staff_time_entries') {
        return { ok: true }
      }

      const userFeatures = context.userFeatures ?? []
      if (userFeatures.includes('staff.timesheets.manage_all') || userFeatures.includes('staff.*')) {
        return { ok: true }
      }

      const staffMember = await getStaffMemberByUserId(
        context.em,
        context.userId,
        context.tenantId ?? null,
        context.organizationId ?? null,
      )

      if (!staffMember) {
        return {
          ok: false,
          statusCode: 403,
          message: 'User is not a staff member.',
        }
      }

      const existingFilters = Array.isArray(request.body?.filters) ? request.body.filters : []
      const otherFilters = existingFilters.filter(
        (f: Record<string, unknown>) => f.field !== 'staffMemberId',
      )

      return {
        ok: true,
        body: {
          ...request.body,
          filters: [
            ...otherFilters,
            { field: 'staffMemberId', operator: 'eq', value: staffMember.id },
          ],
        },
      }
    },
  },
]
