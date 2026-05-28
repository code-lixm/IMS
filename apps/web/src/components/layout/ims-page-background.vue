<template>
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
    <div :class="imsDesign.ambientCobalt" />
    <div :class="imsDesign.ambientMist" />
  </div>
</template>

<script setup lang="ts">
import { imsDesign } from "./ims-design";
</script>
