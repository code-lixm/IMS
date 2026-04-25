<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { MatchingTemplate, CreateMatchingTemplateInput, UpdateMatchingTemplateInput } from "@ims/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Button from "@/components/ui/button.vue";
import Input from "@/components/ui/input.vue";
import Label from "@/components/ui/label.vue";
import Textarea from "@/components/ui/textarea.vue";
import Checkbox from "@/components/ui/checkbox.vue";
import { screeningTemplatesApi } from "@/api/screening-templates";

interface Props {
  open: boolean;
  template?: MatchingTemplate | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "success"): void;
}>();

const isSubmitting = ref(false);
const error = ref<string | null>(null);

const isEditing = computed(() => !!props.template);

const formData = ref({
  name: "",
  description: "",
  prompt: "",
  isDefault: false,
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.template) {
        formData.value = {
          name: props.template.name,
          description: props.template.description || "",
          prompt: props.template.prompt || "",
          isDefault: props.template.isDefault,
        };
      } else {
        formData.value = {
          name: "",
          description: "",
          prompt: "",
          isDefault: false,
        };
      }
      error.value = null;
    }
  }
);

async function handleSubmit() {
  if (!formData.value.name.trim()) {
    error.value = "请输入模板名称";
    return;
  }

  if (!formData.value.prompt.trim()) {
    error.value = "请输入模板内容";
    return;
  }

  isSubmitting.value = true;
  error.value = null;

  try {
    if (isEditing.value && props.template) {
      const updateData: UpdateMatchingTemplateInput = {
        name: formData.value.name,
        description: formData.value.description,
        prompt: formData.value.prompt,
        isDefault: formData.value.isDefault,
      };
      await screeningTemplatesApi.update(props.template.id, updateData);
    } else {
      const createData: CreateMatchingTemplateInput = {
        name: formData.value.name,
        description: formData.value.description,
        prompt: formData.value.prompt,
        isDefault: formData.value.isDefault,
      };
      await screeningTemplatesApi.create(createData);
    }
    emit("success");
    emit("update:open", false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "操作失败";
  } finally {
    isSubmitting.value = false;
  }
}

function handleClose() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? "编辑模板" : "新建模板" }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="name">模板名称 <span class="text-destructive">*</span></Label>
          <Input
            id="name"
            v-model="formData.name"
            placeholder="输入模板名称"
            :disabled="isSubmitting"
          />
        </div>

        <div class="space-y-2">
          <Label for="description">描述</Label>
          <Input
            id="description"
            v-model="formData.description"
            placeholder="输入模板描述（可选）"
            :disabled="isSubmitting"
          />
        </div>

        <div class="space-y-2">
          <Label for="prompt">
            模板内容 <span class="text-destructive">*</span>
            <span class="text-xs text-muted-foreground ml-2">支持 Markdown 格式</span>
          </Label>
          <Textarea
            id="prompt"
            v-model="formData.prompt"
            placeholder="输入模板内容..."
            :rows="10"
            :disabled="isSubmitting"
          />
        </div>

        <div class="flex items-center space-x-2">
          <Checkbox
            id="isDefault"
            :checked="formData.isDefault"
            @update:checked="formData.isDefault = $event"
            :disabled="isSubmitting"
          />
          <Label for="isDefault" class="text-sm font-normal cursor-pointer">
            设为默认模板
          </Label>
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isSubmitting" @click="handleClose">
          取消
        </Button>
        <Button :disabled="isSubmitting" @click="handleSubmit">
          {{ isSubmitting ? "保存中..." : isEditing ? "保存" : "创建" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
