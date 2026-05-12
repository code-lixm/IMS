<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  CreateScreeningTemplateGroupInput,
  MatchingTemplate,
  ScreeningTemplateGroupDetailData,
  UpdateScreeningTemplateGroupInput,
  UpdateScreeningTemplateGroupTemplatesInput,
} from "@ims/shared";
import { DEFAULT_BATCH_SCREENING_CONFIG } from "@ims/shared";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { screeningTemplatesApi } from "@/api/screening-templates";

interface Props {
  open: boolean;
  group?: ScreeningTemplateGroupDetailData | null;
  templates: MatchingTemplate[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "success"): void;
}>();

interface FormData {
  name: string;
  description: string;
  passThreshold: number;
  reviewThreshold: number;
  learningEnabled: boolean;
  selectedTemplateIds: string[];
  defaultTemplateId: string | null;
}

const isSubmitting = ref(false);
const error = ref<string | null>(null);
const isEditing = computed(() => Boolean(props.group));

const formData = ref<FormData>({
  name: "",
  description: "",
  passThreshold: DEFAULT_BATCH_SCREENING_CONFIG.passThreshold,
  reviewThreshold: DEFAULT_BATCH_SCREENING_CONFIG.reviewThreshold,
  learningEnabled: DEFAULT_BATCH_SCREENING_CONFIG.learningEnabled,
  selectedTemplateIds: [],
  defaultTemplateId: null,
});

const selectedTemplates = computed(() => props.templates.filter((template) => formData.value.selectedTemplateIds.includes(template.id)));

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    if (props.group) {
      formData.value = {
        name: props.group.group.name,
        description: props.group.group.description ?? "",
        passThreshold: props.group.group.passThreshold,
        reviewThreshold: props.group.group.reviewThreshold,
        learningEnabled: props.group.group.learningEnabled,
        selectedTemplateIds: props.group.templates.map((template) => template.id),
        defaultTemplateId: props.group.defaultTemplate?.id ?? null,
      };
    } else {
      formData.value = {
        name: "",
        description: "",
        passThreshold: DEFAULT_BATCH_SCREENING_CONFIG.passThreshold,
        reviewThreshold: DEFAULT_BATCH_SCREENING_CONFIG.reviewThreshold,
        learningEnabled: DEFAULT_BATCH_SCREENING_CONFIG.learningEnabled,
        selectedTemplateIds: [],
        defaultTemplateId: null,
      };
    }

    error.value = null;
  },
);

function handleClose() {
  emit("update:open", false);
}

function isTemplateSelected(templateId: string) {
  return formData.value.selectedTemplateIds.includes(templateId);
}

function toggleTemplate(templateId: string, checked: boolean) {
  const next = new Set(formData.value.selectedTemplateIds);
  if (checked) {
    next.add(templateId);
  } else {
    next.delete(templateId);
  }

  formData.value.selectedTemplateIds = Array.from(next);
  if (!formData.value.selectedTemplateIds.includes(formData.value.defaultTemplateId ?? "")) {
    formData.value.defaultTemplateId = null;
  }
}

function validateForm() {
  if (!formData.value.name.trim()) {
    return "请输入分组名称";
  }

  if (formData.value.reviewThreshold < 0 || formData.value.reviewThreshold > 100) {
    return "待定阈值需在 0 到 100 之间";
  }

  if (formData.value.passThreshold < 0 || formData.value.passThreshold > 100) {
    return "通过阈值需在 0 到 100 之间";
  }

  if (formData.value.reviewThreshold > formData.value.passThreshold) {
    return "待定阈值不能高于通过阈值";
  }

  if (
    formData.value.defaultTemplateId
    && !formData.value.selectedTemplateIds.includes(formData.value.defaultTemplateId)
  ) {
    return "默认模板必须属于当前分组";
  }

  return null;
}

