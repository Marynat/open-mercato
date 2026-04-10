# Timesheets UX Enhancements

## TLDR

**Key Points:**
- Enhance the My Timesheets page from a basic monthly grid into a Toggl-inspired experience with weekly view, inline project management, integrated timer, and list view.
- UI-focused changes extending SPEC-069 Phase 1, with one additive DB migration (`color` on `staff_time_projects`).

**Scope:**
- Weekly view as default with weekly/monthly toggle
- Calendar date picker for week navigation
- "Create new project" dialog (full CrudForm, admin only)
- Project color dots (admin-defined, predefined 12-color palette, auto-generate fallback)
- Timer bar at the top of My Timesheets page
- List view (entries grouped by day) as alternative to grid
- Bulk save retained (no auto-save change)

**Concerns:**
- Timer moves from dashboard-only to grid top bar — conscious deviation from SPEC-069
- Significant UI rewrite of My Timesheets page within tight deadline

---

## Overview

Transform the My Timesheets UI from a monthly-only grid into a modern, Toggl-inspired time tracking interface. The current implementation follows SPEC-069 Phase 1 faithfully but was identified during PR review as "very difficult to use" and lacking the polish expected for production use.

This spec covers frontend UX improvements only. All backend APIs, commands, events, and entities from SPEC-069 Phase 1 are reused without modification (except one additive migration).

> **Market Reference**: Toggl Track (timesheet view). Adopted: weekly grid, timer bar, list view, project colors, calendar week picker. Rejected: billable toggle (Phase 3), calendar block view, client grouping, tag system.

## Problem Statement

1. **Monthly grid is overwhelming** — 30-31 columns make scanning difficult; most users track time weekly.
2. **No inline project management** — users must navigate away to add projects to the grid.
3. **Timer only in dashboard** — users must leave My Timesheets to start/stop a timer.
4. **No visual project identification** — all projects look the same in the grid.
5. **No alternative view** — some users prefer a chronological list of entries over a grid.
6. **Week navigation missing** — no way to quickly jump to a specific week.

## Proposed Solution

Rewrite the My Timesheets page (`packages/core/src/modules/staff/backend/staff/timesheets/page.tsx`) with:

1. **View mode state** — `weekly` (default) or `monthly`, persisted in URL query param
2. **View type state** — `timesheet` (grid) or `list`, persisted in URL query param
3. **Timer bar component** — top of page, reuses existing timer start/stop API endpoints
5. **Calendar date picker** — dropdown for week selection with quick links
6. **Project color system** — predefined 12-color palette stored on `staff_time_projects.color`

All changes are frontend-only except the `color` field migration.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Weekly view as default | Most time tracking is done weekly; monthly is secondary |
| `viewMode` persisted in `localStorage` | The selected view (monthly/weekly) is a personal UI preference, not a shareable state — `localStorage` is the correct store. Key: `staff.timesheets.viewMode`. State initialises to `'monthly'` (SSR-safe); a mount-only `useEffect` reads storage and updates state if a valid value is found. Written on every toggle. URL query param sync remains deferred (Step 3). |
| Bulk save retained (not auto-save) | SPEC-069 defines bulk save with confirmation; changing save semantics is risky for deadline |
| Predefined 12-color palette | Simpler UX than hex picker; consistent project colors; matches Toggl pattern |
| Projects don't auto-appear in grid | User controls which projects are visible; cleaner grid; matches Toggl behavior |
| Each project appears once in grid | Prevents confusion; time entries aggregate per project+day cell |
| Timer in grid auto-updates state | When timer stops, grid state updates immediately without page refresh |
| Decimal hour input format | Consistent with SPEC-069 (line 55, 551) which defines `duration_minutes` integer storage with decimal-hour UI (e.g. `4`, `7.5`); H:MM format is out of scope — minutes are not a supported input unit |
| Auto-generate project colors — sequential index | Assign colors by project's position index in the loaded list (index % palette length); guarantees visually distinct colors for adjacent projects; deterministic within a page load; replaced by admin-set color in Phase 3 |
| Weekly grid — adaptive project column and day cell sizing | Monthly view has 31 day columns so space is tight; weekly view has only 7. Project column: `min-w-[240px]`, name text uncapped. Day columns: `min-w-[40px]`, `px-0.5` on `<th>`, `px-2` on `<td>`; input fixed at `w-12 mx-auto` (centered 48px) instead of `w-full`. Monthly keeps current sizing (`min-w-[200px]` project, `min-w-[56px]` days, `max-w-[130px]` name text, `w-full` input). |
| Distribution bar above grid | At-a-glance project breakdown; proportional segments colored by project; hidden when total is 0 |
| Copy last period — plain button (no dropdown) | One-click populate current week/month from previous period; copies only to empty cells; no dropdown variants needed at this stage |
| No billable indicator in grid | "$" icon removed from project rows — billable tracking is Phase 3 scope; visual placeholder adds confusion without backend support |

