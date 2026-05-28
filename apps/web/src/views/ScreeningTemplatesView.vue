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
import { Plus, Pencil, Trash2, FileText, SlidersHorizontal } from "lucide-vue-next";

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
  const objectValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  const weights = objectValue?.weights && typeof objectValue.weights === "object" ? objectValue.weights as Partial<Record<keyof TemplateWeights, unknown>> : null;

  return {
    resume: normalizeWeight(weights?.resume, DEFAULT_WEIGHTS.resume),
    skills: normalizeWeight(weights?.skills, DEFAULT_WEIGHTS.skills),
    experience: normalizeWeight(weights?.experience, DEFAULT_WEIGHTS.experience),
  };
}

function getTemplateWeightItems(template: MatchingTemplate) {
  const weights = getTemplateWeights(template);
  return TEMPLATE_WEIGHT_ITEMS.map((item) => ({
    ...item,
    value: weights[item.key],
  }));
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

function getTemplateStatusLabel(template: MatchingTemplate) {
  if (!template.isActive) {
    return "已停用";
  }

  if (template.isReadonly) {
    return "只读";
  }

  return "可编辑";
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

  const usageWarning = usageGroupNames.length > 0
    ? `\n\n注意：该模板当前仍被以下分组使用：${usageGroupNames.join("、")}。删除会被系统阻止，请先到分组管理中解除引用。`
    : "";

  if (!window.confirm(`确定要删除模板 "${template.name}" 吗？${usageWarning}`)) {
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

    window.alert(err instanceof Error ? err.message : "删除模板失败，请稍后重试");
  }
}

function handleDialogSuccess() {
  loadTemplates();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-semibold">{{ template.name }}</h3>
                  <Badge>{{ getTemplateTypeLabel(template) }}</Badge>
                </div>
                <p v-if="template.description" class="text-sm text-muted-foreground">
                  {{ template.description }}
                </p>
                <p v-else class="text-sm text-muted-foreground/80">
                  未填写模板说明
                </p>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{{ getTemplateStatusLabel(template) }}</span>
                  <span v-if="template.isDefault">默认模板</span>
                  <router-link
                    v-if="getTemplateUsages(template.id).length > 0"
                    :to="{ path: '/screening/template-groups', query: { templateId: template.id } }"
                    class="text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
                  >
                    被 {{ getTemplateUsages(template.id).length }} 个分组使用
                  </router-link>
                </div>
                <div
                  v-if="getTemplateUsages(template.id).length > 0"
                  class="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                >
                  <span class="shrink-0">当前分组：</span>
                  <router-link
                    v-for="usage in getTemplateUsages(template.id)"
                    :key="usage.id"
                    :to="{ path: '/screening/template-groups', query: { templateId: template.id, groupId: usage.id } }"
                    class="inline-flex"
                  >
                    <Badge
                      variant="outline"
                      class="h-6 cursor-pointer border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-normal text-amber-700 transition-colors hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
                    >
                      {{ usage.name }}
                    </Badge>
                  </router-link>
                </div>
                <div class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <span>创建于 {{ formatDate(template.createdAt) }}</span>
                  <span>·</span>
                  <span>更新于 {{ formatDate(template.updatedAt) }}</span>
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
              <div class="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <SlidersHorizontal class="h-3.5 w-3.5" />
                <span>权重配置</span>
              </div>
              <div class="grid gap-2 sm:grid-cols-3">
                <div
                  v-for="item in getTemplateWeightItems(template)"
                  :key="item.key"
                  class="rounded-[12px] border border-border/45 bg-background/70 px-4 py-3 dark:border-white/8 dark:bg-white/5"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-[14px] font-semibold text-foreground">{{ item.label }}</p>
                      <p class="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                        {{ item.description }}
                      </p>
                    </div>
                    <span class="shrink-0 leading-none text-[#2563EB]">
                      <span class="inline-flex items-end">
                        <span class="text-[44px] font-semibold tracking-[-0.05em] tabular-nums">{{ item.value }}</span>
                        <span class="mb-1 ml-1 text-[15px] font-semibold text-[#5B7FD6]">%</span>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-t border-border/60 pt-4">
              <div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <FileText class="h-3.5 w-3.5" />
                <span>模板内容预览</span>
              </div>
              <p class="text-sm text-foreground/80 line-clamp-3 font-mono whitespace-pre-wrap">
                {{ template.prompt }}
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
