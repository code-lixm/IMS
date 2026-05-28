# IMS Visual Verification

**Source:** `design.pen`
**Updated:** 2026-05-24
**Verification mode:** lightweight code and screenshot verification. Browser-level screenshot QA was run with agent-browser via Chrome CDP.
**Browser pass:** 2026-05-24. Login was skipped with `sessionStorage.ims:skipBaobaoLogin = "1"`.

## Automated Checks

| Check | Result | Notes |
|-------|--------|-------|
| `pnpm typecheck` | Pass | Shared, server, and web type checks completed successfully. |
| shadcn theme token pass | Pass | `main.css` and `use-theme.ts` now derive core shadcn tokens from `design.pen`; `pnpm typecheck` passed after the token and primitive updates. |

## Browser Screenshots

Screenshots were saved under `/var/folders/s2/8mvzvbcn7wq7cj_b1y8hy44m0000gn/T/opencode/ims-screenshots/`.

| Page | Screenshot | Result | Notes |
|------|------------|--------|-------|
| `/interviews` | `interviews.png` | Pass with note | No page errors or obvious breakage. The captured state has large empty space in the right-side status/detail area. |
| `/candidates` | `candidates.png` | Pass | No page errors captured. |
| `/candidates/:id` | `candidate-detail.png` | Pass | No obvious blank/loading/overflow breakage in quick visual inspection. |
| `/lui?candidateId=...` | `lui.png` | Pass | No obvious shell/panel breakage. Nested LUI details still need focused visual review. |
| `/import` | `import.png` | Pass | No obvious blank/loading/overflow breakage in quick visual inspection. |
| `/settings` | `settings.png` | Pass | No page errors captured. |
| `/screening/templates` | `screening-templates.png` | Pass | No page errors captured. |
| `/screening/template-groups` | `screening-template-groups.png` | Pass | No page errors captured. |

## Fix Verification Screenshots

| Page | Screenshot | Result | Notes |
|------|------------|--------|-------|
| `/interviews` | `interviews-fixed.png` | Pass | Right panel content density was improved; no obvious blank/loading/overflow/遮挡 issue remains. |
| `/candidates/:id` | `candidate-detail-fixed.png` | Pass | Detail page and preview-related styling were further aligned; no obvious breakage remains. |
| `/lui?candidateId=...` | `lui-fixed.png` | Pass | LUI shell, conversation list, and workflow artifact styling were further aligned; no obvious breakage remains. |

## Overlay Verification Screenshots

| Surface | Screenshot | Result | Notes |
|---------|------------|--------|-------|
| Candidate delete dialog | `dialog-delete-fixed.png` | Pass | Global dialog overlay/content now uses light blue glass backdrop, translucent surface, subtle blue border, and glass close button. |
| User menu dropdown | `dropdown-user-fixed.png` | Pass | Dropdown surface keeps blue-white glass treatment and no longer feels like a plain white menu. |
| LUI Agent popover | `popover-agent-fixed.png` | Pass | Popover surface now uses shared blue-white glass treatment instead of the previous plain white card. |

## Added Design Frames

| Design Frame | Node | Export | Code Screenshot | Result |
|--------------|------|--------|-----------------|--------|
| 候选人详情整页 / 中文规范 | `VOCry` | `VOCry.png` | `candidate-detail-designed.png` | Pass |
| LUI 工作区 / 中文规范 | `Fa4eY` | `Fa4eY.png` | `lui-designed.png` | Pass |

Notes:
- The new frames were added to `design.pen` because the previous file had no dedicated full-page Candidate Detail or LUI design frame.
- Quick visual checks found no obvious clipping, overlap, blank state, or style breakage in the exported design frames or matching code screenshots.

## Page Checklist

| Area | Status | Notes |
|------|--------|-------|
| `/interviews` shell | Pass | Uses shared IMS shell, ambient background, title bar, list panel, and right status panel. |
| `/interviews` list states | Pass | Grouped records, duplicate notice, empty state, and status badges use the design language. |
| `/candidates` shell | Pass | Page shell and content spacing now use the shared IMS background treatment. |
| `/import` shell | Pass | Existing import workflow keeps behavior and adopts the shared background layer. |
| `/settings` shell | Pass | Settings page outer surface now follows the shared IMS shell treatment. |
| Screening templates | Pass | Template and template-group pages use the shared shell/background wrapper. |
| LUI page | Deferred | Large AI workspace remains out of this rollout to avoid behavior and layout regression. |
| Candidate detail page | Deferred | Needs a focused pass because it is a separate detail-workspace pattern. |

## Full Restoration Pass

| Area | Status | Notes |
|------|--------|-------|
| Candidate detail shell | Pass | Adopted shared IMS shell, ambient background, content spacing, and major card styling. |
| LUI shell | Pass | Adopted shared IMS shell, panel, toolbar, and prompt-input styling while preserving resizable layout behavior. |
| Nested LUI components | Pass for v1 | Conversation list and workflow artifacts now share the IMS glass/blue visual language. |
| Resume preview dialog | Pass for v1 | Preview shell and document cards now share the IMS glass/blue visual language while preserving preview constraints. |

## Theme Token Pass

| Area | Status | Notes |
|------|--------|-------|
| Global shadcn variables | Pass | Replaced black/gray defaults with `design.pen` blue-white HSL values for background, foreground, primary, card, popover, muted, accent, border, input, and ring. |
| Runtime theme override | Pass | `use-theme.ts` now maps all legacy theme names to the IMS design token set, so existing localStorage values cannot restore black primary styling. |
| UI primitives | Pass | Button, Card, SelectContent, HoverCardContent, and TooltipContent default styles now use blue-white glass surfaces and cobalt accents. |
| Settings appearance labels | Pass | The theme picker copy and color dots now describe the IMS design palette instead of black/gray shadcn palettes. |

## Manual Morning Checklist

1. Restart the dev server if it was already running before these edits.
2. Open `/interviews` and compare the title bar, filter bar, grouped list, duplicate row, and right panel against `design.pen`.
3. Open `/candidates` and confirm search, import, interview import, sync, pagination, and candidate selection still work.
4. Open `/import` and confirm the import wizard/progress panels still work and no background layer covers controls.
5. Open `/settings` and confirm dialogs, update check, account actions, and form controls remain clickable.
6. Open `/screening/templates` and `/screening/template-groups` and confirm create/edit/delete dialogs still open.
7. Resize the window below desktop width and confirm no key page becomes unusable. Exact pixel matching is only expected on desktop width.

## Notes

- Typecheck success proves the edited code compiles; it does not prove a currently running Vite/Tauri process has reloaded the latest files.
- No commit or staging was performed.
