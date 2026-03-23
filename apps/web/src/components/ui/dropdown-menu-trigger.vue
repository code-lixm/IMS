<template>
  <DropdownMenuTrigger as-child>
    <slot />
  </DropdownMenuTrigger>
</template>

<script setup lang="ts">
import { DropdownMenuTrigger } from "radix-vue";
</script>
