# Phase 1 Context: Design Contract

**Phase:** 1
**Name:** Design Contract
**Date:** 2026-05-23
**Source Design:** `design.pen`
**Commit Policy:** Do not commit automatically.

## Goal

Capture the global UI language from `design.pen` in implementation-ready form before editing multiple pages.

## Requirements Covered

- **DSGN-01**: Developer can reference a documented global UI contract derived from `design.pen` for shell, spacing, typography, colors, borders, radii, blur, and shadows.
- **DSGN-02**: Developer can use named IMS design tokens or centralized constants for status colors, glass surfaces, border colors, and common page backgrounds instead of scattered one-off values.
- **DSGN-03**: User sees a consistent app page shell across aligned management pages, including soft blue background, translucent surfaces, and stable page padding.

## Existing Code Context

- Vue 3 + Tailwind frontend lives in `apps/web/src/`.
- Route views live in `apps/web/src/views/`.
- Shared layout components live in `apps/web/src/components/layout/`.
- shadcn-vue style primitives live in `apps/web/src/components/ui/`.
- Current partial design implementation exists in `apps/web/src/views/InterviewsView.vue` and `apps/web/src/components/interviews/`.
- Design alignment should preserve stores, API clients, routing, server, and desktop behavior.

## Design Source Summary

`design.pen` contains a primary frame named "面试记录 / 产品列表规范". It defines a global visual language that can be generalized beyond `/interviews`:

- App shell: bright, soft blue, translucent desktop-like window surface.
- Background: large blue and mist blur ellipses behind content.
- Title bar: 48px high, left blue accent, 20px semibold title, right compact actions.
- Filter bar: 112px high, translucent white background, 16px padding, 12px vertical gap.
- Inputs/dropdowns: 34px high, 6px radius, 13px text.
- Segmented tabs: 34px high container, 4px gap/padding, 12px semibold labels.
- Content panel: translucent white, 8px radius, subtle blue border, 20px gap.
- List panel: 6px radius, table header 44px high, record rows 68px high, section headers 32px high.
- Right status panel: 330px wide, summary card 184px high, empty card 188px high, error card 120px high.
- Empty state: `inbox` icon, title "没有匹配记录", description "清除筛选或切换状态分组。".
- Error state: `triangle-alert` icon, title "记录同步失败", description "保留当前列表，提示用户重试同步。".

## Constraints

- Do not implement broad page rollout in this phase.
- Do not introduce a new UI framework.
- Do not alter backend contracts or persistence.
- Prefer documentation and minimal token scaffolding over premature component extraction.
- Keep responsive behavior in mind; `.pen` dimensions are design references, not reasons to break smaller windows.

## Expected Outputs

- A developer-facing design contract document.
- A practical token inventory for repeated values.
- A page/component adoption map for future phases.
- A verification checklist for Phase 1.