## User Stories

1. As an **employee**, I can switch between weekly and monthly views so I can focus on the current week or see the full month.
2. As an **employee**, I can start/stop a timer from the My Timesheets page so I don't have to navigate to the dashboard.
3. As an **employee**, I can see a list view of my entries grouped by day so I have a chronological overview.
4. As an **employee**, I can navigate to any week using the calendar picker so I can review or edit past time.
5. As an **employee**, I can add projects to my grid via "+ Add row" so I can track time against assigned projects.
6. As an **admin**, I can create a new project directly from the "+ Add row" dropdown so I can start tracking immediately.
7. As an **admin**, I can assign colors to projects so teams can visually identify them in the grid.

## Architecture

### Component Structure

```
MyTimesheetsPage
├── TimerBar                     ← NEW: "What are you working on?" + play/stop
│   ├── ProjectSelectorDropdown  ← reuses assigned projects API
│   └── TimerDisplay             ← elapsed time, running state
├── ViewControls
│   ├── ViewModeSwitcher         ← Weekly | Monthly toggle
│   ├── ViewTypeSwitcher         ← List view | Timesheet toggle
│   └── CalendarDatePicker       ← NEW: week selector dropdown
├── TimesheetGrid                ← ENHANCED: weekly/monthly
│   ├── ProjectRow[]             ← with color dots
│   ├── AddRowDropdown           ← Phase 2: project selector + create
│   └── DailyTotalRow
├── ListView                     ← NEW: entries grouped by day
│   └── DayGroup[]
│       └── EntryRow[]
└── SummaryCards                 ← existing: Total Hours, Working Days, etc.
```

### Data Flow

- **Timer bar** → `POST /api/staff/timesheets/time-entries` (create entry) → `POST .../timer-start` → UI shows running state → `POST .../timer-stop` → update local grid state immediately
- **Grid cells** → collect dirty cells → `POST /api/staff/timesheets/time-entries/bulk` (unchanged)
- **"Create project"** → open CrudForm dialog → `POST /api/staff/timesheets/time-projects` → auto-assign creator → add to local grid state
- **List view** → `GET /api/staff/timesheets/time-entries?staffMemberId=...&from=...&to=...` → group by date → render

### Commands & Events

No new commands or events. All mutations reuse existing Phase 1 commands:

| Action | Command |
|--------|---------|
| Timer start | `staff.timesheets.time_entry.timer_start` |
| Timer stop | `staff.timesheets.time_entry.timer_stop` |
| Create entry (timer) | `staff.timesheets.time_entry.create` |
| Bulk save grid | via bulk endpoint (compound create/update) |
| Create project (dialog) | `staff.timesheets.time_project.create` |
| Assign creator to project | `staff.timesheets.time_project_member.assign` |
| Update project color | `staff.timesheets.time_project.update` |

### Access Control

No new ACL features. Existing features govern all actions:

| Action | Required Feature |
|--------|-----------------|
| View timesheets, grid, list view | `staff.timesheets.view` |
| Start/stop timer, save entries | `staff.timesheets.manage_own` |
| See "+ Create new project" in dropdown | `staff.timesheets.projects.manage` |
| Set project color | `staff.timesheets.projects.manage` |

## Data Models

### StaffTimeProject (Modified — additive only)

New field added to existing entity:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `color` | varchar(20), nullable | `null` | Predefined color key (e.g. `'blue'`, `'green'`, `'purple'`). Null = auto-generate from name hash. |

Predefined palette (12 colors):

