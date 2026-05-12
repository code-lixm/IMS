<template>
  <Dialog
    :open="open"
    content-class="max-h-[92vh] max-w-5xl gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/90 p-0 shadow-lg sm:rounded-xl"
    @update:open="handleOpenChange"
  >
    <template #content>
      <div class="flex min-h-0 flex-col bg-card/85">
        <DialogHeader class="space-y-2 px-6 pb-4 pt-5 sm:px-8 sm:pb-4 sm:pt-6">
          <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <DialogTitle class="text-[1.45rem] font-semibold tracking-tight text-foreground">导入历史面试数据</DialogTitle>
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

        <Separator class="opacity-50" />

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-6">
          <InterviewImportForm
            :open="open"
            :candidate-id="candidateId"
            :candidate-name="candidateName"
            :next-round-number="nextRoundNumber"
            :existing-interview-count="existingInterviewCount"
            @submitted="emit('submitted', $event)"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { InterviewImportCreateResult } from "@/api/interview-import";
import InterviewImportForm from "@/components/import/interview-import-form.vue";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

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

const description = computed(() => (
  props.candidateId
    ? `将 PDF 和会议纪要追加到${props.candidateName || "当前候选人"}，系统会自动处理后续轮次与结果状态。`
    : "在同一个面板里完成 PDF 与会议纪要导入；候选人和轮次会由系统自动识别，低置信度时只需确认一次。"
));

function handleOpenChange(nextOpen: boolean) {
  emit("update:open", nextOpen);
}
</script>
