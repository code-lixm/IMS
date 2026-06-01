<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { MatchingTemplate } from "@ims/shared";
import { ApiError } from "@/api/client";
import { screeningTemplatesApi } from "@/api/screening-templates";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppUserActions from "@/components/app-user-actions.vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import TemplateFormDialog from "@/components/import/template-form-dialog.vue";
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
} from "lucide-vue-next";

type TemplateUsageGroup = {
  id: string;
  name: string;
};

type TemplateWeights = {
  resume: number;
  skills: number;
  experience: number;
};

type TemplateWeightItem = {
  key: keyof TemplateWeights;
  label: string;
  description: string;
};

type TemplateWeightSummaryItem = TemplateWeightItem & {
  value: number;
};

const DEFAULT_WEIGHTS: TemplateWeights = {
  resume: 40,
  skills: 35,
  experience: 25,
};

const TEMPLATE_WEIGHT_ITEMS: TemplateWeightItem[] = [
  {
    key: "resume",
    label: "简历完整度",
    description: "信息结构与基础字段",
  },
  {
    key: "skills",
    label: "技能匹配",
    description: "岗位关键词与能力栈",
  },
  {
    key: "experience",
    label: "项目经历",
    description: "实践深度与相关经验",
  },
];

const templates = ref<MatchingTemplate[]>([]);
const templateUsageMap = ref<Record<string, TemplateUsageGroup[]>>({});
const loading = ref(false);
const dialogOpen = ref(false);
const editingTemplate = ref<MatchingTemplate | null>(null);

const hasTemplates = computed(() => templates.value.length > 0);

function getTemplateUsages(templateId: string) {
  return templateUsageMap.value[templateId] ?? [];
}

