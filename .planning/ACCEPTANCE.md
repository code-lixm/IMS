# IMS Global Design Alignment Acceptance

**Updated:** 2026-05-24

## Result

Phase 1-5 from `.planning/ROADMAP.md` are complete for the v1 scope.

## Evidence

| Area | Evidence |
|------|----------|
| Design contract | `.planning/design-contract.md` |
| Adoption map | `.planning/design-adoption-map.md` |
| Shared primitives | `apps/web/src/components/layout/ims-design.ts`, `ims-page-title-bar.vue`, `ims-page-background.vue` |
| Reference page | `apps/web/src/views/InterviewsView.vue`, `apps/web/src/components/interviews/` |
| Global rollout | `CandidatesView.vue`, `ImportView.vue`, `SettingsView.vue`, `ScreeningTemplatesView.vue`, `ScreeningTemplateGroupsView.vue` |
| Verification | `pnpm typecheck` passed |
| Manual checklist | `.planning/visual-verification.md` |
| Deferred gaps | `.planning/design-gaps.md` |
| Full restoration follow-up | `CandidateDetailView.vue`, `LUIView.vue`, `ims-design.ts` updated with shared detail/LUI classes |
| Final visual fixes | `interview-status-panel.vue`, `conversation-list.vue`, `workflow-artifacts.vue`, Candidate Detail preview dialog |
| Added missing design frames | `design.pen` nodes `VOCry` and `Fa4eY` |
| Design-to-code verification | `candidate-detail-designed.png`, `lui-designed.png`, `VOCry.png`, `Fa4eY.png` |
| Overlay verification | `dialog-delete-fixed.png`, `dropdown-user-fixed.png`, `popover-agent-fixed.png` |
| shadcn theme alignment | `apps/web/src/styles/main.css`, `apps/web/src/composables/use-theme.ts`, `components/ui/button`, `card`, `select`, `hover-card`, `tooltip` |

## Acceptance Notes

- Business logic, API calls, store behavior, and routing were kept unchanged.
- The rollout intentionally avoids full LUI redesign and candidate-detail redesign.
- Missing dedicated Candidate Detail and LUI frames were added to `design.pen`; code was then adjusted against those new frames.
- Dialog, dropdown, and popover overlays were aligned to the same blue-white glass background language.
- shadcn default black tokens were replaced with `design.pen` blue-white tokens at both CSS and runtime theme layers.
- No commit or staging was performed.
