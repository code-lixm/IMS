import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-0 bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
        destructive:
          "border border-[#FECACA] bg-[#FEE2E2] text-[#E7000B] shadow-none hover:bg-[#FEF2F2] hover:text-[#E7000B] dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200",
        outline:
          "border border-[#0063ff14] bg-white text-foreground shadow-none hover:bg-[#F8FAFD] hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10",
        secondary:
          "border border-[#0063ff14] bg-[#F8FAFD] text-secondary-foreground shadow-none hover:bg-[#F3F4F6] hover:text-secondary-foreground dark:border-white/8 dark:bg-white/6 dark:hover:bg-white/10",
        ghost: "border-0 shadow-none hover:bg-[#F8FAFD] hover:text-foreground dark:hover:bg-white/6",
        link: "border-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-9 px-4 py-2",
        "xs": "h-7 rounded px-2",
        "sm": "h-8 rounded-md px-3 text-xs",
        "lg": "h-10 rounded-md px-8",
        "icon": "h-9 w-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
