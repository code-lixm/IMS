<template>
  <div
    :class="[
      'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[inherit]',
      containerClass,
    ]"
  >
    <picture>
      <source srcset="/brand-icon-dark.png" media="(prefers-color-scheme: dark)" />
      <img
        src="/brand-icon-light.png"
        alt="IMS"
        :class="['block h-full w-full object-contain', imageClass]"
      />
    </picture>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    containerClass?: string;
    imageClass?: string;
  }>(),
  {
    containerClass: "",
    imageClass: "",
  },
);
</script>