```typescript
export const PROJECT_COLORS = [
  { key: 'blue',       hex: '#3B82F6' },
  { key: 'green',      hex: '#22C55E' },
  { key: 'purple',     hex: '#A855F7' },
  { key: 'red',        hex: '#EF4444' },
  { key: 'orange',     hex: '#F97316' },
  { key: 'yellow',     hex: '#EAB308' },
  { key: 'pink',       hex: '#EC4899' },
  { key: 'teal',       hex: '#14B8A6' },
  { key: 'indigo',     hex: '#6366F1' },
  { key: 'cyan',       hex: '#06B6D4' },
  { key: 'emerald',    hex: '#10B981' },
  { key: 'slate',      hex: '#64748B' },
] as const
```

Auto-generate fallback: `PROJECT_COLORS[hashCode(project.name) % PROJECT_COLORS.length]`

## API Contracts

No new API endpoints. All existing Phase 1 endpoints are reused.

### Modified Request (additive)

**`PATCH /api/staff/timesheets/time-projects/{id}`**

New optional field in request body:

```typescript
{
  // ... existing fields ...
  color?: string | null  // Predefined color key or null to reset
}
```

**`POST /api/staff/timesheets/time-projects`**

New optional field in request body:

```typescript
{
  // ... existing fields ...
  color?: string | null  // Predefined color key
}
```

Validation: `color` must be one of `PROJECT_COLORS[].key` or `null`.

## Internationalization (i18n)

| Key | EN Default |
|-----|-----------|
| `staff.timesheets.my.view_weekly` | `Weekly` |
| `staff.timesheets.my.view_monthly` | `Monthly` |
| `staff.timesheets.my.viewType.timesheet` | `Timesheet` |
| `staff.timesheets.my.viewType.list` | `List view` |
| `staff.timesheets.my.timer.placeholder` | `What are you working on?` |
| `staff.timesheets.my.timer.start` | `Start Timer` |
| `staff.timesheets.my.timer.stop` | `Stop Timer` |
| `staff.timesheets.my.timer.running` | `Timer running` |
| `staff.timesheets.my.calendar.thisWeek` | `This week` |
| `staff.timesheets.my.calendar.lastWeek` | `Last week` |
| `staff.timesheets.my.weekTotal` | `Week Total` |
| `staff.timesheets.my.list.today` | `Today` |
| `staff.timesheets.my.list.yesterday` | `Yesterday` |
| `staff.timesheets.my.list.addDescription` | `Add description` |
| `staff.timesheets.projects.form.color` | `Project color` |
| `staff.timesheets.my.copyLastWeek` | `Copy last week` |
| `staff.timesheets.my.copyLastMonth` | `Copy last month` |
| `staff.timesheets.my.copiedLastPeriod` | `Copied from last period.` |
| `staff.timesheets.my.billable` | `Billable` |

## UI/UX

### My Timesheets — Weekly Timesheet View (default)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ██████████████████████████████████ Website ████ Mobile █ API Work ████ │  ← distribution bar
├──────────────────────────────────────────────────────────────────────────┤
│ What are you working on?          [Project ▾]   ▶ Play    0:00:00      │
├──────────────────────────────────────────────────────────────────────────┤
│ ◀  W16: 13 - 19 Apr 2026  ▶  [📅]    [Monthly][Weekly]                │
│                                        [List view] [Timesheet]         │
├──────────────────────────────────────────────────────────────────────────┤
│ PROJECT                         MON  TUE  WED  THU  FRI  SAT  SUN  TOTAL │
├──────────────────────────────────────────────────────────────────────────┤
│ 🟢 Website Redesign 2026        8    7.5  8    7    8     -    -   38.5 h│
│ 🔵 Mobile App — iOS & Android   0    0    2    3    0     -    -    5.0 h│
│ 🟣 API Work                     0    0.5  0    1    0     -    -    1.5 h│
├──────────────────────────────────────────────────────────────────────────┤
│ [Copy last week]           TOTAL    8 h  8 h  10 h 11 h 8 h   -    -   45 h│
│ [Unsaved changes]  [Save Changes]                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