async function handleSubmit() {
  error.value = validateForm();
  if (error.value) {
    return;
  }

  isSubmitting.value = true;

  try {
    if (props.group) {
      const updateData: UpdateScreeningTemplateGroupInput = {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        passThreshold: formData.value.passThreshold,
        reviewThreshold: formData.value.reviewThreshold,
        learningEnabled: formData.value.learningEnabled,
      };
      const templateData: UpdateScreeningTemplateGroupTemplatesInput = {
        templateIds: formData.value.selectedTemplateIds,
        defaultTemplateId: formData.value.defaultTemplateId,
      };

      await screeningTemplatesApi.updateGroup(props.group.group.id, updateData);
      await screeningTemplatesApi.updateGroupTemplates(props.group.group.id, templateData);
    } else {
      const createData: CreateScreeningTemplateGroupInput = {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
        passThreshold: formData.value.passThreshold,
        reviewThreshold: formData.value.reviewThreshold,
        learningEnabled: formData.value.learningEnabled,
        templateIds: formData.value.selectedTemplateIds,
        defaultTemplateId: formData.value.defaultTemplateId,
      };
      await screeningTemplatesApi.createGroup(createData);
    }

    emit("success");
    emit("update:open", false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存失败";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[720px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing ? "编辑分组" : "新建分组" }}</DialogTitle>
      </DialogHeader>

      <div class="max-h-[70vh] space-y-5 overflow-y-auto py-4 pr-1">
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2 md:col-span-2">
            <Label for="group-name">分组名称 <span class="text-destructive">*</span></Label>
            <Input id="group-name" v-model="formData.name" placeholder="例如：研发岗基础筛选" :disabled="isSubmitting" />
          </div>

          <div class="space-y-2 md:col-span-2">
            <Label for="group-description">分组说明</Label>
            <Textarea
              id="group-description"
              v-model="formData.description"
              placeholder="补充这个分组适用的岗位、策略和说明"
              :rows="3"
              :disabled="isSubmitting"
            />
          </div>

          <div class="space-y-2">
            <Label for="review-threshold">待定阈值</Label>
            <Input id="review-threshold" v-model.number="formData.reviewThreshold" type="number" min="0" max="100" :disabled="isSubmitting" />
          </div>

          <div class="space-y-2">
            <Label for="pass-threshold">通过阈值</Label>
            <Input id="pass-threshold" v-model.number="formData.passThreshold" type="number" min="0" max="100" :disabled="isSubmitting" />
          </div>
        </div>

        <div class="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
          <div class="space-y-1">
            <p class="text-sm font-medium">启用学习反馈</p>
            <p class="text-xs text-muted-foreground">允许导入页基于该分组记录人工改分反馈</p>
          </div>
          <Switch :model-value="formData.learningEnabled" :disabled="isSubmitting" @update:model-value="formData.learningEnabled = Boolean($event)" />
        </div>

        <div class="space-y-3 rounded-lg border border-border/60 p-4">
          <div class="space-y-1">
            <p class="text-sm font-medium">分组内模板</p>
            <p class="text-xs text-muted-foreground">分组负责组合模板和阈值，导入页只选择分组，不直接承担管理职责</p>
          </div>

          <div v-if="templates.length === 0" class="text-sm text-muted-foreground">
            暂无可选模板，请先到模板管理页面创建模板。
          </div>

          <div v-else class="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
            <label
              v-for="template in templates"
              :key="template.id"
              class="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-background/80"
            >
              <Checkbox
                :checked="isTemplateSelected(template.id)"
                :disabled="isSubmitting"
                @update:checked="toggleTemplate(template.id, Boolean($event))"
              />
              <span class="min-w-0 flex-1 space-y-1">
                <span class="flex items-center gap-2 text-sm font-medium">
                  <span class="truncate">{{ template.name }}</span>
                  <span v-if="template.isDefault" class="text-[10px] text-muted-foreground">系统默认</span>
                </span>
                <span v-if="template.description" class="block text-xs text-muted-foreground">{{ template.description }}</span>
              </span>
            </label>
          </div>

          <div class="space-y-2">
            <Label>默认模板</Label>
            <Select
              :model-value="formData.defaultTemplateId ?? ''"
              :disabled="isSubmitting || selectedTemplates.length === 0"
              @update:model-value="formData.defaultTemplateId = String($event) || null"
            >
              <SelectTrigger>
                <SelectValue :placeholder="selectedTemplates.length === 0 ? '请先勾选模板' : '选择默认模板（可选）'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="template in selectedTemplates" :key="template.id" :value="template.id">
                  {{ template.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" :disabled="isSubmitting" @click="handleClose">取消</Button>
        <Button :disabled="isSubmitting" @click="handleSubmit">
          {{ isSubmitting ? "保存中..." : isEditing ? "保存" : "创建" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
