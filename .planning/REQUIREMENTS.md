# Requirements: IMS Global Design Alignment

**Defined:** 2026-05-23
**Last verified:** 2026-05-24
**Core Value:** IMS should feel like one coherent product: every core management page should share the same glass-like shell, spacing system, status language, and list interaction patterns from `design.pen` without breaking existing workflows.

## v1 Requirements

Requirements for the initial global design alignment milestone. Each maps to roadmap phases.

### Design Foundation

- [x] **DSGN-01**: Developer can reference a documented global UI contract derived from `design.pen` for shell, spacing, typography, colors, borders, radii, blur, and shadows.
- [x] **DSGN-02**: Developer can use named IMS design tokens or centralized constants for status colors, glass surfaces, border colors, and common page backgrounds instead of scattered one-off values.
- [x] **DSGN-03**: User sees a consistent app page shell across aligned management pages, including soft blue background, translucent surfaces, and stable page padding.

### Shared Components

- [x] **COMP-01**: Developer can reuse a global page title bar pattern with left accent, title text, and right-side actions matching `design.pen`.
- [x] **COMP-02**: Developer can reuse a filter bar pattern with search input, compact dropdown buttons, and segmented status tabs matching `design.pen`.
- [x] **COMP-03**: Developer can reuse status badges whose labels, dimensions, colors, and text weights match the design status language.
- [x] **COMP-04**: Developer can reuse list section headers, record rows, duplicate-data notices, empty states, and error states with consistent spacing and visual hierarchy.
- [x] **COMP-05**: Developer can reuse a right-side status panel pattern for summary, empty, and error cards where pages need contextual status information.

### Interview Records Reference Page

- [x] **INTV-01**: User sees `/interviews` match the `design.pen` interview records frame in structure: title bar, filter bar, left grouped records list, right status panel, and duplicate-data banner.
- [x] **INTV-02**: User can still search and filter interview records after visual alignment.
- [x] **INTV-03**: User sees grouped rows, status badges, duplicate-candidate conflict row, empty state, and error-state components with design-accurate sizing and visual treatment.
- [x] **INTV-04**: Developer can treat `/interviews` as the canonical reference page for applying the design language elsewhere.

### Global Page Rollout

- [x] **GLOB-01**: User sees candidate list and detail-adjacent management surfaces adopt the same shell, cards, filters, empty/error states, and status language where applicable.
- [x] **GLOB-02**: User sees import workflow pages use aligned glass panels, section headers, progress/status indicators, empty/error states, and action buttons without changing import behavior.
- [x] **GLOB-03**: User sees screening-template and settings management pages adopt the shared title/action/filter/card patterns where applicable.
- [x] **GLOB-04**: Existing navigation, auth guarding, data loading, import, candidate, and settings behaviors remain intact after visual alignment.

### Verification

- [x] **VERF-01**: Developer can run lightweight type verification and confirm the aligned frontend still compiles.
- [x] **VERF-02**: Reviewer can compare aligned pages against `design.pen` using a documented visual checklist.
- [x] **VERF-03**: Reviewer can identify any deliberately deferred visual gaps in a follow-up list instead of rediscovering them from screenshots.

## v2 Requirements

Deferred to future releases. Tracked but not in the current roadmap.

### LUI Workspace

- **LUI-01**: User sees the LUI chat workspace redesigned using the same global visual language after the management-page alignment is stable.
- **LUI-02**: Developer can split the large `apps/web/src/views/LUIView.vue` into smaller visual components before deep visual redesign.

### Advanced Design System

- **DSSYS-01**: Developer can consume a formal theme/token module instead of repeated Tailwind arbitrary values.
- **DSSYS-02**: Developer can preview shared design primitives in an internal component gallery or documentation route.
- **DSSYS-03**: Reviewer can run automated visual regression snapshots for key aligned pages.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Backend API redesign | This milestone is about frontend visual alignment, not API behavior. |
| Database schema changes | Design alignment should not require persistence changes. |
| Full LUI redesign in v1 | `LUIView.vue` is a known large hotspot and should be handled separately. |
| Replacing Tailwind or shadcn-vue primitives | Existing stack already supports the design implementation. |
| Pixel-perfect desktop packaging changes | Tauri shell behavior is separate from web UI visual alignment. |
| Automated full test-suite execution | User has not requested full tests; use lightweight verification first. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DSGN-01 | Phase 1 | Done |
| DSGN-02 | Phase 1 | Done |
| DSGN-03 | Phase 1 | Done |
| COMP-01 | Phase 2 | Done |
| COMP-02 | Phase 2 | Done |
| COMP-03 | Phase 2 | Done |
| COMP-04 | Phase 2 | Done |
| COMP-05 | Phase 2 | Done |
| INTV-01 | Phase 3 | Done |
| INTV-02 | Phase 3 | Done |
| INTV-03 | Phase 3 | Done |
| INTV-04 | Phase 3 | Done |
| GLOB-01 | Phase 4 | Done |
| GLOB-02 | Phase 4 | Done |
| GLOB-03 | Phase 4 | Done |
| GLOB-04 | Phase 4 | Done |
| VERF-01 | Phase 5 | Done |
| VERF-02 | Phase 5 | Done |
| VERF-03 | Phase 5 | Done |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

## Acceptance Criteria

- `/interviews` visually matches the main `design.pen` structure and becomes the reference implementation.
- Shared UI primitives exist or current components are standardized enough to apply the design globally.
- At least candidates, import, screening-template, and settings management surfaces receive the global design language where equivalent patterns exist.
- Existing frontend behavior is preserved.
- No commits are made automatically.

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-24 after Phase 1-5 implementation and lightweight verification*
