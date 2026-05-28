# IMS Design Adoption Map

**Source:** `design.pen`
**Created:** 2026-05-23

## Pattern Inventory

| Pattern | Source in Design | Current/Future Code Target | Phase |
|---------|------------------|----------------------------|-------|
| App shell | desktop window shell, blur layers | `apps/web/src/components/layout/app-page-shell.vue` | 2 |
| Page title bar | 页面标题栏 | `apps/web/src/components/layout/ims-page-title-bar.vue` | 2 |
| Filter bar | 筛选栏 | `apps/web/src/components/interviews/interview-filter-bar.vue`, later shared extraction | 2-4 |
| Segmented tabs | 状态分段 | `apps/web/src/components/interviews/interview-filter-bar.vue` | 2-3 |
| Status badge | row badges | `apps/web/src/components/interviews/interview-status-badge.vue` | 2-3 |
| Product list | 面试记录列表 | `apps/web/src/components/interviews/interview-record-list.vue`, `apps/web/src/components/candidates/candidate-list.vue` | 3-4 |
| Status panel | 状态面板 | `apps/web/src/components/layout/ims-status-panel.vue` | 2-3 |
| Empty state | 空状态 | `apps/web/src/components/ui/empty-state/EmptyState.vue` | 4 |
| Error state | 错误状态 | page-specific state cards using shared classes | 4-5 |

## Page Rollout

| Page | Path | Rollout Approach |
|------|------|------------------|
| Interviews | `apps/web/src/views/InterviewsView.vue` | Reference page. Add right panel, duplicate banner, final spacing. |
| Candidates | `apps/web/src/views/CandidatesView.vue` | Use global shell and align candidate list/card surfaces. |
| Import | `apps/web/src/views/ImportView.vue` | Already close. Normalize shell/header/cards without changing import logic. |
| Screening Templates | `apps/web/src/views/ScreeningTemplatesView.vue` | Apply shell/title/card language. |
| Screening Groups | `apps/web/src/views/ScreeningTemplateGroupsView.vue` | Apply shell/title/card language. |
| Settings | `apps/web/src/views/SettingsView.vue` | Apply shell/panel/card language, keep settings nav behavior. |
| LUI | `apps/web/src/views/LUIView.vue` | Deferred. Large hotspot, not part of v1 rollout. |

## Current Risk Areas

- `apps/web/src/views/LUIView.vue` is large and should not be folded into this pass.
- `apps/web/src/views/ImportView.vue` is large and already partially styled; avoid changing behavior.
- `apps/web/src/views/SettingsView.vue` has many cards; align containers first.
- Candidate list has real store/API behavior; only change classes and layout wrappers.

## Phase Handoff

- Phase 2 should add the smallest shared primitives needed for title/status/shell patterns.
- Phase 3 should complete `/interviews` as the reference page.
- Phase 4 should apply shell/card/state alignment to candidates, import, screening templates, and settings.