Notes:
- Distribution bar appears above the grid; each segment proportional to project hours; colors assigned by sequential index in loaded project list (guarantees distinct adjacent colors); hidden when total = 0
- Time cells: decimal hour input (e.g. `4`, `7.5`); placeholder `0`; consistent with SPEC-069
- Row totals and day totals: `X h` or `X.X h` format (unit always shown)
- No billable indicator in grid rows — removed; Phase 3 scope
- `Copy last week` / `Copy last month` — plain button, no dropdown; label adapts to view mode
- Weekend cells (`SAT`, `SUN`) are read-only, shown as `-`
- Column headers in weekly mode: uppercase day abbreviation + date number (e.g. `MON\n7`)
- **Weekly vs monthly column sizing**: weekly project column `min-w-[240px]` (name text uncapped); weekly day cells `min-w-[40px]`, `px-2` on `<td>`, input `w-12 mx-auto` (48px centered); monthly keeps `min-w-[200px]` project, `min-w-[56px]` days, `max-w-[130px]` name text, `w-full` input

### My Timesheets — List View

```
┌──────────────────────────────────────────────────────────────────────────┐
│ What are you working on?          [Project ▾]   ▶ Play    0:00:00      │
├──────────────────────────────────────────────────────────────────────────┤
│ ◀  W16: 13 - 19 Apr 2026  ▶  [📅]    WEEK TOTAL: 32.5h               │
│                                        [List view] [Timesheet]         │
├──────────────────────────────────────────────────────────────────────────┤
│ Today                                                          8:00:00 │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Add description   • 🟢 Website    8:00 AM - 12:00 PM     4:00:00 │ │
│ │ API endpoint work • 🔵 Mobile     1:00 PM -  4:00 PM     3:00:00 │ │
│ │ Meeting notes     • 🟣 API Work   4:30 PM -  5:30 PM     1:00:00 │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ Yesterday                                                      7:30:00 │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Homepage design   • 🟢 Website    8:00 AM - 12:00 PM     4:00:00 │ │
│ │ Code review       • 🟢 Website    1:00 PM -  4:30 PM     3:30:00 │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Notes:
- Timer-created entries (source: `timer`) show time range (start - end)
- Manual entries (source: `manual`) show duration only (e.g. `4h`)
- Description is inline editable ("Add description" placeholder)

### Calendar Date Picker

```
┌───────────────────────────┐
│ 📅 04/06/2026 - 04/12/2026│
├───────────────────────────┤
│ This week                 │
│ Last week                 │
├───────────────────────────┤
│      April 2026 ▾        │
│  Mo Tu We Th Fr Sa Su    │
│ W14  30  1  2  3  4  5  6│
│ W15 [7] [8][9][10][11]12 │  ← current week highlighted
│ W16  13 14 15 16 17 18 19│
│ W17  20 21 22 23 24 25 26│
│ W18  27 28 29 30  1  2  3│
└───────────────────────────┘
```

### Color Picker (in project create/edit)

```
┌──────────────────────────────┐
│ Project color                │
│ ● ● ● ● ● ● ● ● ● ● ● ●  │  ← 12 predefined colors
│ (selected: 🟢)               │
└──────────────────────────────┘
```

## Migration & Compatibility

### Database Migration

**Additive only — backward compatible:**

```sql
ALTER TABLE staff_time_projects
  ADD COLUMN color varchar(20) DEFAULT NULL;
