# Phase 1 Research: Design Contract

**Date:** 2026-05-23
**Research Type:** Local design/codebase review
**External Research:** Skipped. The source of truth is local `design.pen` and the existing codebase.

## Key Findings

### 1. `design.pen` already defines a repeatable app language

The main interview records frame is not just a one-off page. It includes reusable patterns that can become global primitives:

- Page shell and background treatment
- Title/action bar
- Filter/search controls
- Segmented status tabs
- Data/list containers
- Status badges
- Grouped rows
- Empty and error states
- Contextual side panel

### 2. `/interviews` is the natural reference implementation

Existing files already partially implement the design:

- `apps/web/src/views/InterviewsView.vue`
- `apps/web/src/components/interviews/interview-filter-bar.vue`
- `apps/web/src/components/interviews/interview-record-list.vue`
- `apps/web/src/components/interviews/interview-list-row.vue`
- `apps/web/src/components/interviews/interview-status-badge.vue`

This makes `/interviews` the safest page to refine after Phase 1 rather than starting with a more complex page.

### 3. Current implementation should avoid premature abstraction

The codebase already has `apps/web/src/components/ui/` and `apps/web/src/components/layout/`. Phase 1 should document tokens and adoption targets first. Phase 2 can decide whether to extract shared components or standardize existing components in place.

### 4. Design tokens should start pragmatic

Recommended initial token categories:

- Shell surfaces: app background, desktop shell, command surface, cards
- Borders: subtle blue border levels
- Brand accent: cobalt blue and soft blue backgrounds
- Typography: title/body/meta sizing and weights
- Radius: 6px and 8px primary radii
- Blur/shadow: large background blurs and small row shadows
- Status colors: published, pending, draft, closed, duplicate/error/empty
- Layout dimensions: page padding, title height, filter height, list header height, row height, side panel width

### 5. Phase 1 can be documentation-only

Because the phase goal is "Design Contract", it can complete without runtime code changes. This reduces risk and gives later phases a concrete reference.

## Recommended Phase 1 Deliverables

1. `.planning/design-contract.md` with values and usage rules.
2. `.planning/design-adoption-map.md` mapping patterns to current pages/components.
3. Optional note in `STATE.md` that Phase 1 is planned and ready.

## Risks

- Too much abstraction too early can slow Phase 2.
- Fixed `.pen` dimensions may not directly fit smaller app windows.
- Some pages, especially `ImportView.vue` and `SettingsView.vue`, may need page-specific adaptations later.

## Research Conclusion

Proceed with a documentation-first Phase 1. Do not change runtime UI until the design contract and adoption map are written.
