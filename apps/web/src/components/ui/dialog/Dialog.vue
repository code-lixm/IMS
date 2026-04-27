<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import type { DialogRootEmits, DialogRootProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { DialogRoot, useForwardPropsEmits } from "reka-ui"
import DialogContent from "./DialogContent.vue"

const props = defineProps<DialogRootProps & {
  contentClass?: HTMLAttributes["class"]
  contentAriaLabel?: string
}>()
const emits = defineEmits<DialogRootEmits>()

const delegatedProps = reactiveOmit(props, "contentClass", "contentAriaLabel")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot />
    <DialogContent
      v-if="$slots.content"
      :aria-label="contentAriaLabel"
      :class="contentClass"
    >
      <slot name="content" />
    </DialogContent>
  </DialogRoot>
</template>
