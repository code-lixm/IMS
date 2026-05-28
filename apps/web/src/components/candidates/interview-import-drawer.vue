<template>
  <Dialog
    :open="open"
    content-class="max-h-[92vh] max-w-5xl gap-0 overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="handleOpenChange"
  >
    <template #content>
      <AppDialogLayout body-class="py-5 pb-0 sm:py-6 sm:pb-0">
        <template #header>
          <DialogHeader class="space-y-2">
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <DialogTitle class="text-[1.45rem] font-semibold tracking-tight text-foreground">导入面试记录</DialogTitle>
              <DialogDescription class="max-w-2xl text-sm leading-6 text-muted-foreground">
                {{ description }}
              </DialogDescription>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <Badge v-if="candidateId" variant="secondary" class="rounded-full px-2 py-0 text-[10px] font-medium">
                {{ candidateName || "当前候选人" }}
              </Badge>
            </div>
          </div>
          </DialogHeader>
        </template>

        <InterviewImportForm
          :open="open"
          :candidate-id="candidateId"
          :candidate-name="candidateName"
          :next-round-number="nextRoundNumber"
          :existing-interview-count="existingInterviewCount"
          class="min-h-full"
          @submitted="emit('submitted', $event)"
          @update:busy="isBusy = $event"
        />
      </AppDialogLayout>
      <div v-if="isBusy" class="absolute inset-0 z-50 flex items-center justify-center rounded-[8px] bg-white/70 backdrop-blur-[4px]">
        <div class="flex flex-col items-center gap-3">
          <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-[#C7D8FF] border-t-[#0062FF]" />
          <p class="text-sm font-medium text-[#1A1A1A]">正在解析面试记录…</p>
          <p class="text-xs text-muted-foreground">请勿关闭此窗口</p>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { InterviewImportCreateResult } from "@/api/interview-import";
import InterviewImportForm from "@/components/import/interview-import-form.vue";
import { Badge } from "@/components/ui/badge";
import { AppDialogLayout } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";

interface InterviewImportDrawerProps {
  open: boolean;
  candidateId?: string;
  candidateName?: string | null;
  nextRoundNumber?: number;
  existingInterviewCount?: number;
}

const props = withDefaults(defineProps<InterviewImportDrawerProps>(), {
  candidateId: "",
  candidateName: null,
  nextRoundNumber: 1,
  existingInterviewCount: 0,
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "submitted", result: InterviewImportCreateResult): void;
}>();

const isBusy = ref(false);

const description = computed(() => (
  props.candidateId
    ? `给${props.candidateName || "当前候选人"}上传简历或会议纪要，系统会自动生成面试记录。`
    : "上传简历或会议纪要，系统会自动识别候选人和轮次。"
));

function handleOpenChange(nextOpen: boolean) {
  if (isBusy.value && !nextOpen) return;
  emit("update:open", nextOpen);
}
</script>
