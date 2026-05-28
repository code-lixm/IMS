# Phase 1 Plan: Design Contract

**Phase:** 1 - Design Contract
**Created:** 2026-05-23
**Mode:** mvp
**Status:** Ready
**Commit Policy:** Do not commit automatically.

## Goal

Create an implementation-ready global design contract from `design.pen` so future phases can align IMS pages consistently without guessing values or patterns.

## Scope

### In Scope

- Document design values from `design.pen`.
- Define pragmatic token names and usage guidance.
- Map design patterns to existing Vue pages/components.
- Create a lightweight verification checklist for Phase 1.

### Out of Scope

- Editing runtime Vue components.
- Extracting shared UI primitives.
- Applying the design to `/interviews` or other pages.
- Backend/API/database changes.
- Full browser QA or full test suites.

## Requirements Covered

- DSGN-01
- DSGN-02
- DSGN-03

## Deliverables

| Deliverable | Path | Purpose |
|-------------|------|---------|
| Design contract | `.planning/design-contract.md` | Concrete implementation reference for global UI language. |
| Adoption map | `.planning/design-adoption-map.md` | Maps design patterns to existing pages/components and later phases. |
| Phase verification | `.planning/phases/phase-1-design-contract/VERIFICATION.md` | Records checks and known gaps. |

## Execution Steps

### Step 1: Write the design contract

Create `.planning/design-contract.md`.

Include these sections:

1. Source and purpose
2. Global visual principles
3. Layout and shell tokens
4. Surface and border tokens
5. Typography tokens
6. Spacing and radius tokens
7. Status color tokens
8. Component pattern specifications
9. Responsive interpretation rules
10. Implementation notes for Vue/Tailwind

Minimum concrete values to include:

- Page width reference: `1440`
- Page padding: top `16`, horizontal `64`, bottom `40`
- Shell radius: `8`
- Standard card radius: `6`
- Title bar height: `48`
- Filter bar height: `112`
- Input/dropdown height: `34`
- Segmented control height: `34`
- Content gap: `20`
- Table header height: `44`
- Section header height: `32`
- Record row height: `68`
- Side panel width: `330`
- Primary blue: `#0062FF`
- Primary text: `#1A1A1A`
- Secondary text: `#4B5563`
- Shell fill: `#F7FAFFD9`
- Card fill: `#ffffffe6` / `#ffffffcc`
- Subtle blue borders: `#0063ff14`, `#0063ff1a`, `#0063ff26`

### Step 2: Define pragmatic token names

In `.planning/design-contract.md`, include token naming proposals that can later map to CSS variables, TypeScript constants, or Tailwind utility conventions.

Recommended names:

- `ims.surface.shell`
- `ims.surface.command`
- `ims.surface.card`
- `ims.surface.cardMuted`
- `ims.border.subtle`
- `ims.border.panel`
- `ims.brand.primary`
- `ims.text.primary`
- `ims.text.secondary`
- `ims.radius.panel`
- `ims.radius.control`
- `ims.layout.pagePaddingX`
- `ims.layout.contentGap`
- `ims.status.published.bg`
- `ims.status.published.text`
- `ims.status.pending.bg`
- `ims.status.pending.text`
- `ims.status.draft.bg`
- `ims.status.draft.text`
- `ims.status.closed.bg`
- `ims.status.closed.text`

### Step 3: Write the adoption map

Create `.planning/design-adoption-map.md`.

Include:

1. Pattern inventory
2. Current implementation targets
3. Phase mapping
4. Pages in initial rollout
5. Deferred pages
6. Risk notes

Minimum targets:

- Reference page: `apps/web/src/views/InterviewsView.vue`
- Interview components: `apps/web/src/components/interviews/`
- Layout primitives: `apps/web/src/components/layout/`
- UI primitives: `apps/web/src/components/ui/`
- Candidate pages: `apps/web/src/views/CandidatesView.vue`, `apps/web/src/views/CandidateDetailView.vue`
- Import page: `apps/web/src/views/ImportView.vue`
- Screening pages: `apps/web/src/views/ScreeningTemplatesView.vue`, `apps/web/src/views/ScreeningTemplateGroupsView.vue`
- Settings page: `apps/web/src/views/SettingsView.vue`
- Deferred LUI page: `apps/web/src/views/LUIView.vue`

### Step 4: Write Phase 1 verification

Create `.planning/phases/phase-1-design-contract/VERIFICATION.md`.

It should confirm:

- Design contract exists.
- Token categories cover DSGN-01 and DSGN-02.
- Adoption map covers DSGN-03 by identifying pages/components for rollout.
- No runtime code changes were made in this phase.
- No commit was made.

### Step 5: Update state

Update `.planning/STATE.md` to show Phase 1 as planned and ready for execution.

Do not mark Phase 1 complete until the deliverables above exist.

## Verification Commands

Use only lightweight verification:

```bash
ls -la .planning .planning/phases/phase-1-design-contract
wc -l .planning/design-contract.md .planning/design-adoption-map.md .planning/phases/phase-1-design-contract/PLAN.md
```

No typecheck is required for Phase 1 if no runtime code changes are made.

## Acceptance Criteria

- `.planning/design-contract.md` exists and contains concrete values from `design.pen`.
- `.planning/design-adoption-map.md` exists and maps patterns to existing code locations.
- `.planning/phases/phase-1-design-contract/VERIFICATION.md` exists after execution.
- Phase 1 keeps runtime behavior unchanged.
- No commits are made automatically.

## Handoff to Phase 2

Phase 2 should use the contract to decide the smallest safe set of shared primitives. It should not re-derive colors, spacing, or page structure from scratch.
