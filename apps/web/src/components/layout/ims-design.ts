/*
 * Unified depth system — 3 levels only.
 *
 * L0 page   — page shell background, no border
 * L1 panel  — main content panels: subtle border, solid bg
 * L2 item   — nested items inside panels: lighter bg, optional border
 *
 * All business pages should use these tokens instead of hand-writing
 * border/bg/blur combinations. This eliminates "card-in-card" visual noise.
 */
const depth = {
  /** Page-level background — no border, no card feel */
  l0Page: "bg-[#F7FAFF] dark:bg-[hsl(var(--background))]",
  /** Main content panel — one subtle border, solid bg */
  l1Panel: "rounded-[8px] border border-[#0063ff14] bg-white dark:border-white/10 dark:bg-card",
  /** Nested item inside a panel — lighter, optional border */
  l2Item: "rounded-[6px] border border-[#0063ff14] bg-[#F8FAFD] dark:border-white/8 dark:bg-white/5",
  /** Soft nested item — no border, tinted bg */
  l2Soft: "rounded-[6px] bg-[#EEF4FF] dark:bg-white/8",
} as const

export const imsDesign = {
  /* ── Shell & layout ── */
  shell: `relative isolate overflow-hidden ${depth.l0Page}`,
  pageContent: "relative z-[1] flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-4 py-4 lg:px-16",
  ambientCobalt: "pointer-events-none absolute left-[84px] top-6 h-[440px] w-[720px] rounded-full bg-[#0062FF33] blur-[78px]",
  ambientMist: "pointer-events-none absolute right-[60px] top-10 h-[380px] w-[620px] rounded-full bg-[#93C5FD66] blur-[92px]",

  /* ── Title bar ── */
  titleBar: "flex h-12 shrink-0 items-center justify-between rounded-[6px]",
  titleGroup: "flex items-center gap-2.5",
  titleAccent: "h-5 w-1 rounded-[2px] bg-[#0062FF]",
  titleText: "text-[20px] font-semibold leading-none text-[#1A1A1A] dark:text-slate-100",

  /* ── Buttons ── */
  secondaryButton: "h-9 rounded-[6px] bg-[#F9FAFB] px-3.5 text-[13px] font-semibold text-[#1A1A1A] shadow-none hover:bg-[#F3F4F6] dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14",
  primaryButton: "h-9 rounded-[6px] bg-[#0062FF] px-3.5 text-[13px] font-semibold text-white shadow-[0_5px_12px_-8px_#0B6BFF33] hover:bg-[#0057E5]",

  /* ── Depth tokens (canonical) ── */
  contentPanel: `relative z-[1] flex min-h-0 flex-1 gap-5 p-0 ${depth.l1Panel}`,
  panel: depth.l1Panel,
  item: depth.l2Item,
  softItem: depth.l2Soft,

  /* ── Legacy aliases — prefer panel/item/softItem above ── */
  glassCard: `border ${depth.l1Panel}`,
  card: depth.l1Panel,
  mutedCard: depth.l2Item,
  stateCard: depth.l2Item,
  detailSection: depth.l1Panel,
  detailItem: depth.l2Item,
  detailSoftItem: depth.l2Soft,

  /* ── List ── */
  listHeader: "h-11 shrink-0 rounded-t-[6px] bg-[#F8FAFD] px-4 text-[12px] font-semibold text-[#4B5563] dark:bg-white/5 dark:text-slate-300",
  row: "min-h-[68px] rounded-[6px] px-3 py-3 transition-colors",
  rowTitle: "truncate text-[15px] font-semibold leading-5 text-[#1A1A1A] dark:text-slate-100",
  rowMeta: "truncate text-[12px] leading-4 text-[#4B5563] dark:text-slate-300",

  /* ── Detail page ── */
  detailPageContent: "relative z-[1] px-4 py-5 lg:px-16",
  detailGrid: "grid gap-4 mb-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]",

  /* ── LUI — maps to same depth levels ── */
  luiShell: `relative flex h-screen w-full overflow-hidden text-[#1A1A1A] ${depth.l0Page} dark:text-slate-100`,
  luiPanel: depth.l1Panel,
  luiSubPanel: depth.l2Item,
  luiToolbar: depth.l2Item,
  luiControl: "rounded-[6px] bg-[#F9FAFB] text-[#4B5563] shadow-none hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/14 dark:hover:text-white",
} as const;

export const imsStatusStyles = {
  published: {
    label: "已发布",
    badge: "bg-[#EAF3FF] text-[#0062FF]",
    bg: "#EAF3FF",
    text: "#0062FF",
  },
  pending: {
    label: "待确认",
    badge: "bg-[#FFFBEB] text-[#B45309]",
    bg: "#FFFBEB",
    text: "#B45309",
  },
  draft: {
    label: "草稿",
    badge: "bg-[#FFF7ED] text-[#C2410C]",
    bg: "#FFF7ED",
    text: "#C2410C",
  },
  closed: {
    label: "已结束",
    badge: "bg-[#F3F4F6] text-[#6B7280]",
    bg: "#F3F4F6",
    text: "#6B7280",
  },
  duplicate: {
    label: "重复待处理",
    badge: "bg-[#FEF2F2] text-[#DC2626]",
    bg: "#FEF2F2",
    text: "#DC2626",
  },
} as const;
