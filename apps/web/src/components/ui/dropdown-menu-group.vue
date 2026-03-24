<template>
  <DropdownMenuGroup v-bind="forwarded">
    <slot />
  </DropdownMenuGroup>
</template>

<script setup lang="ts">
import { DropdownMenuGroup, type DropdownMenuGroupProps, useForwardProps } from 'radix-vue'

const props = defineProps<DropdownMenuGroupProps>()

const forwarded = useForwardProps(props)
</script>
