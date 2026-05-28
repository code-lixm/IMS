# IMS Design Contract

**Source:** `design.pen`
**Created:** 2026-05-23
**Purpose:** Turn the design file into implementation rules for Vue/Tailwind UI work.

## Visual Principles

- Use a bright local-desktop workspace feeling: soft blue background, translucent white surfaces, subtle blue borders.
- Keep controls compact. Most controls use 6px radius and 34-38px height.
- Prefer calm hierarchy: black-tinted primary text, gray secondary text, one cobalt accent.
- Use glass and blur as the app shell language, not as random decoration.
- Preserve current business behavior. This contract only governs UI structure and styling.

## Core Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `ims.brand.primary` | `#0062FF` | Primary action, title accent, selected state |
| `ims.text.primary` | `#1A1A1A` | Titles and primary row text |
| `ims.text.secondary` | `#4B5563` | Meta text, placeholders, secondary labels |
| `ims.surface.shell` | `#F7FAFFD9` | App shell/background panel |
| `ims.surface.command` | `#F8FAFFE6` | Header/command wash |
| `ims.surface.card` | `#ffffffe6` | Primary glass cards |
| `ims.surface.cardMuted` | `#ffffffcc` | Secondary glass cards |
| `ims.surface.softBlue` | `#EEF4FF` | Selected/active blue wash |
| `ims.surface.muted` | `#F9FAFB` | Muted rows and neutral panels |
| `ims.surface.neutral` | `#F3F4F6` | Pending/duplicate surfaces |
| `ims.border.subtle` | `#0063ff14` | Light panel borders |
| `ims.border.panel` | `#0063ff1a` | Stronger panel borders |
| `ims.border.shell` | `#0063ff26` | Shell outline |
| `ims.radius.panel` | `8px` | Page/content shells |
| `ims.radius.control` | `6px` | Cards, buttons, inputs, rows |

## Layout Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `ims.layout.pagePaddingX` | `64px` | Desktop page horizontal padding |
| `ims.layout.pagePaddingTop` | `16px` | Main page top padding |
| `ims.layout.pagePaddingBottom` | `40px` | Main page bottom padding |
| `ims.layout.contentGap` | `20px` | Major vertical/horizontal content gap |
| `ims.layout.titleBarHeight` | `48px` | Page title/action row |
| `ims.layout.filterHeight` | `112px` | Product-list filter block |
| `ims.layout.controlHeight` | `34px` | Search/select/segmented controls |
| `ims.layout.tableHeaderHeight` | `44px` | List table header |
| `ims.layout.groupHeaderHeight` | `32px` | Group section header |
| `ims.layout.recordRowHeight` | `68px` | Standard record row |
| `ims.layout.statusPanelWidth` | `330px` | Right-side status panel |

## Typography

| Role | Size | Weight | Color |
|------|------|--------|-------|
| Page title | `20px` | `600` | `#1A1A1A` |
| Card title | `16px` | `650` | `#1A1A1A` |
| Row title | `15px` | `650` | `#1A1A1A` |
| Body/control | `13px` | `400-650` | `#1A1A1A` |
| Meta/table label | `12px` | `400-650` | `#4B5563` |

## Status Tokens

| Status | Background | Text |
|--------|------------|------|
| Published | `#EAF3FF` | `#0062FF` |
| Pending | `#F3F4F6` | `#4B5563` |
| Draft | `#FFF7ED` | `#C2410C` |
| Closed | `#F3F4F6` | `#6B7280` |
| Duplicate | `#F3F4F6` | `#4B5563` |
| Error | `#F9FAFB` | `#1A1A1A` |

## Pattern Specs

### Page Shell

- Background: `#F7FAFF` with soft cobalt and mist blur layers.
- Desktop padding: `px-16 py-4` for dense product pages, `px-16 py-6` for workbench pages.
- Main content should sit above ambient layers with `relative z-[1]`.

### Title Bar

- Height: `48px`.
- Left accent: `4px × 20px`, radius `2px`, color `#0062FF`.
- Title: `20px`, semibold, line-height near `1.15`.
- Actions: compact 36px buttons, 10px gap.

### Filter Bar

- Height: `112px`.
- Background: `#ffffffe6` with backdrop blur.
- Radius: `6px`, padding `16px`, vertical gap `12px`.
- Search/select row: `34px` high, 12px gap.
- Segmented row: `34px` high, 4px inner padding/gap.

### Product List

- Container: translucent white card, 6px radius, subtle blue border.
- Header: `44px` high, 12px gap, 16px horizontal padding.
- Group header: `32px` high, 14px horizontal padding.
- Row: `68px` high, 12px horizontal padding, small shadow.
- Duplicate row: neutral fill, explicit badge and action.

### Status Panel

- Width: `330px`.
- Summary card: `184px` high, 16px padding, 10px gap.
- Empty card: `188px` high, centered `Inbox` icon, title, description.
- Error card: `120px` high, horizontal layout with `TriangleAlert` icon.

## Responsive Rules

- Treat `.pen` dimensions as desktop reference values.
- On smaller windows, preserve hierarchy before exact width.
- Side panels may stack below the main list when width is constrained.
- Avoid fixed widths that cause horizontal overflow outside dense table/list contexts.

## Implementation Notes

- Prefer Tailwind utility classes and existing `components/ui/` primitives.
- Centralize repeated values before broad rollout.
- Do not modify server/API/store behavior for visual alignment.
- `/interviews` is the canonical reference page for Phase 3.
