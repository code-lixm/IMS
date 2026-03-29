<template>
  <div :class="cn(badgeVariants({ variant: props.variant }), props.class)">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10",
        secondary:
          "border border-border/50 bg-secondary text-secondary-foreground dark:bg-muted dark:text-muted-foreground dark:border-border",
        outline: "text-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface BadgeProps
  extends /* @vue-ignore */ VariantProps<typeof badgeVariants> {
  class?: HTMLAttributes["class"];
}

const props = defineProps<BadgeProps>();
</script>
