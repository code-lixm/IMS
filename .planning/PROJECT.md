# IMS Global Design Alignment

## What This Is

IMS is a local-first interview management application built with a Tauri desktop shell, Vue 3 web UI, Bun API server, and SQLite storage. This project updates the existing product UI so the current application follows the visual and interaction language defined in `design.pen`, starting from the interview records product-list specification and expanding it into a global app-level UI standard.

The work is not a greenfield rebuild. It is a brownfield design alignment effort that preserves existing routes, stores, API clients, and desktop/server architecture while making shared list pages, filters, cards, status indicators, and empty/error states visually consistent.

## Core Value

IMS should feel like one coherent product: every core management page should share the same glass-like shell, spacing system, status language, and list interaction patterns from `design.pen` without breaking existing workflows.

## Requirements

### Validated

- ✓ IMS runs as a Vue 3 SPA inside browser/Tauri WebView — existing `apps/web/src/main.ts`, `apps/web/src/App.vue`, and `apps/web/src/router/index.ts`.
- ✓ IMS uses reusable UI components and route-level views — existing `apps/web/src/components/` and `apps/web/src/views/`.
- ✓ The project already has an interview records page with partial design implementation — existing `apps/web/src/views/InterviewsView.vue` and `apps/web/src/components/interviews/`.
- ✓ Frontend styling is Tailwind CSS class based with shadcn-vue style primitives — existing `apps/web/vite.config.ts` and `apps/web/src/components/ui/`.
- ✓ API and persistence boundaries stay outside visual components — existing `apps/web/src/api/`, `apps/web/src/stores/`, and `packages/server/src/`.

### Active

- [ ] Define a reusable global design contract from `design.pen` for page shell, background, spacing, typography, borders, glass surfaces, and status colors.
- [ ] Align `/interviews` to the design as the reference implementation for product-list pages.
- [ ] Extract or standardize reusable UI patterns for title bars, filter bars, segmented status tabs, record rows, status badges, side panels, empty states, error states, and duplicate-data notices.
- [ ] Apply the global design language to other management pages where equivalent patterns exist, especially candidate lists, import flows, settings panels, and screening-template pages.
- [ ] Keep existing behavior intact while improving visual fidelity.

### Out of Scope

- Rebuilding the backend API — the work is visual/frontend alignment only unless a UI bug exposes a data-contract issue.
- Replacing Vue, Tailwind, Pinia, Tauri, Bun, or SQLite — existing stack remains.
- Redesigning LUI chat as part of the first alignment pass — `apps/web/src/views/LUIView.vue` is a separate large UI hotspot and should be handled after core management pages.
- Adding a new design tool pipeline — `design.pen` is the source reference, but implementation stays in the current Vue/Tailwind codebase.
- Changing business workflows such as import, sync, AI screening, or candidate persistence unless needed to preserve current UI behavior.

## Context

- The codebase map exists in `.planning/codebase/` and confirms this is a brownfield monorepo with `apps/web`, `apps/desktop`, `packages/server`, and `packages/shared`.
- `design.pen` contains a detailed product-list specification named "面试记录 / 产品列表规范". Its main visual language is a bright glass-morphism app shell with soft blue background blur, translucent cards, compact 6-8px radii, PingFang SC typography, and structured status colors.
- The current `/interviews` implementation already contains a partial version of the design: background blur, title bar, filter bar, grouped list rows, status badges, and mock records.
- Missing or incomplete alignment includes the right-side status panel, full global tokenization, shared pattern extraction, empty/error state consistency, duplicate-data banner placement, and applying the style beyond `/interviews`.
- Existing codebase concerns warn that `apps/web/src/views/LUIView.vue` is a large hotspot. This project should avoid expanding that component during initial global alignment.

## Constraints

- **No automatic commits**: Planning and code changes must not be committed unless the user explicitly asks.
- **Brownfield compatibility**: Existing routes, API clients, stores, and business behavior should remain intact.
- **Frontend scope first**: Changes should primarily target `apps/web/src/`.
- **Current styling approach**: Prefer Tailwind utility classes and existing `components/ui/` primitives before introducing new styling infrastructure.
- **Design source**: `design.pen` is the visual reference for global alignment decisions.
- **Verification**: Use lightweight checks first, especially `pnpm typecheck`; do not run full test suites unless explicitly requested.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat `design.pen` as a global UI specification, not only an `/interviews` mockup | User clarified the target is global alignment | — Pending |
| Use `/interviews` as the reference implementation | It already maps directly to the main design frame and has partial code | — Pending |
| Keep implementation in Vue/Tailwind and existing UI primitives | Minimizes risk in a brownfield app | — Pending |
| Skip automatic commits | User explicitly forbids active commits | ✓ Good |
| Defer LUI visual overhaul | LUI is a large hotspot and should not block core management UI alignment | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** via GSD planning/execution:
1. Requirements invalidated? Move to Out of Scope with reason.
2. Requirements validated? Move to Validated with phase reference.
3. New requirements emerged? Add to Active.
4. Decisions to log? Add to Key Decisions.
5. "What This Is" still accurate? Update if drifted.

**After each milestone**:
1. Review all sections.
2. Confirm the global design alignment goal is still the right priority.
3. Audit Out of Scope items.
4. Update Context with current UI coverage and known visual gaps.

---
*Last updated: 2026-05-23 after initialization*
