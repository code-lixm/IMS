<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { MatchingTemplate } from "@ims/shared";
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

const templates = ref<MatchingTemplate[]>([]);
const loading = ref(false);
const dialogOpen = ref(false);
const editingTemplate = ref<MatchingTemplate | null>(null);

const hasTemplates = computed(() => templates.value.length > 0);

async function loadTemplates() {
  loading.value = true;
  try {
    const data = await screeningTemplatesApi.list();
    templates.value = data.items;
  } catch (err) {
    // 加载失败时保持空列表
    templates.value = [];
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
  if (!window.confirm(`确定要删除模板 "${template.name}" 吗？`)) {
    return;
  }

  try {
    await screeningTemplatesApi.remove(template.id);
    await loadTemplates();
  } catch (err) {
    // 删除失败时静默处理，用户可通过界面状态判断
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
              管理 AI 初筛使用的匹配模板，用于评估候选人与职位的匹配度。
            </p>
          </div>
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
                </div>
                <p v-if="template.description" class="text-sm text-muted-foreground">
                  {{ template.description }}
                </p>
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
