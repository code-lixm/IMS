# IMS Design Gaps

**Updated:** 2026-05-24

## Deferred Gaps

| Gap | Area | Reason | Recommended Follow-up |
|-----|------|--------|-----------------------|
| LUI workspace visual pass | `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/` | Resolved for v1 restoration. Shell, panels, toolbar, prompt input, conversation list, and workflow artifacts now share the IMS glass/blue visual language. | Keep future changes screenshot-verified because LUI remains interaction-heavy. |
| Candidate detail visual pass | `apps/web/src/views/CandidateDetailView.vue` | Resolved for v1 restoration. Page shell, major detail cards, and resume preview dialog now use the shared IMS glass/blue visual language. | Continue treating document preview constraints separately from list-page pixel parity. |
| Hardcoded design colors remain | Several view/component files | Accepted for v1. Remaining arbitrary values are local UI affordances or one-off state styling, not broad shell drift. | Only migrate further when a value becomes repeated shared design language. |
| Browser visual QA | All aligned pages | Resolved for v1 restoration. Agent-browser screenshots covered aligned management pages, Candidate Detail, and LUI. | Keep screenshots under the temp screenshot directory for this run. |
| shadcn black defaults | `main.css`, `use-theme.ts`, `components/ui/` | Resolved at token level. Core shadcn variables now map to the `design.pen` blue-white palette, and stored legacy neutral themes no longer re-apply black primary/background tokens. | Terminal-like AI components may remain intentionally dark where the interaction pattern requires it. |

## Accepted Tradeoffs

- The `.pen` design is used as a desktop reference. Smaller widths preserve hierarchy rather than fixed pixel parity.
- Existing business logic, API calls, stores, route behavior, and dialogs were preserved.
- Shared primitives remain intentionally minimal to avoid premature abstraction in large interactive pages.

## Not Yet 1:1

- Dedicated `design.pen` frames were added for `CandidateDetailView.vue` and `LUIView.vue`: `候选人详情整页 / 中文规范` and `LUI 工作区 / 中文规范`.
- `CandidateDetailView.vue` now follows the new detail-page frame with a top identity/workspace area and a lower left content + right decision rail layout.
- `LUIView.vue` now follows the new LUI frame at the shell, conversation sidebar, chat area, prompt input, and workflow artifact rail level.
- Full hardcoded-color removal is still unsafe as a blind bulk edit because some arbitrary values encode local state, dialog, and preview affordances.
- After the final screenshot pass, no obvious blank/loading/overflow/遮挡问题 remained in `/interviews`, Candidate Detail, or LUI.
- The shadcn theme layer now uses `design.pen` token values for `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `border`, `input`, and `ring`; the old black/gray theme names are kept only for compatibility with persisted local storage.
