# Roadmap: IMS Global Design Alignment

**Created:** 2026-05-23
**Last verified:** 2026-05-24
**Mode:** MVP-style phased rollout
**Requirements:** 19 v1 requirements mapped

## Overview

This roadmap aligns the existing IMS frontend to the global visual language in `design.pen`. It starts by turning the design into an implementation contract, then standardizes shared UI patterns, uses `/interviews` as the reference implementation, rolls the design out to other management pages, and finishes with lightweight verification and gap documentation.

| # | Phase | Goal | Requirements | UI hint |
|---|-------|------|--------------|---------|
| 1 | Design Contract | Capture the global UI language from `design.pen` in implementation-ready form. | DSGN-01, DSGN-02, DSGN-03 | yes |
| 2 | Shared Primitives | Standardize reusable page, filter, badge, row, state, and panel patterns. | COMP-01, COMP-02, COMP-03, COMP-04, COMP-05 | yes |
| 3 | Interviews Reference | Make `/interviews` the canonical design-accurate page. | INTV-01, INTV-02, INTV-03, INTV-04 | yes |
| 4 | Global Rollout | Apply the design language to other management pages without behavior changes. | GLOB-01, GLOB-02, GLOB-03, GLOB-04 | yes |
| 5 | Verification & Gaps | Verify compile/visual checklist and capture deferred gaps. | VERF-01, VERF-02, VERF-03 | yes |

## Phases

### Phase 1: Design Contract

**Goal:** Capture the global UI language from `design.pen` in implementation-ready form.
**Mode:** mvp

**Requirements:** DSGN-01, DSGN-02, DSGN-03

**Success Criteria:**
1. A developer-facing design contract exists in the repo and references `design.pen` as the source.
2. The contract lists concrete values for shell background, blur, spacing, radii, borders, typography, status colors, list dimensions, and panel patterns.
3. The contract identifies which current components/pages should adopt each pattern.
4. No runtime behavior changes are introduced in this phase.

**Likely Files:**
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `apps/web/src/components/interviews/`
- `apps/web/src/components/ui/`
- `apps/web/src/views/`

**Risks:**
- Over-tokenizing too early can slow implementation. Keep tokens pragmatic and tied to repeated values.
- Design values from `.pen` are static; implementation should preserve responsiveness.

### Phase 2: Shared Primitives

**Goal:** Standardize reusable page, filter, badge, row, state, and panel patterns.
**Mode:** mvp

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04, COMP-05

**Success Criteria:**
1. Existing or new shared components cover page title bar, filter bar, segmented tabs, status badges, list rows, state cards, duplicate notices, and status panels.
2. Components preserve current Vue/Tailwind conventions and do not introduce a new UI framework.
3. Status label/color behavior is centralized enough to prevent per-page drift.
4. Components remain usable by `/interviews` and other management pages.

**Likely Files:**
- `apps/web/src/components/interviews/interview-filter-bar.vue`
- `apps/web/src/components/interviews/interview-status-badge.vue`
- `apps/web/src/components/interviews/interview-record-list.vue`
- `apps/web/src/components/interviews/interview-list-row.vue`
- `apps/web/src/components/ui/`
- Potential new shared components under `apps/web/src/components/app/` or `apps/web/src/components/layout/`

**Risks:**
- Extracting too aggressively may create abstractions before usage is proven. Prefer minimal shared primitives.
- Existing route-level views may have page-specific requirements that should not be forced into one component.

### Phase 3: Interviews Reference

**Goal:** Make `/interviews` the canonical design-accurate page.
**Mode:** mvp

**Requirements:** INTV-01, INTV-02, INTV-03, INTV-04

**Success Criteria:**
1. `/interviews` includes the design's title bar, filter bar, grouped records list, right status panel, duplicate conflict row, and duplicate-data banner.
2. Search and status filtering still work after alignment.
3. Empty and error states are represented with components matching the design language.
4. The page can be used as a reference for applying the global design language elsewhere.

**Likely Files:**
- `apps/web/src/views/InterviewsView.vue`
- `apps/web/src/components/interviews/interview-filter-bar.vue`
- `apps/web/src/components/interviews/interview-record-list.vue`
- `apps/web/src/components/interviews/interview-list-row.vue`
- `apps/web/src/components/interviews/interview-status-badge.vue`
- New `apps/web/src/components/interviews/interview-status-panel.vue`
- `apps/web/src/components/interviews/types.ts`

**Risks:**
- Current `/interviews` appears mock-data oriented; do not expand into backend integration unless separately requested.
- Pixel-perfect fixed desktop widths must still degrade gracefully on smaller windows.

### Phase 4: Global Rollout

**Goal:** Apply the design language to other management pages without behavior changes.
**Mode:** mvp

**Requirements:** GLOB-01, GLOB-02, GLOB-03, GLOB-04

**Success Criteria:**
1. Candidate management surfaces use aligned shell, title/action bars, filters, cards, and empty/error states where appropriate.
2. Import workflow surfaces use aligned panels, status/progress indicators, and action styling without changing import behavior.
3. Screening-template and settings pages adopt shared page structure and visual primitives where applicable.
4. Auth, navigation, API calls, data loading, import, candidate, and settings behavior remains unchanged.

**Likely Files:**
- `apps/web/src/views/CandidatesView.vue`
- `apps/web/src/views/CandidateDetailView.vue`
- `apps/web/src/views/ImportView.vue`
- `apps/web/src/views/ScreeningTemplatesView.vue`
- `apps/web/src/views/ScreeningTemplateGroupsView.vue`
- `apps/web/src/views/SettingsView.vue`
- `apps/web/src/components/layout/`
- `apps/web/src/components/ui/`

**Risks:**
- `ImportView.vue` and settings pages may have complex local layouts; apply shared patterns incrementally.
- Avoid touching backend services or store behavior during visual rollout.

### Phase 5: Verification & Gaps

**Goal:** Verify compile/visual checklist and capture deferred gaps.
**Mode:** mvp

**Requirements:** VERF-01, VERF-02, VERF-03

**Success Criteria:**
1. Lightweight type verification passes or any blocker is documented clearly.
2. A visual checklist compares aligned pages against `design.pen` and notes pass/fail status.
3. Deferred visual gaps are documented with owner page/component and recommended follow-up.
4. No automatic commits are made.

**Likely Files:**
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/REQUIREMENTS.md`
- Any created visual checklist under `.planning/`

**Risks:**
- Without browser-level QA, visual fidelity still needs manual review.
- Typecheck success does not prove the running app has reloaded; final notes should include reload requirements.

## Requirement Coverage

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

## Next Step

Phase 1-5 implementation is complete. Continue with the manual review checklist in `.planning/visual-verification.md`, then decide whether to open a follow-up pass for the deferred gaps in `.planning/design-gaps.md`.
