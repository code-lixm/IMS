import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "inline-flex gap-1 items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#EEF4FF] text-[#0062FF] dark:bg-primary/22 dark:text-primary-foreground",
        secondary: "border-transparent bg-[#F3F4F6] text-[#4B5563] dark:bg-white/10 dark:text-slate-200",
        destructive: "border-transparent bg-[#FEF2F2] text-[#E7000B] dark:bg-destructive/18 dark:text-red-200",
        outline: "border-transparent bg-[#F9FAFB] text-[#4B5563] dark:bg-white/8 dark:text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