function getTemplateUsageNames(templateId: string) {
  return getTemplateUsages(templateId).map((group) => group.name);
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw?.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getTemplateWeights(template: MatchingTemplate): TemplateWeights {
  const parsed = parseJson(template.matchHintsJson);
  const objectValue =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  const weights =
    objectValue?.weights && typeof objectValue.weights === "object"
      ? (objectValue.weights as Partial<Record<keyof TemplateWeights, unknown>>)
      : null;

  return {
    resume: normalizeWeight(weights?.resume, DEFAULT_WEIGHTS.resume),
    skills: normalizeWeight(weights?.skills, DEFAULT_WEIGHTS.skills),
    experience: normalizeWeight(
      weights?.experience,
      DEFAULT_WEIGHTS.experience,
    ),
  };
}

function getTemplateWeightItems(template: MatchingTemplate): TemplateWeightSummaryItem[] {
  const weights = getTemplateWeights(template);
  return TEMPLATE_WEIGHT_ITEMS.map((item) => ({
    ...item,
    value: weights[item.key],
  }));
}

function getTemplateWeightSummary(template: MatchingTemplate) {
  return getTemplateWeightItems(template)
    .map((item) => `${item.label} ${item.value}`)
    .join(" · ");
}

function getTemplatePreviewSummary(template: MatchingTemplate) {
  const lines = template.prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[0] ?? "";
}

function normalizeWeight(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function getTemplateTypeLabel(template: MatchingTemplate) {
  if (template.sourceType === "builtin") {
    return "内置模板";
  }

  if (template.sourceType === "imported") {
    return "导入模板";
  }

  return "自定义模板";
}

async function loadTemplates() {
  loading.value = true;
  try {
    const [templateData, groupData] = await Promise.all([
      screeningTemplatesApi.list(),
      screeningTemplatesApi.listGroups(),
    ]);

    const nextUsageMap: Record<string, TemplateUsageGroup[]> = {};
    const groupDetails = await Promise.all(
      groupData.items.map(async (group) => {
        try {
          return {
            groupId: group.id,
            groupName: group.name,
            detail: await screeningTemplatesApi.getGroup(group.id),
          };
        } catch {
          return null;
        }
      }),
    );

    for (const entry of groupDetails) {
      if (!entry) {
        continue;
      }

      for (const template of entry.detail.templates) {
        const usages = nextUsageMap[template.id] ?? [];
        usages.push({ id: entry.groupId, name: entry.groupName });
        nextUsageMap[template.id] = usages;
      }
    }

    templates.value = templateData.items;
    templateUsageMap.value = nextUsageMap;
  } catch (err) {
    // 加载失败时保持空列表
    templates.value = [];
    templateUsageMap.value = {};
  } finally {
    loading.value = false;
  }
}

function handleCreate() {
  editingTemplate.value = null;
  dialogOpen.value = true;
}

function handleEdit(template: MatchingTemplate) {
  editingTemplate.value = template;
  dialogOpen.value = true;
}

async function handleDelete(template: MatchingTemplate) {
  const usageGroupNames = getTemplateUsageNames(template.id);

  const usageWarning =
    usageGroupNames.length > 0
      ? `\n\n注意：该模板当前仍被以下分组使用：${usageGroupNames.join("、")}。删除会被系统阻止，请先到分组管理中解除引用。`
      : "";

  if (
    !window.confirm(`确定要删除模板 "${template.name}" 吗？${usageWarning}`)
  ) {
    return;
  }

  try {
    await screeningTemplatesApi.remove(template.id);
    await loadTemplates();
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      window.alert(err.message);
      return;
    }

    window.alert(
      err instanceof Error ? err.message : "删除模板失败，请稍后重试",
    );
  }
}

function handleDialogSuccess() {
  loadTemplates();
}

onMounted(() => {
  loadTemplates();
});
</script>

<template>
  <AppPageShell :class="imsDesign.shell">
    <ImsPageBackground />
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <Button class="gap-2" @click="handleCreate">
        <Plus class="h-4 w-4" />
        新建模板
      </Button>
      <AppUserActions />
    </AppPageHeader>

    <AppPageContent class="relative z-[1] space-y-6 px-4 py-4 lg:px-16">
      <div
        class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      >
        <div class="space-y-2">
          <h1 class="text-xl font-semibold tracking-tight">初筛模板管理</h1>
          <p class="text-sm text-muted-foreground">
            这里只维护模板内容本身；分组、阈值和默认模板组合请到分组管理页面处理。
          </p>
        </div>

        <router-link
          to="/screening/template-groups"
          class="shrink-0 text-sm text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
        >
          前往分组管理
        </router-link>
      </div>

      <Card v-if="loading" class="p-6 space-y-3">
        <Skeleton class="h-4 w-full rounded-md" />
        <Skeleton class="h-4 w-4/5 rounded-md" />
        <Skeleton class="h-4 w-3/5 rounded-md" />
      </Card>

      <EmptyState
        v-else-if="!hasTemplates"
        scenario="generic"
        title="暂无模板"
        description="创建您的第一个初筛模板，用于 AI 自动评估候选人"
        :action-text="'新建模板'"
        :action-icon="Plus"
        :action-handler="handleCreate"
      />

      <div v-else class="grid gap-4 xl:grid-cols-2">
        <Card
          v-for="template in templates"
          :key="template.id"
          class="border-border/70 bg-background shadow-sm"
        >
          <div class="space-y-4 p-5">
            <div
              class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
            >
              <div class="space-y-2 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-semibold">{{ template.name }}</h3>
                  <Badge>{{ getTemplateTypeLabel(template) }}</Badge>
                </div>
                <p
                  v-if="template.description"
                  class="line-clamp-1 text-sm text-muted-foreground"
                >
                  {{ template.description }}
                </p>
                <div
                  class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
                >
                  <span v-if="getTemplateUsages(template.id).length > 0" class="shrink-0"
                    >使用于 {{ getTemplateUsages(template.id).length }} 个分组：</span
                  >
                  <template v-for="(usage, index) in getTemplateUsages(template.id)" :key="usage.id">
                    <router-link
                      :to="{
                        path: '/screening/template-groups',
                        query: { templateId: template.id, groupId: usage.id },
                      }"
                      class="inline-flex text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
                    >
                      {{ usage.name }}
                    </router-link>
                    <span
                      v-if="index < getTemplateUsages(template.id).length - 1"
                      class="text-muted-foreground/60"
                      >、</span
                    >
                  </template>
                  <template v-if="template.isDefault">
                    <span>·</span>
                    <span>默认模板</span>
                  </template>
                </div>
                <div class="text-sm text-muted-foreground">
                  <span class="shrink-0">权重：</span>
                  <span>{{ getTemplateWeightSummary(template) }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2 self-start">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="handleEdit(template)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs text-destructive/70 hover:text-destructive"
                  :disabled="template.isDefault"
                  @click="handleDelete(template)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>

            <div class="border-t border-border/60 pt-4">
              <div
                class="flex items-center gap-2 text-xs text-muted-foreground mb-2"
              >
                <FileText class="h-3.5 w-3.5" />
                <span>预览</span>
              </div>
              <p class="line-clamp-1 text-sm text-foreground/80">
                {{ getTemplatePreviewSummary(template) }}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppPageContent>

    <TemplateFormDialog
      :open="dialogOpen"
      :template="editingTemplate"
      @update:open="dialogOpen = $event"
      @success="handleDialogSuccess"
    />
  </AppPageShell>
</template>