```

- No data backfill needed (null = auto-generate fallback)
- No existing columns modified or removed
- No index needed (color is not queried/filtered)

### Backward Compatibility

- All existing API contracts remain unchanged
- New `color` field is optional in all requests
- Existing UI behavior (monthly grid, save button) preserved within monthly view mode
- No breaking changes to events, commands, or ACL features

## Implementation Plan

### Phase 1: Weekly View & Navigation

**Step 1**: Weekly/monthly toggle, grid polish, distribution bar, copy last period ✅ *Implemented 2026-04-10*
- Add `viewMode` state (`weekly` | `monthly`) — persisted in `localStorage` key `staff.timesheets.viewMode`; falls back to `'monthly'`; URL query param sync deferred
- Refactor grid to render 7 columns (Mon–Sun) in weekly mode — week is Monday-anchored
- Week navigation header shows date range (e.g. `Apr 7 – Apr 13, 2026`)
- Retain monthly mode as toggle — **monthly remains default when no stored preference**
- i18n keys: `staff.timesheets.my.view_monthly` / `staff.timesheets.my.view_weekly`
- Switching modes resets unsaved dirty/rawText state and syncs period boundaries

**Step 1b**: Grid visual polish ✅ *Implemented 2026-04-10*
- **Decimal hour input** — cells display and accept decimal hours (e.g. `4`, `7.5`); consistent with SPEC-069; H:MM removed as out of scope
- **"X h" / "X.X h" totals** — all row/day totals include unit suffix
- **Project color dots** — assigned by sequential index in loaded project list (`index % palette`); guarantees distinct adjacent colors; replaced by admin-set color in Phase 3
- **Distribution bar** — proportional horizontal bar above grid; one segment per project; hidden when total hours = 0
- **No billable "$" indicator** — removed from project rows; Phase 3 scope
- **"Copy last week / month"** — plain button (no dropdown chevron); copies previous period's entries into current empty cells; label adapts to view mode
- **View-adaptive column sizing** — weekly mode: project column `min-w-[240px]`, name text uncapped, day cells `min-w-[40px]` with `px-2` cell padding and `w-12 mx-auto` input; monthly mode: current sizing retained (`min-w-[200px]` project, `min-w-[56px]` days, `max-w-[130px]` name text, `w-full` input)
- **Uppercase day headers** — weekly column headers show uppercase abbreviation + date (e.g. `MON\n7`)

> **"Without project" row**: Visible in design reference — requires API support for project-less time entries (null `time_project_id`). **Deferred to Phase 2** alongside backend changes.

**Step 2**: Calendar date picker
- Dropdown component triggered from week navigation
- Month calendar with week rows (W14, W15...)
- "This week" / "Last week" quick links
- Click week → update grid date range

**Step 3**: View type toggle (Timesheet | List view)
- Add `viewType` state (`timesheet` | `list`) with URL query param
- Toggle buttons in header
- List view component: entries grouped by day
- Timer entries show time range; manual entries show duration only

### Phase 2: Timer Bar & Project Management

**Step 4**: Timer bar at top of page
- "What are you working on?" input + project selector dropdown
- Play button: create entry + start timer via existing API
- Running state: elapsed time display, project tag
- Stop button: stop timer → update grid state immediately (no refresh)
- Project selector: assigned projects with color dots

**Step 5**: "+ Add row" with project selector
- Inline dropdown below last project row
- Search field filtering assigned projects
- "No projects assigned" empty state for employees
- Admin sees "+ Create a new project" at bottom
- Selecting project adds row to grid state

**Step 6**: "Create new project" dialog (admin)
- Full CrudForm in dialog modal
- Triggered from "+ Add row" → "+ Create a new project"
- On create: auto-assign creator + add project to grid

### Phase 3: Project Colors & Polish

**Step 7**: Color field migration + entity update
- Add `color` column to `staff_time_projects`
- Add `color` to create/update validators (enum of predefined keys)
- Auto-generate fallback from name hash

**Step 8**: Color picker UI
- Color palette component (12 predefined colors)
- Add to project create dialog and edit page
- Update color dots in grid rows and timer project selector to prefer admin-set `color` from DB; fall back to sequential-index auto-color (already in place from Step 1b) when `color` is null

**Step 9**: Integration tests
- TC-STAFF-023 (weekly/monthly toggle), TC-STAFF-024 (decimal format), TC-STAFF-025 (distribution bar + color dots), TC-STAFF-026 (copy button) already written in Phase 1 Step 1b ✅
- New test: timer bar start/stop flow
- New test: "+ Add row" project selector and project creation from grid
- New test: list view rendering

### File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `packages/core/src/modules/staff/backend/staff/timesheets/page.tsx` | Modify | Rewrite with weekly/monthly toggle, view type toggle, timer bar |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/TimerBar.tsx` | Create | Timer bar component |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/CalendarPicker.tsx` | Create | Calendar week picker dropdown |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/AddRowDropdown.tsx` | Create | Phase 2: "+ Add row" project selector |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/ListView.tsx` | Create | List view (entries grouped by day) |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/ColorPicker.tsx` | Create | 12-color palette picker |
| `packages/core/src/modules/staff/backend/staff/timesheets/components/ViewSwitcher.tsx` | Create | Weekly/Monthly + Timesheet/List toggles |
| `packages/core/src/modules/staff/lib/timesheetUtils.ts` | Already created | `PROJECT_AUTO_COLORS`, `getProjectColor`, and all grid utility functions — extracted in Phase 1 Step 1b |
| `packages/core/src/modules/staff/backend/staff/timesheets/projects/projectFormConfig.ts` | Modify | Add color field to form config |
| `packages/core/src/modules/staff/backend/staff/timesheets/projects/[id]/page.tsx` | Modify | Add color dot display |
| `packages/core/src/modules/staff/data/entities.ts` | Modify | Add `color` field to StaffTimeProject |
| `packages/core/src/modules/staff/data/validators.ts` | Modify | Add `color` validation (enum of predefined keys) |
| `packages/core/src/modules/staff/i18n/en.json` | Modify | Add new i18n keys |
| `packages/core/src/modules/staff/i18n/pl.json` | Modify | Sync new keys |
| `packages/core/src/modules/staff/i18n/es.json` | Modify | Sync new keys |
| `packages/core/src/modules/staff/i18n/de.json` | Modify | Sync new keys |
| DB migration | Create | Add `color` column to `staff_time_projects` |

