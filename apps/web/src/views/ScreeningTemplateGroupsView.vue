<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { MatchingTemplate, ScreeningTemplateGroupDetailData, ScreeningTemplateGroupListItem } from "@ims/shared";
import { useRoute } from "vue-router";
import { screeningTemplatesApi } from "@/api/screening-templates";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppUserActions from "@/components/app-user-actions.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import TemplateGroupFormDialog from "@/components/import/template-group-form-dialog.vue";
import {
  Boxes,
  Clock3,
  FileText,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-vue-next";

const TEMPLATE_PREVIEW_LIMIT = 4;
const GROUP_CARD_ID_PREFIX = "screening-template-group-card-";

const groups = ref<ScreeningTemplateGroupListItem[]>([]);
const templates = ref<MatchingTemplate[]>([]);
const groupDetails = ref<Record<string, ScreeningTemplateGroupDetailData | null>>({});
const loading = ref(false);
const dialogLoading = ref(false);
const dialogOpen = ref(false);
const actionError = ref<string | null>(null);
const editingGroup = ref<ScreeningTemplateGroupDetailData | null>(null);
const route = useRoute();

const hasGroups = computed(() => groups.value.length > 0);
const templateNameMap = computed(() => new Map(templates.value.map((template) => [template.id, template.name])));
const focusedTemplateId = computed(() => (typeof route.query.templateId === "string" ? route.query.templateId : null));
const focusedGroupId = computed(() => (typeof route.query.groupId === "string" ? route.query.groupId : null));
const hasFocusContext = computed(() => Boolean(focusedTemplateId.value || focusedGroupId.value));
const focusedTemplateName = computed(() => {
  if (!focusedTemplateId.value) {
    return "";
  }

  return templateNameMap.value.get(focusedTemplateId.value) ?? "所选模板";
});
const groupCards = computed(() => {
  const cards = groups.value.map((group) => {
    const detail = groupDetails.value[group.id] ?? null;
    const templateNames = detail?.templates.map((template) => template.name) ?? [];
    const visibleTemplateNames = templateNames.slice(0, TEMPLATE_PREVIEW_LIMIT);
    const description = group.description?.trim() ?? "";
    const matchesTemplateFocus = !focusedTemplateId.value
      || Boolean(detail?.templates.some((template) => template.id === focusedTemplateId.value))
      || group.defaultTemplateId === focusedTemplateId.value;
    const matchesGroupFocus = !focusedGroupId.value || group.id === focusedGroupId.value;
    const matchesFocusContext = hasFocusContext.value && matchesTemplateFocus && matchesGroupFocus;

    return {
      group,
      description,
      hasDescription: description.length > 0,
      hasDefaultTemplate: Boolean(group.defaultTemplateId),
      defaultTemplateName: resolveDefaultTemplateName(group, detail),
      visibleTemplateNames,
      hiddenTemplateCount: Math.max(templateNames.length - visibleTemplateNames.length, 0),
      reviewRangeLabel: formatReviewRange(group.reviewThreshold, group.passThreshold),
      rejectRangeLabel: formatRejectRange(group.reviewThreshold),
      matchesFocusContext,
      focusBadgeLabel: focusedGroupId.value === group.id ? "当前定位" : "关联分组",
    };
  });

  if (!hasFocusContext.value) {
    return cards;
  }

  return [...cards].sort((left, right) => Number(right.matchesFocusContext) - Number(left.matchesFocusContext));
});
const focusedGroupCount = computed(() => groupCards.value.filter((card) => card.matchesFocusContext).length);
const focusSummary = computed(() => {
  if (!hasFocusContext.value) {
    return "";
  }

  if (focusedTemplateId.value) {
    if (focusedGroupCount.value > 0) {
      return `正在突出显示使用「${focusedTemplateName.value}」的分组，共 ${focusedGroupCount.value} 个，可直接编辑解除引用。`;
    }

    return `没有找到引用「${focusedTemplateName.value}」的分组，请检查该模板是否刚完成解绑。`;
  }

  if (focusedGroupCount.value > 0) {
    return "已定位到目标分组，可直接编辑处理模板引用。";
  }

  return "没有找到目标分组，当前仍展示完整分组列表。";
});

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveDefaultTemplateName(
  group: ScreeningTemplateGroupListItem,
  detail?: ScreeningTemplateGroupDetailData | null,
) {
  if (detail?.defaultTemplate?.name) {
    return detail.defaultTemplate.name;
  }

  if (!group.defaultTemplateId) {
    return "未设置";
  }

  return templateNameMap.value.get(group.defaultTemplateId) ?? "已绑定模板";
}

function formatReviewRange(reviewThreshold: number, passThreshold: number) {
  if (reviewThreshold === passThreshold) {
    return `${reviewThreshold} 分`;
  }

  return `${reviewThreshold} - ${passThreshold - 1} 分`;
}

function formatRejectRange(reviewThreshold: number) {
  return `< ${reviewThreshold} 分`;
}

async function loadData() {
  loading.value = true;
  actionError.value = null;

  try {
    const [groupData, templateData] = await Promise.all([
      screeningTemplatesApi.listGroups(),
      screeningTemplatesApi.list(),
    ]);

    groups.value = groupData.items;
    templates.value = templateData.items;

    const nextGroupDetails: Record<string, ScreeningTemplateGroupDetailData | null> = {};
    await Promise.all(groupData.items.map(async (group) => {
      try {
        nextGroupDetails[group.id] = await screeningTemplatesApi.getGroup(group.id);
      } catch {
        nextGroupDetails[group.id] = null;
      }
    }));
    groupDetails.value = nextGroupDetails;
  } catch (err) {
    groups.value = [];
    templates.value = [];
    groupDetails.value = {};
    actionError.value = err instanceof Error ? err.message : "加载分组失败";
  } finally {
    loading.value = false;
  }
}

function handleCreate() {
  editingGroup.value = null;
  actionError.value = null;
  dialogOpen.value = true;
}

async function handleEdit(group: ScreeningTemplateGroupListItem) {
  dialogLoading.value = true;
  actionError.value = null;

  try {
    editingGroup.value = await screeningTemplatesApi.getGroup(group.id);
    dialogOpen.value = true;
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "加载分组详情失败";
  } finally {
    dialogLoading.value = false;
  }
}

async function handleDelete(group: ScreeningTemplateGroupListItem) {
  if (!window.confirm(`确定要删除分组 “${group.name}” 吗？`)) {
    return;
  }

  actionError.value = null;
  try {
    await screeningTemplatesApi.deleteGroup(group.id);
    await loadData();
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : "删除分组失败";
  }
}

async function handleDialogSuccess() {
  await loadData();
}

async function scrollToFocusedGroup() {
  if (!hasFocusContext.value) {
    return;
  }

  const focusedCard = groupCards.value.find((card) => card.matchesFocusContext);
  if (!focusedCard) {
    return;
  }

  await nextTick();
  document
    .getElementById(`${GROUP_CARD_ID_PREFIX}${focusedCard.group.id}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

onMounted(() => {
  loadData();
});

watch([focusedTemplateId, focusedGroupId, loading], () => {
  if (loading.value) {
    return;
  }

  scrollToFocusedGroup();
});
</script>

<template>
  <AppPageShell :class="imsDesign.shell">
    <ImsPageBackground />
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <Button class="gap-2" :disabled="dialogLoading" @click="handleCreate">
        <Plus class="h-4 w-4" />
        新建分组
      </Button>
      <AppUserActions />
    </AppPageHeader>

    <AppPageContent class="relative z-[1] space-y-6 px-4 py-4 lg:px-16">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-2">
          <h1 class="text-xl font-semibold tracking-tight">筛选模板组管理</h1>
          <p class="text-sm text-muted-foreground">
            模板组只负责组织模板、默认模板和筛选阈值；模板内容本身请到模板管理页面维护。
          </p>
        </div>

        <router-link
          to="/screening/templates"
          class="shrink-0 text-sm text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
        >
          前往模板管理
        </router-link>
      </div>

      <Card v-if="hasFocusContext" class="border-primary/20 bg-primary/5 p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">已从模板引用跳转到分组管理</p>
            <p class="text-xs text-muted-foreground">
              {{ focusSummary }}
            </p>
          </div>

          <router-link
            to="/screening/template-groups"
            class="shrink-0 text-xs text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
          >
            查看全部分组
          </router-link>
        </div>
      </Card>

      <p v-if="actionError" class="text-sm text-destructive">
        {{ actionError }}
      </p>

      <Card v-if="loading" class="space-y-3 p-6">
        <Skeleton class="h-4 w-full rounded-md" />
        <Skeleton class="h-4 w-4/5 rounded-md" />
        <Skeleton class="h-4 w-3/5 rounded-md" />
      </Card>

      <EmptyState
        v-else-if="!hasGroups"
        scenario="generic"
        title="暂无模板组"
        description="创建模板组后，导入页就能按分组统一选择模板策略和筛选阈值"
        :action-text="'新建分组'"
        :action-icon="Plus"
        :action-handler="handleCreate"
      />

      <div v-else class="space-y-4">
        <Card
          v-for="card in groupCards"
          :key="card.group.id"
          :id="`${GROUP_CARD_ID_PREFIX}${card.group.id}`"
          :class="[
            'overflow-hidden border-border/70 shadow-sm transition-colors',
            card.matchesFocusContext ? 'border-primary/40 ring-2 ring-primary/15 bg-primary/[0.03]' : '',
          ]"
        >
          <div class="space-y-4 p-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1 space-y-3">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-semibold">{{ card.group.name }}</h3>
                    <Badge v-if="card.matchesFocusContext" variant="default">{{ card.focusBadgeLabel }}</Badge>
                    <Badge variant="secondary">模板组 · {{ card.group.templateCount }} 个模板</Badge>
                    <Badge :variant="card.hasDefaultTemplate ? 'outline' : 'secondary'">
                      {{ card.hasDefaultTemplate ? "已设默认模板" : "未设默认模板" }}
                    </Badge>
                    <Badge v-if="card.group.learningEnabled" variant="outline">学习反馈已启用</Badge>
                  </div>

                  <p
                    class="text-sm"
                    :class="card.hasDescription ? 'text-muted-foreground' : 'text-muted-foreground/80'"
                  >
                    {{ card.hasDescription ? card.description : "未填写分组说明" }}
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>默认模板：{{ card.defaultTemplateName }}</span>
                  <span>·</span>
                  <span>通过 ≥ {{ card.group.passThreshold }}</span>
                  <span>·</span>
                  <span>待定从 {{ card.group.reviewThreshold }} 分起</span>
                </div>

                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>创建于 {{ formatDate(card.group.createdAt) }}</span>
                  <span>·</span>
                  <span>更新于 {{ formatDate(card.group.updatedAt) }}</span>
                </div>
              </div>

              <div class="flex items-center gap-2 self-start">
                <Button
                  :variant="card.matchesFocusContext ? 'default' : 'ghost'"
                  size="sm"
                  :class="[
                    'h-8 gap-1.5 text-xs',
                    card.matchesFocusContext ? 'shadow-sm' : '',
                  ]"
                  :disabled="dialogLoading"
                  @click="handleEdit(card.group)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs text-destructive/70 hover:text-destructive"
                  @click="handleDelete(card.group)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>

            <div class="grid gap-0 overflow-hidden rounded-lg border border-border/60 bg-muted/[0.18] divide-y divide-border/60 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.95fr)_minmax(0,1.05fr)] xl:divide-x xl:divide-y-0">
              <div class="p-4">
                <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Boxes class="h-3.5 w-3.5" />
                  <span>三列内容区 · 分组内模板</span>
                </div>

                <div v-if="card.visibleTemplateNames.length > 0" class="space-y-3">
                  <div class="flex flex-wrap gap-2">
                    <Badge
                      v-for="templateName in card.visibleTemplateNames"
                      :key="templateName"
                      variant="outline"
                      class="max-w-full truncate"
                    >
                      {{ templateName }}
                    </Badge>
                    <Badge v-if="card.hiddenTemplateCount > 0" variant="secondary">
                      +{{ card.hiddenTemplateCount }} 个
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    导入页会在这组模板里提供候选项，并按默认模板决定初始选择。
                  </p>
                </div>

                <p v-else class="text-sm text-muted-foreground">
                  还没有加入模板，导入页暂时不会出现这组的模板候选项。
                </p>
              </div>

              <div class="p-4">
                <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText class="h-3.5 w-3.5" />
                  <span>三列内容区 · 默认模板</span>
                </div>

                <div class="space-y-2">
                  <p class="text-sm font-medium text-foreground">
                    {{ card.defaultTemplateName }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {{ card.hasDefaultTemplate ? "导入页选择该分组时会优先预选这份模板。" : "未设置时，导入页只展示模板集合，不主动预选。" }}
                  </p>
                </div>
              </div>

              <div class="p-4">
                <div class="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <SlidersHorizontal class="h-3.5 w-3.5" />
                  <span>三列内容区 · 阈值策略</span>
                </div>

                <dl class="space-y-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">通过</dt>
                    <dd class="font-medium text-foreground">≥ {{ card.group.passThreshold }} 分</dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">待定</dt>
                    <dd class="font-medium text-foreground">{{ card.reviewRangeLabel }}</dd>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <dt class="text-muted-foreground">不通过</dt>
                    <dd class="font-medium text-foreground">{{ card.rejectRangeLabel }}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock3 class="h-3.5 w-3.5" />
              <span>这个页面只负责维护模板组组合关系；模板正文仍在模板管理页编辑。</span>
            </div>
          </div>
        </Card>
      </div>
    </AppPageContent>

    <TemplateGroupFormDialog
      :open="dialogOpen"
      :group="editingGroup"
      :templates="templates"
      @update:open="dialogOpen = $event"
      @success="handleDialogSuccess"
    />
  </AppPageShell>
</template>
