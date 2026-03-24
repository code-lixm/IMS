<template>
  <div
    v-if="feedback"
    class="mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
    :class="toneClass"
  >
    <p class="min-w-0 flex-1 break-words">{{ feedback.message }}</p>
    <Button variant="ghost" size="sm" class="h-7 px-2" @click="emit('dismiss')">
      关闭
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/button.vue";
import type { CandidateActionFeedback } from "@/composables/candidates/types";

interface CandidateFeedbackBannerProps {
  feedback: CandidateActionFeedback | null;
}

const props = defineProps<CandidateFeedbackBannerProps>();

const emit = defineEmits<{
  (e: "dismiss"): void;
}>();

const toneClass = computed(() => {
  switch (props.feedback?.tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "error":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-border bg-muted/60 text-foreground";
  }
});
</script>
