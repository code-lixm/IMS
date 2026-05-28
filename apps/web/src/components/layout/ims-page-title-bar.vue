<template>
  <section :class="cn(imsDesign.titleBar, props.class)">
    <div :class="imsDesign.titleGroup">
      <span :class="imsDesign.titleAccent" />
      <h1 :class="imsDesign.titleText">{{ title }}</h1>
      <slot name="meta" />
    </div>

    <div v-if="$slots.actions" class="flex items-center gap-2.5">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";
import { imsDesign } from "./ims-design";

const props = defineProps<{
  title: string;
  class?: string;
}>();
</script>