## Risks & Impact Review

#### Timer State Inconsistency
- **Scenario**: User starts timer in top bar, navigates away, returns — timer state lost in UI
- **Severity**: Medium
- **Affected area**: Timer bar component, My Timesheets page
- **Mitigation**: On page load, query existing entries for today with `ended_at IS NULL` to detect running timer. Restore running state from API data.
- **Residual risk**: Brief flash of non-running state before API response arrives (acceptable — loading state)

#### Concurrent Grid and Timer Edits
- **Scenario**: User edits a cell for project X while timer is running for project X on the same day. Bulk save overwrites timer entry.
- **Severity**: High
- **Affected area**: Bulk save endpoint, timer entries
- **Mitigation**: Bulk save uses create-or-update logic keyed on (staffMemberId, timeProjectId, date). Timer entries are separate rows (source: 'timer') and grid entries are (source: 'manual'). They coexist — grid cell shows sum of all entries for that project+day.
- **Residual risk**: None — multiple entries per cell already supported (CellEntry[] pattern from Phase 1)

#### Color Field Migration on Large Tables
- **Scenario**: Migration adds nullable column to `staff_time_projects` — potential lock on large tables
- **Severity**: Low
- **Affected area**: Deployment
- **Mitigation**: `ADD COLUMN ... DEFAULT NULL` on PostgreSQL is metadata-only (no table rewrite). Safe for any table size.
- **Residual risk**: None

#### Page Rewrite Regression
- **Scenario**: Major rewrite of `page.tsx` introduces regressions in existing monthly grid or bulk save
- **Severity**: High
- **Affected area**: My Timesheets core functionality
- **Mitigation**: Existing integration tests (TC-STAFF-020) validate grid behavior. Monthly mode retained as-is. Step-by-step implementation — each step results in working application.
- **Residual risk**: Manual testing recommended for edge cases (weekend cells, month boundaries)

## Final Compliance Report — 2026-04-08

### AGENTS.md Files Reviewed
- `AGENTS.md` (root)
- `packages/core/AGENTS.md`
- `packages/ui/AGENTS.md`
- `packages/shared/AGENTS.md`

### Compliance Matrix

| Rule Source | Rule | Status | Notes |
|-------------|------|--------|-------|
| root AGENTS.md | No direct ORM relationships between modules | Compliant | No cross-module ORM changes |
| root AGENTS.md | Filter by organization_id | Compliant | All existing queries scoped; no new queries |
| root AGENTS.md | Use apiCall, not raw fetch | Compliant | All API calls via apiCall/readApiResultOrThrow |
| root AGENTS.md | Validate inputs with Zod | Compliant | color field added to existing Zod validators |
| root AGENTS.md | Use findWithDecryption | Compliant | No new ORM queries (frontend-only changes) |
| root AGENTS.md | i18n: never hard-code strings | Compliant | All new strings use useT() with locale keys |
| root AGENTS.md | Every dialog: Cmd+Enter submit, Escape cancel | Compliant | Create project dialog follows convention |
| root AGENTS.md | pageSize ≤ 100 | Compliant | All API calls within limit |
| packages/core/AGENTS.md | API routes MUST export openApi | Compliant | No new API routes |
| packages/ui/AGENTS.md | Use CrudForm for create/edit | Compliant | Create project dialog uses CrudForm |
| Backward compatibility | Additive-only DB changes | Compliant | Nullable column with default null |

