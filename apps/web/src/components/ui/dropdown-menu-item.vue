<template>
  <DropdownMenuItem
    :class="cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0', props.class)"
  >
    <slot />
  </DropdownMenuItem>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { DropdownMenuItem } from "radix-vue";
import { cn } from "@/lib/utils";

interface DropdownMenuItemProps {
  class?: HTMLAttributes["class"];
  disabled?: boolean;
  destructive?: boolean;
}

const props = defineProps<DropdownMenuItemProps>();
</script>
