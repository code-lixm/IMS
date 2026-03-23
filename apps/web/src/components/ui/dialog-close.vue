<template>
  <button
    type="button"
    class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
    @click="emit('update:open', false)"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
const emit = defineEmits<{ (e: "update:open", v: boolean): void }>();
</script>
