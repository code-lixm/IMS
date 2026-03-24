<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <DialogHeader>
        <DialogTitle>新建候选人</DialogTitle>
        <DialogDescription>填写基础信息后将自动创建候选人。</DialogDescription>
      </DialogHeader>
      <Separator class="my-4" />
      <div class="space-y-3">
        <div class="space-y-1.5">
          <label class="text-xs text-muted-foreground">姓名</label>
          <Input :model-value="modelValue.name" placeholder="候选人姓名" @update:model-value="updateField('name', $event)" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-xs text-muted-foreground">手机号</label>
            <Input :model-value="modelValue.phone" placeholder="13800000000" @update:model-value="updateField('phone', $event)" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs text-muted-foreground">邮箱</label>
            <Input :model-value="modelValue.email" placeholder="example@company.com" @update:model-value="updateField('email', $event)" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-xs text-muted-foreground">岗位</label>
            <Input :model-value="modelValue.position" placeholder="前端工程师" @update:model-value="updateField('position', $event)" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs text-muted-foreground">工作年限</label>
            <Input
              :model-value="modelValue.yearsOfExperience"
              type="number"
              placeholder="5"
              @update:model-value="updateYears"
            />
          </div>
        </div>
      </div>
      <DialogFooter class="mt-6">
        <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="isSubmitting" @click="emit('submit')">
          {{ isSubmitting ? '创建中...' : '创建' }}
        </Button>
      </DialogFooter>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import Input from "@/components/ui/input.vue";
import Separator from "@/components/ui/separator.vue";
import Button from "@/components/ui/button.vue";
import type { CandidateCreateFormValue } from "@/composables/candidates/types";

interface CandidateCreateDialogProps {
  open: boolean;
  modelValue: CandidateCreateFormValue;
  isSubmitting?: boolean;
}

const props = defineProps<CandidateCreateDialogProps>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "update:modelValue", value: CandidateCreateFormValue): void;
  (e: "submit"): void;
}>();

function updateField<K extends keyof CandidateCreateFormValue>(field: K, value: string | number) {
  emit("update:modelValue", {
    ...props.modelValue,
    [field]: typeof value === "string" ? value : String(value),
  });
}

function updateYears(value: string | number) {
  const normalized = String(value).trim();
  emit("update:modelValue", {
    ...props.modelValue,
    yearsOfExperience: normalized ? Number(normalized) : undefined,
  });
}
</script>
