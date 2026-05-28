<script setup lang="ts">
import { computed, onMounted } from "vue";
import RecorderPanel from "@/components/recorder/recorder-panel.vue";
import { useRecorderStore } from "@/stores/recorder";

const recorderStore = useRecorderStore();

const isDesktopRuntime = computed(
  () =>
    typeof window !== "undefined"
    && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined",
);

onMounted(() => {
  recorderStore.setSupported(isDesktopRuntime.value);
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0 scale-[0.98]"
    enter-to-class="translate-y-0 opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100 scale-100"
    leave-to-class="translate-y-2 opacity-0 scale-[0.98]"
  >
    <RecorderPanel
      v-if="recorderStore.panelOpen"
      class="!fixed right-5 top-[76px] z-[120] sm:right-6"
      :desktop-runtime="isDesktopRuntime"
      @close="recorderStore.setPanelOpen(false)"
    />
  </Transition>
</template>
