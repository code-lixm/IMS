<script setup lang="ts">
import type { CheckboxRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Check } from "lucide-vue-next"
import {
  CheckboxIndicator,
  CheckboxRoot,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<CheckboxRootProps<boolean> & {
  checked?: boolean
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<{
  (e: "update:modelValue", value: boolean | "indeterminate"): void
  (e: "update:checked", value: boolean): void
}>()

const delegatedProps = reactiveOmit(props, "checked", "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)

function handleUpdate(value: boolean | "indeterminate") {
  emits("update:modelValue", value)
  emits("update:checked", value === true)
}
</script>

<template>
  <CheckboxRoot
    v-bind="forwarded"
    :model-value="modelValue ?? checked"
    :class="cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      props.class,
    )"
    @update:model-value="handleUpdate"
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <Check class="h-3.5 w-3.5 text-primary-foreground" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
