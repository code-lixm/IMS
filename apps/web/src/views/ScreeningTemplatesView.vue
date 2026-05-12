<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { MatchingTemplate } from "@ims/shared";
import { ApiError } from "@/api/client";
import { screeningTemplatesApi } from "@/api/screening-templates";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppUserActions from "@/components/app-user-actions.vue";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import TemplateFormDialog from "@/components/import/template-form-dialog.vue";
import { Plus, Pencil, Trash2, FileText } from "lucide-vue-next";

type TemplateUsageGroup = {
  id: string;
  name: string;
};

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
  <AppPageShell>
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <Button class="gap-2" @click="handleCreate">
        <Plus class="h-4 w-4" />
        新建模板
      </Button>
      <AppUserActions />
    </AppPageHeader>

    <AppPageContent class="space-y-6">
      <Card class="overflow-hidden border-border/60">
        <div class="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
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
      </Card>

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

      <div v-else class="space-y-4">
        <Card
          v-for="template in templates"
          :key="template.id"
          class="overflow-hidden border-border/70 shadow-sm"
        >
          <div class="space-y-4 p-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="space-y-2 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-semibold">{{ template.name }}</h3>
                  <Badge v-if="template.isDefault" variant="default">默认</Badge>
                  <router-link
                    v-if="getTemplateUsages(template.id).length > 0"
                    :to="{ path: '/screening/template-groups', query: { templateId: template.id } }"
                    class="inline-flex"
                  >
                    <Badge
                      variant="secondary"
                      class="cursor-pointer transition-colors hover:bg-secondary/80"
                    >
                      被 {{ getTemplateUsages(template.id).length }} 个分组使用
                    </Badge>
                  </router-link>
                </div>
                <p v-if="template.description" class="text-sm text-muted-foreground">
                  {{ template.description }}
                </p>
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

            <div class="rounded-lg border bg-muted/30 p-3">
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