### Internal Consistency Check

| Check | Status | Notes |
|-------|--------|-------|
| Data models match API contracts | Pass | color field added to entity and validators |
| API contracts match UI/UX section | Pass | All UI actions map to existing endpoints |
| Risks cover all write operations | Pass | Timer, bulk save, project create covered |
| Commands defined for all mutations | Pass | All reuse existing Phase 1 commands |
| No new ACL features needed | Pass | Existing features cover all new UI actions |

### Verdict

**Fully compliant** — ready for implementation.

---

## Open Bugs

### BUG-001 — Grid cell background turns white on focus change

**Status**: Resolved — 2026-04-10
**Severity**: Medium — cosmetic but noticeable; does not affect data correctness
**Affected file**: `packages/core/src/modules/staff/backend/staff/timesheets/page.tsx`

#### Symptom

After a user enters a value into a timesheet cell and moves focus elsewhere (clicks another cell, clicks a button, navigates month/week, switches view mode), the cell background becomes an opaque white — visually indistinguishable from a browser-default white `<input>`. The amber "unsaved changes" indicator disappears or was never visibly amber to begin with.

#### Steps to Reproduce

1. Open My Timesheets page (weekly or monthly view)
2. Click any weekday cell for a project row
3. Type a value (e.g. `4:00`)
4. Move focus away — click another cell, click the Save button area, navigate to next/prev period, or switch Monthly↔Weekly
5. **Observe**: the cell background is white / opaque; no amber tint is visible

#### Expected Behaviour

- While the cell contains an unsaved change (`isDirty = true`): background is clearly **amber** (`bg-amber-100`, `#fef3c7`)
- When clean (loaded from DB, or after save): background is the explicit page background colour with a subtle border — **no surprise colour change** on focus transitions

#### Actual Behaviour

The cell appears white/opaque regardless of state. The amber dirty indicator is either invisible or disappears when focus shifts to a different element.

#### Fix Attempts (all ineffective)

| Attempt | Change | Outcome |
|---------|--------|---------|
| 1 | Removed `focus:bg-background` from input class | Fixed white flash *during* typing; issue persisted on blur/navigate |
| 2 | Changed `bg-amber-50` → `bg-amber-100` | Dirty colour is now more saturated in theory; white-on-blur issue unchanged |
| 3 | Changed `bg-transparent` → `bg-background` + `border-border` for clean state | Issue still reported; explicit white baseline didn't help |

#### Hypotheses for Root Cause

The following have **not yet been investigated** — need browser devtools to confirm:

1. **CSS variable resolving to white in this context** — `bg-background` and `bg-amber-100` use Tailwind CSS custom properties (`--background`, colour scale). If the CSS variable `--background` or the amber variable is somehow overridden to `#ffffff` at the component level (e.g. a parent sets a different colour scheme), all background classes would render white.

2. **`transition-colors` animating through white** — the `transition-colors` class transitions `background-color`. Going from `rgb(254,243,199)` (amber-100) to `rgb(255,255,255)` (white) passes through near-white intermediate frames. If something is triggering an unintended transition endpoint, the user sees the midpoint (white). Should be testable by temporarily removing `transition-colors`.

3. **Browser UA `:-webkit-autofill` override** — some browsers apply a yellow or white autofill overlay to inputs that have been interacted with. This overlay ignores `background-color` and requires `-webkit-box-shadow: 0 0 0 1000px <color> inset` to override. Visible in DevTools as a `:-webkit-autofill` pseudo-class on the input.

4. **React controlled input re-render resetting paint** — when `value` prop changes (e.g. `rawText` cleared on blur → `minutesToHHMM(cellMinutes)` substituted), React replaces the DOM node's value. Some browser/React combinations repaint the input with the UA default background during this reconciliation cycle before the next frame applies the CSS class.

5. **Tailwind JIT class not generated** — if `bg-amber-100` or `bg-background` are only used inside a template literal (dynamic class), Tailwind's JIT scanner may not include them in the generated CSS bundle. The class would be silently ignored, falling back to the browser's default white. This is a classic Tailwind pitfall with dynamic class construction. **Most likely candidate** — check whether `border-amber-400 bg-amber-100` appears verbatim as a static string somewhere in the file or in the Tailwind safelist.

6. **`bg-background` resolving differently in dark/light mode** — if the app CSS defines `--background: 0 0% 100%` (pure white HSL) and the Tailwind config maps `background: 'hsl(var(--background))'`, then `bg-background` IS white by design. The class doesn't help if the desired "not white" state relies on it.

#### Resolution

**Remove `background-color` from the dirty indicator entirely.** Only the border colour changes between clean and dirty states. The background stays `bg-background` in all states — no transition, no colour override possible.

```
clean:  border-border   bg-background
dirty:  border-amber-400 bg-background   ← only border changes
```

This eliminates the entire class of background-colour fighting between Tailwind, browser UA styles, and React reconciliation. The amber border is sufficient to communicate unsaved state.

## Changelog

### 2026-04-10 (8)
- Weekly grid layout: wider project name column (`min-w-[280px]`, uncapped text) and narrower day cells (`min-w-[40px]`, reduced padding) vs monthly sizing; updated wireframe and design decisions
### 2026-04-11
- Added `viewMode` localStorage persistence: key `staff.timesheets.viewMode`, fallback `'monthly'`, URL query param sync remains deferred

### 2026-04-10 (9)
- Refined weekly grid sizing: project column reduced to `min-w-[240px]`; day inputs enlarged to `w-12` (48px) centered with `mx-auto`; `px-2` cell padding retained

### 2026-04-10 (7)
- Adjusted future steps for overlap with Phase 1 implementation: Step 8 "color dots" is now an update (not new — auto-coloring already in Step 1b); Step 9 test list updated to note TC-STAFF-023/024/025/026 already written; file manifest updated (`lib/colors.ts` → `lib/timesheetUtils.ts` already exists)

### 2026-04-10 (6)
- Removed "+ Add row" placeholder button from Phase 1 implementation and all related i18n keys (`addRow`, `addRow.search`, `addRow.noProjects`, `addRow.createProject`); feature remains planned under Phase 2 Step 5

### 2026-04-10 (5)
- Reverted time input format from H:MM back to decimal hours per SPEC-069 (minutes not in scope)
- Updated wireframe cells and notes to show decimal values (e.g. `7.5` not `7:30`)
- Placeholder changes from `0:00` to `0`

### 2026-04-10 (4)
- Documented and resolved BUG-001: grid cell background turns white on focus change
- Fix: remove background-color from dirty indicator entirely; amber border only; `bg-background` constant in all states

### 2026-04-10 (3)
- Color strategy: changed from ID-hash to sequential index to guarantee visually distinct adjacent project colors
- Removed "$" billable indicator from grid rows (deferred to Phase 3)
- "Copy last week/month" changed from dropdown button to plain button

### 2026-04-10 (2)
- Added design decisions for H:MM format, auto-color, distribution bar, copy last period
- Updated weekly grid wireframe to match design reference (screenshot)
- Added i18n keys: `copyLastWeek`, `copyLastMonth`, `copiedLastPeriod`, `billable`
- Noted "Without project" row as deferred Phase 2 item (requires backend support)
- Promoted Step 1b: grid visual polish (decimal hours, color dots, distribution bar, Copy last period)

### 2026-04-10
- Implemented Phase 1 Step 1: monthly/weekly view toggle in `page.tsx`
- Replaced day-number arrays with `periodDays` (ISO date string array) covering both modes
- Added `formatDateFromObj`, `getMonWeekStart`, `isWeekendFromKey` helpers
- Unified navigation (`goToPrev`/`goToNext`) and period label for both modes
- Added toggle button group UI (Monthly | Weekly) in the toolbar
- Added i18n keys `view_monthly` / `view_weekly` to all 4 locale files (en, de, es, pl)
- **Deferred**: URL query param sync for `viewMode`; weekly-as-default (monthly kept as default)

### 2026-04-08
- Initial specification based on PR #1111 review feedback and Toggl Track reference
- Extends SPEC-069 Phase 1 with UI/UX improvements
