<template>
  <AppPageShell>
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <div class="flex items-center gap-2 shrink-0">
        <AppUserActions />
      </div>
    </AppPageHeader>

    <AppPageContent class="space-y-6">
      <Card
        class="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-muted/30"
      >
        <div
          class="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
        >
          <div class="space-y-2">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-semibold tracking-tight">
                批量导入工作台
              </h1>
              <Badge v-if="hasActiveImports" variant="secondary"
                >{{ importBatches.activeBatchCount }} 个任务进行中</Badge
              >
            </div>
            <p class="text-sm text-muted-foreground">
              支持上传单个 PDF，或上传仅包含 PDF 的常见压缩包。开启 AI
              初筛后，会在文本解析完成后追加 Agent 风格结论，并持续刷新状态。
            </p>
          </div>

          <div
            data-onboarding="screening-toggle"
            class="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-4 md:min-w-[320px]"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium">AI 初筛</p>
                <p class="text-xs text-muted-foreground">
                  导入后自动生成通过 / 待定 / 淘汰结论
                </p>
              </div>
              <Switch
                :model-value="autoScreen"
                @update:model-value="onAutoScreenChange"
              />
            </div>
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                class="inline-flex h-2 w-2 rounded-full"
                :class="autoScreen ? 'bg-green-500' : 'bg-muted-foreground/50'"
              />
              {{
                autoScreen
                  ? "新建导入默认启用 AI 初筛"
                  : "新建导入仅做解析，不自动初筛"
              }}
            </div>
            <div v-if="autoScreen" class="space-y-2 pt-2 border-t border-border/40">
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs font-medium text-muted-foreground">筛选模板</p>
                <router-link
                  to="/screening/templates"
                  class="shrink-0 text-xs text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                >
                  管理模板
                </router-link>
              </div>
              <Select
                v-if="screeningTemplates.templates.value.length > 0"
                :model-value="screeningTemplates.selectedId.value ?? ''"
                @update:model-value="screeningTemplates.selectTemplate(String($event))"
              >
                <SelectTrigger class="h-9 w-full min-w-0 justify-between rounded-lg text-sm">
                  <SelectValue placeholder="选择筛选模板" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="template in screeningTemplates.templates.value"
                    :key="template.id"
                    :value="template.id"
                  >
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="min-w-0 truncate">{{ template.name }}</span>
                      <Badge v-if="template.isDefault" variant="secondary" class="shrink-0 text-[10px] px-1.5 py-0">默认</Badge>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p v-else class="text-xs text-muted-foreground">
                暂无自定义模板，将使用系统默认规则
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div class="grid gap-3 md:grid-cols-3">
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            批次总数
          </p>
          <p class="text-2xl font-semibold">{{ batches.length }}</p>
          <p class="text-xs text-muted-foreground">
            含历史导入与当前进行中的批次
          </p>
        </Card>
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            运行中
          </p>
          <p class="text-2xl font-semibold">
            {{ importBatches.activeBatchCount.value }}
          </p>
          <p class="text-xs text-muted-foreground">
            会每 3 秒自动刷新，无需手动轮询
          </p>
        </Card>
        <Card class="p-4 space-y-1.5">
          <p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            分析进度
          </p>
          <p class="text-2xl font-semibold">
            {{ analysisCompletedFiles }}/{{ analysisTotalFiles }}
          </p>
          <p class="text-xs text-muted-foreground">
            待分析 {{ analysisPendingFiles }} · 分析中 {{ analysisRunningFiles }}
          </p>
        </Card>
      </div>

      <Card v-if="loading" class="p-6 space-y-3">
        <Skeleton class="h-4 w-full rounded-md" />
        <Skeleton class="h-4 w-4/5 rounded-md" />
        <Skeleton class="h-4 w-3/5 rounded-md" />
      </Card>

      <EmptyState
        v-else-if="!batches.length"
        scenario="import"
        :action-text="'新建导入'"
        :action-icon="Plus"
        :action-handler="startImport"
      />

      <div v-else class="space-y-4">
        <div class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-sm font-medium">导入批次</p>
            <p class="text-xs text-muted-foreground">
              管理已导入的简历批次，并导出已完成的初筛报告
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              class="gap-2 border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary disabled:border-border disabled:bg-transparent disabled:text-muted-foreground"
              data-onboarding="export-screening"
              :disabled="exportableBatchCount === 0"
              @click="exportDialogOpen = true"
            >
              <Upload class="h-4 w-4" />
              导出报告
            </Button>
            <div class="relative">
              <Button
                class="gap-2"
                :disabled="isImporting"
                data-onboarding="new-import"
                @click="startImport"
              >
                <Download class="h-4 w-4" />
                新建导入
              </Button>
              <Badge
                v-if="importBatches.activeBatchCount.value > 0"
                variant="default"
                class="absolute -right-2 -top-2 min-w-5 justify-center rounded-full bg-sky-600 px-1.5 py-0 text-white hover:bg-sky-600"
              >
                {{ importBatches.activeBatchCount.value }}
              </Badge>
            </div>
          </div>
        </div>
        <Card
          v-for="b in safeBatches"
          :key="b.id"
          :class="[
            'overflow-hidden border-border/70 shadow-sm',
            b.status === 'processing'
              ? 'ring-2 ring-primary/30 bg-primary/5'
              : '',
          ]"
        >
          <div class="space-y-4 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <Badge :variant="batchPrimaryStatusVariant(b)">{{
                    batchPrimaryStatusLabel(b)
                  }}</Badge>
                  <Badge
                    v-if="b.status === 'processing'"
                    variant="default"
                    class="animate-pulse"
                    >正在处理</Badge
                  >
                  <Badge v-if="b.autoScreen" variant="outline">AI 初筛</Badge>
                  <span class="text-sm font-medium text-foreground/90"
                    >{{ b.totalFiles }} 个文件</span
                  >
                  <span class="text-xs text-muted-foreground">{{
                    formatImportTimestamp(b.createdAt)
                  }}</span>
                </div>
                <div
                  class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                >
                  <span>{{ formatImportBatchDisplayName(b) }}</span>
                  <template v-if="b.status === 'processing' || b.status === 'queued'">
                    <span>·</span>
                    <span>当前阶段：{{ importStageLabel(b.currentStage) }}</span>
                  </template>
                </div>
              </div>

              <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="toggleFiles(b.id)"
                >
                  <ChevronDown
                    :class="[
                      'h-3.5 w-3.5 transition-transform',
                      expandedBatches.has(b.id) ? 'rotate-180' : '',
                    ]"
                  />
                  {{ expandedBatches.has(b.id) ? "收起文件" : "查看文件" }}
                </Button>
                <Button
                  v-if="b.failedFiles > 0"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="retryFailed(b.id)"
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  重试失败
                </Button>
                <Button
                  v-if="canRerunBatchScreening(b)"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  :disabled="isBatchScreeningPending(b.id)"
                  @click="rerunBatchScreening(b.id)"
                >
                  <RefreshCw class="h-3.5 w-3.5" />
                  {{ batchScreeningActionLabel(b) }}
                </Button>
                <Button
                  v-if="b.status === 'processing'"
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs"
                  @click="cancelBatch(b.id)"
                >
                  <X class="h-3.5 w-3.5" />
                  取消
                </Button>
                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="h-8 gap-1.5 text-xs text-destructive/70 hover:text-destructive"
                  @click="removeBatch(b.id)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </div>

            <div
              class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"
            >
              <div class="space-y-2 flex-1">
                <div
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                >
                  <span>{{ batchProgressCountText(b) }}</span>
                  <span
                    >{{ batchSecondaryMetricLabel() }}
                    <span class="font-medium text-foreground">{{
                      batchSecondaryMetricCount(b)
                    }}</span></span
                  >
                  <span
                    >{{ batchTertiaryMetricLabel(b) }}
                    <span class="font-medium text-amber-600 dark:text-amber-400">{{
                      batchTertiaryMetricCount(b)
                    }}</span></span
                  >
                </div>
              </div>
              <div
                class="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 px-3 py-2 xl:hidden"
              >
                <p class="text-xs text-muted-foreground">
                  {{ batchStatusText(b) }}
                </p>
                <p class="text-sm font-semibold tabular-nums text-foreground">
                  {{ batchProgressValue(b) }}%
                </p>
              </div>
              <div class="hidden flex-col items-end gap-2 text-right xl:flex">
                <CircularProgress
                  :model-value="batchProgressValue(b)"
                  :status="batchCircularStatus(b.status)"
                  :size="72"
                  :stroke-width="5"
                />
                <p class="text-xs text-muted-foreground">
                  {{
                    batchStatusText(b)
                  }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="expandedBatches.has(b.id)"
            class="border-t bg-muted/20 px-5 py-4"
          >
            <div v-if="loadingFiles[b.id]" class="space-y-2">
              <Skeleton
                class="h-16 w-full rounded-xl"
                v-for="i in 3"
                :key="i"
              />
            </div>
            <div
              v-else-if="!batchFiles[b.id]?.length"
              class="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
            >
              暂无文件明细
            </div>
            <div v-else class="space-y-3">
              <article
                v-for="f in batchFiles[b.id]"
                :key="f.id"
                class="relative overflow-hidden rounded-xl border bg-background px-4 py-3 pb-14 shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
                @click="
                  parseImportTaskResult(f.resultJson)?.parsedResume &&
                  showScreeningDetail(f)
                "
              >
                <div
                  class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div class="min-w-0 space-y-2 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <Badge
                        :variant="fileStatusVariant(f.status)"
                        class="shrink-0 text-xs"
                      >
                        {{ fileStatusLabel(f.status) }}
                      </Badge>
                      <span
                        v-if="
                          f.stage === 'ai_screening' &&
                          !screeningResult(f)?.screeningConclusion
                        "
                        :class="[
                          'inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium',
                          screeningResult(f)?.screeningStatus === 'queued'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900 dark:text-amber-300'
                            : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900 dark:text-blue-300',
                        ]"
                      >
                        {{
                          screeningResult(f)?.screeningStatus === 'queued'
                            ? 'AI 初筛排队中'
                            : 'AI 初筛中'
                        }}
                      </span>
                      <span
                        class="min-w-0 flex-1 truncate text-sm font-medium"
                        >{{ fileNameOf(f.originalPath) }}</span
                      >
                      <span
                        v-if="screeningResult(f)?.screeningConclusion"
                        :class="[
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          screeningScoreClass(
                            screeningResult(f)?.screeningConclusion?.score,
                          ),
                        ]"
                      >
                        初筛{{ screeningResult(f)?.screeningConclusion?.label }}
                      </span>
                    </div>

                    <div
                      class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                    >
                      <span>阶段：{{ importStageLabel(f.stage) }}</span>
                      <span v-if="screeningResult(f)?.screeningSource"
                        >·
                        {{
                          screeningSourceLabel(
                            screeningResult(f)?.screeningSource,
                          )
                        }}</span
                      >
                    </div>

                    <p
                      v-if="screeningResult(f)?.screeningConclusion?.summary"
                      class="text-sm text-muted-foreground"
                    >
                      {{ screeningResult(f)?.screeningConclusion?.summary }}
                    </p>

                    <p
                      v-if="
                        screeningResult(f)?.screeningConclusion
                          ?.recommendedAction
                      "
                      class="text-sm text-foreground/80"
                    >
                      建议：{{
                        screeningResult(f)?.screeningConclusion
                          ?.recommendedAction
                      }}
                    </p>

                    <p
                      v-if="screeningResult(f)?.screeningError"
                      :class="screeningResult(f)?.screeningStatus === 'failed' ? 'text-xs text-destructive' : 'text-xs text-amber-600'"
                    >
                      {{ screeningResult(f)?.screeningStatus === 'failed' ? 'AI 初筛失败，未生成规则回退结论：' : 'AI 初筛提示：' }}{{
                        screeningResult(f)?.screeningError
                      }}
                    </p>

                    <p
                      v-if="f.errorMessage"
                      class="text-xs text-destructive break-all"
                    >
                      {{ f.errorMessage }}
                    </p>
                  </div>

                  <div
                    class="flex items-center gap-2 shrink-0 mt-2 lg:mt-0 lg:flex-col lg:items-stretch"
                  >
                    <button
                      v-if="parseImportTaskResult(f.resultJson)?.parsedResume"
                      :disabled="
                        screeningResult(f)?.screeningStatus === 'running' ||
                        screeningResult(f)?.screeningStatus === 'queued'
                      "
                      :title="
                        screeningResult(f)?.screeningStatus === 'running'
                          ? '分析中...'
                          : screeningResult(f)?.screeningStatus === 'queued'
                            ? '等待中...'
                            : '重新分析'
                      "
                      class="inline-flex items-center gap-1.5 text-sm text-red-500 hover:text-red-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        @click.stop="(screeningResult(f)?.screeningStatus === 'running' || screeningResult(f)?.screeningStatus === 'queued') ? null : requestRunFileScreening(f.id, f.batchId)"
                    >
                      <RefreshCw class="h-3.5 w-3.5" />
                      {{
                        screeningResult(f)?.screeningStatus === 'running'
                          ? '分析中'
                          : screeningResult(f)?.screeningStatus === 'queued'
                            ? '等待中'
                            : '重新分析'
                      }}
                    </button>
                    <button
                      v-if="parseImportTaskResult(f.resultJson)?.parsedResume"
                      class="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      @click.stop="showScreeningDetail(f)"
                    >
                      <FileSearch class="h-3.5 w-3.5" />
                      查看详情
                    </button>
                  </div>
                </div>
                <div
                  v-if="screeningResult(f)?.screeningConclusion"
                  :class="[
                    'pointer-events-none absolute bottom-3 right-4 flex h-16 w-16 -rotate-12 select-none flex-col items-center justify-center rounded-full border-2 bg-background/70 text-center font-semibold shadow-sm backdrop-blur-[1px]',
                    screeningScoreStampClass(
                      screeningResult(f)?.screeningConclusion?.score,
                      screeningResult(f)?.screeningConclusion?.label,
                    ),
                  ]"
                >
                  <span class="text-[10px] leading-none tracking-[0.18em]">
                    {{
                      screeningScoreStampLabel(
                        screeningResult(f)?.screeningConclusion?.label,
                      )
                    }}
                  </span>
                  <span class="mt-1 text-xl leading-none tabular-nums">
                    {{ screeningResult(f)?.screeningConclusion?.score }}%
                  </span>
                </div>
              </article>
            </div>
          </div>
        </Card>
      </div>
      <ExportScreeningDialog v-model:open="exportDialogOpen" :batches="batches" />
    </AppPageContent>

    <GatewayEndpointDialog
      :open="gatewaySetupDialogOpen"
      title="先配置模型厂商"
      description="开启 AI 初筛前，需要先添加至少一个 AI Gateway 端点。"
      :preset-providers="presetProviders"
      :model-options="gatewayModelOptions"
      :initial-provider-id="presetProviders[0]?.id ?? ''"
      :initial-model-id="luiStore.selectedModelId || ''"
      :saving="isSavingGatewaySetup"
      :testing="isTestingGatewaySetup"
      save-button-text="保存并继续"
      @update:open="handleGatewaySetupDialogOpenChange"
      @save="saveGatewaySetupFromDialog"
      @test="testGatewaySetupFromDialog"
    />

    <Dialog
      :open="modelSelectionDialogOpen"
      @update:open="handleModelSelectionDialogOpenChange"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择模型</DialogTitle>
          <DialogDescription>
            AI 初筛需要先选择一个模型，选择后会自动继续当前导入。
          </DialogDescription>
        </DialogHeader>

        <Separator class="my-4" />

        <div v-if="availableModelProviders.length === 0" class="text-sm text-muted-foreground">
          当前没有可用模型，请先检查厂商 API Key 是否可用，或到设置页完善端点配置。
        </div>

        <div v-else class="max-h-[360px] space-y-3 overflow-y-auto pr-1">
          <div
            v-for="provider in availableModelProviders"
            :key="provider.id"
            class="space-y-2"
          >
            <p class="text-xs font-medium text-muted-foreground">{{ provider.name }}</p>
            <div class="grid gap-2">
              <Button
                v-for="model in provider.models"
                :key="`${provider.id}:${model.id}`"
                variant="outline"
                class="h-auto justify-start px-3 py-2 text-left"
                @click="selectImportModel(model.id, provider.id)"
              >
                <span class="truncate text-sm">{{ model.displayName }}</span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter class="mt-6 gap-2">
          <Button variant="secondary" @click="modelSelectionDialogOpen = false">
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AiScreeningDetailDialog
      :open="screeningDialogOpen"
      :screening-data="selectedScreeningData"
      :file="selectedFile"
      :has-prev="Boolean(previousScreeningFile)"
      :has-next="Boolean(nextScreeningFile)"
      @update:open="screeningDialogOpen = $event"
      @run-screening="handleRunFileScreening"
      @retry-university-verification="handleRetryUniversityVerification"
      @navigate-prev="showAdjacentScreeningDetail(-1)"
      @navigate-next="showAdjacentScreeningDetail(1)"
    />
    <Dialog v-model:open="templateDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择筛选模板</DialogTitle>
          <DialogDescription>
            选择本次重跑使用的 AI 筛选模板
          </DialogDescription>
        </DialogHeader>

        <Separator class="my-4" />

        <div class="max-h-[360px] space-y-3 overflow-y-auto pr-1">
          <template v-if="screeningTemplates.templates.value.length > 0">
            <p class="text-xs font-medium text-muted-foreground px-1">
              模板列表
            </p>
            <Button
              v-for="template in screeningTemplates.templates.value"
              :key="template.id"
              :ref="(el) => setTemplateOptionRef(template.id, el)"
              variant="outline"
              class="h-auto w-full justify-between px-3 py-2 text-left"
              :class="{ 'border-primary': dialogSelectedTemplateId === template.id }"
              @click="dialogSelectedTemplateId = template.id"
            >
              <span class="truncate text-sm">{{ template.name }}</span>
              <span class="ml-3 flex shrink-0 items-center gap-2">
                <Badge v-if="template.isDefault" variant="secondary" class="text-xs">默认</Badge>
                <Check
                  v-if="dialogSelectedTemplateId === template.id"
                  class="h-4 w-4 text-primary"
                />
              </span>
            </Button>
          </template>
          <div
            v-else
            class="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
          >
            暂无可用筛选模板，请先到模板管理中创建或恢复默认模板。
          </div>
        </div>

        <DialogFooter class="mt-6 gap-2">
          <Button variant="secondary" @click="templateDialogOpen = false">
            取消
          </Button>
          <Button
            :disabled="!dialogSelectedTemplateId"
            @click="executeTemplateRerun"
          >
            开始筛选
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from "vue";
import {
  Upload,
  Download,
  FileSearch,
  Plus,
  Check,
  ChevronDown,
  RefreshCw,
  Trash2,
  X,
} from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import AiScreeningDetailDialog from "@/components/import/ai-screening-detail-dialog.vue";
import ExportScreeningDialog from "@/components/import/export-screening-dialog.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import GatewayEndpointDialog from "@/components/lui/gateway-endpoint-dialog.vue";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { useScreeningTemplates } from "@/composables/import/use-screening-templates";
import { useImportFileSelection } from "@/composables/import/use-import-file-selection";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import {
  fileStatusLabel,
  fileStatusVariant,
  formatImportBatchDisplayName,
  formatImportTimestamp,
  importStageLabel,
  parseImportTaskResult,
  screeningScoreClass,
  screeningSourceLabel,
  statusLabel,
  statusVariant,
} from "@/composables/import/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CircularProgress } from "@/components/ui/circular-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ApiError } from "@/api/client";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { PRESET_PROVIDER_BASE_URLS, type GatewayEndpoint } from "@/lib/ai-gateway-config";
import { reportAppError } from "@/lib/errors/normalize";
import { useLuiStore } from "@/stores/lui";
import type { ModelProvider } from "@/stores/lui";
import type { ImportBatchListItem, ImportFileTask } from "@ims/shared";

interface PresetProvider {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

const importBatches = useImportBatches();
const luiStore = useLuiStore();
const { autoScreen, userManuallyDisabled, setAutoScreenManual, setAutoScreenSystem } = useImportPreferences();
const { notifyError, notifySuccess, notifyInfo } = useAppNotifications();
const fileImport = useImportFileSelection({
  onImportFinished: importBatches.refresh,
});
const { isImporting } = fileImport;

const {
  batches,
  loading,
  expandedBatches,
  batchFiles,
  loadingFiles,
  toggleFiles,
  retryFailed,
  rerunScreening,
  cancelBatch,
  deleteBatch,
} = importBatches;

const screeningTemplates = useScreeningTemplates();
const templateDialogOpen = ref(false);
const dialogSelectedTemplateId = ref("");
const templateOptionRefs = new Map<string, Element>();
const FILE_SCREENING_POLL_INTERVAL_MS = 1500;
const FILE_SCREENING_POLL_ATTEMPTS = 40;
interface TemplateDialogTarget {
  type: "batch" | "file";
  id: string;
  batchId?: string;
}
const templateDialogTarget = ref<TemplateDialogTarget | null>(null);
const hasActiveImports = computed(
  () => importBatches.activeBatchCount.value > 0,
);
const exportableBatchCount = computed(
  () => batches.value.filter((batch) => batch.status === "completed" || batch.status === "partial_success").length,
);

type ImportBatchView = ImportBatchListItem;

function analysisMetric(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function batchAnalysisTotalFiles(batch: ImportBatchView) {
  return analysisMetric(batch.analysisTotalFiles);
}

function batchAnalysisCompletedFiles(batch: ImportBatchView) {
  return analysisMetric(batch.analysisCompletedFiles);
}

function batchAnalysisPendingFiles(batch: ImportBatchView) {
  return analysisMetric(batch.analysisPendingFiles);
}

function batchAnalysisRunningFiles(batch: ImportBatchView) {
  return analysisMetric(batch.analysisRunningFiles);
}

function normalizeImportBatch(batch: (typeof batches.value)[number]): ImportBatchView {
  return {
    id: batch?.id ?? "unknown-batch",
    displayName: batch?.displayName ?? null,
    status: batch?.status ?? "queued",
    sourceType: batch?.sourceType ?? null,
    currentStage: batch?.currentStage ?? null,
    totalFiles: batch?.totalFiles ?? 0,
    processedFiles: batch?.processedFiles ?? 0,
    successFiles: batch?.successFiles ?? 0,
    failedFiles: batch?.failedFiles ?? 0,
    autoScreen: batch?.autoScreen ?? false,
    templateId: batch?.templateId ?? null,
    createdAt: batch?.createdAt ?? 0,
    startedAt: batch?.startedAt ?? null,
    completedAt: batch?.completedAt ?? null,
    analysisTotalFiles: batch?.analysisTotalFiles ?? 0,
    analysisCompletedFiles: batch?.analysisCompletedFiles ?? 0,
    analysisPendingFiles: batch?.analysisPendingFiles ?? 0,
    analysisRunningFiles: batch?.analysisRunningFiles ?? 0,
  };
}

const safeBatches = computed<ImportBatchView[]>(() =>
  batches.value.map((batch) => normalizeImportBatch(batch)),
);

const analysisTotalFiles = computed(() =>
  safeBatches.value.reduce((sum, batch) => sum + batchAnalysisTotalFiles(batch), 0),
);
const analysisCompletedFiles = computed(() =>
  safeBatches.value.reduce((sum, batch) => sum + batchAnalysisCompletedFiles(batch), 0),
);
const analysisPendingFiles = computed(() =>
  safeBatches.value.reduce((sum, batch) => sum + batchAnalysisPendingFiles(batch), 0),
);
const analysisRunningFiles = computed(() =>
  safeBatches.value.reduce((sum, batch) => sum + batchAnalysisRunningFiles(batch), 0),
);

const gatewaySetupDialogOpen = ref(false);
const isSavingGatewaySetup = ref(false);
const isTestingGatewaySetup = ref(false);
const modelSelectionDialogOpen = ref(false);
const pendingImportRequest = ref(false);
const pendingBatchScreeningRuns = ref(new Set<string>());
const presetProviders = ref<PresetProvider[]>([]);

const hasSelectedModel = computed(() =>
  Boolean(luiStore.selectedModelId && luiStore.selectedModelProvider),
);

const availableModelProviders = computed<ModelProvider[]>(() =>
  luiStore.providers.filter((provider) => provider.models.length > 0),
);

const hasAvailableModels = computed(() => availableModelProviders.value.length > 0);

const gatewayModelOptions = computed(() =>
  availableModelProviders.value.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      providerId: provider.id,
      label: `${provider.name} / ${model.displayName || model.name || model.id}`,
    })),
  ),
);

function buildFallbackPresetProviders(): PresetProvider[] {
  return [
    { id: "openai", name: "OpenAI", icon: "OpenAI", baseURL: PRESET_PROVIDER_BASE_URLS.openai ?? "" },
    { id: "anthropic", name: "Anthropic", icon: "Anthropic", baseURL: PRESET_PROVIDER_BASE_URLS.anthropic ?? "" },
    { id: "minimax", name: "MiniMax", icon: "MiniMax", baseURL: PRESET_PROVIDER_BASE_URLS.minimax ?? "" },
    { id: "moonshot", name: "Moonshot", icon: "Moonshot", baseURL: PRESET_PROVIDER_BASE_URLS.moonshot ?? "" },
    { id: "deepseek", name: "DeepSeek", icon: "DeepSeek", baseURL: PRESET_PROVIDER_BASE_URLS.deepseek ?? "" },
    { id: "gemini", name: "Gemini", icon: "Gemini", baseURL: PRESET_PROVIDER_BASE_URLS.gemini ?? "" },
    { id: "siliconflow", name: "SiliconFlow", icon: "SiliconFlow", baseURL: PRESET_PROVIDER_BASE_URLS.siliconflow ?? "" },
    { id: "openrouter", name: "OpenRouter", icon: "OpenRouter", baseURL: PRESET_PROVIDER_BASE_URLS.openrouter ?? "" },
    { id: "grok", name: "Grok", icon: "Grok", baseURL: PRESET_PROVIDER_BASE_URLS.grok ?? "" },
  ];
}

async function loadPresetProviders() {
  try {
    const data = await luiApi.listPresetProviders();
    presetProviders.value = data.providers.map((provider) => ({
      ...provider,
      baseURL: PRESET_PROVIDER_BASE_URLS[provider.id] ?? "",
    }));
  } catch (error) {
    reportAppError("import/load-preset-providers", error, {
      title: "加载预设模型厂商失败",
      fallbackMessage: "将使用内置厂商列表",
    });
    presetProviders.value = buildFallbackPresetProviders();
  }
}

function openGatewaySetupDialog() {
  if (presetProviders.value.length === 0) {
    presetProviders.value = buildFallbackPresetProviders();
  }
  gatewaySetupDialogOpen.value = true;
}

function handleGatewaySetupDialogOpenChange(open: boolean) {
  if (!open && (isSavingGatewaySetup.value || isTestingGatewaySetup.value)) {
    return;
  }
  gatewaySetupDialogOpen.value = open;
  if (!open) {
    pendingImportRequest.value = false;
  }
}

function handleModelSelectionDialogOpenChange(open: boolean) {
  modelSelectionDialogOpen.value = open;
  if (!open) {
    pendingImportRequest.value = false;
  }
}

async function saveGatewaySetupFromDialog(payload: { providerId: string; apiKey: string; modelId: string }) {
  const endpoint = buildGatewayEndpointFromDialogPayload(payload);
  if (!endpoint) {
    return;
  }

  isSavingGatewaySetup.value = true;
  try {
    await luiStore.registerCustomEndpoint(endpoint);

    if (!hasAvailableModels.value) {
      notifyError("未检测到可用模型，请检查 API Key、厂商配置或网络后重试");
      gatewaySetupDialogOpen.value = true;
      setAutoScreenSystem(false);
      return;
    }

    if (endpoint.modelId) {
      luiStore.selectModel(endpoint.modelId, endpoint.providerId);
    }

    notifySuccess("模型厂商已保存");
    gatewaySetupDialogOpen.value = false;

    if (!hasSelectedModel.value) {
      modelSelectionDialogOpen.value = true;
      return;
    }

    setAutoScreenManual(true);

    if (pendingImportRequest.value) {
      proceedImport();
    }
  } catch (error) {
    notifyError(
      reportAppError("import/save-gateway-from-dialog", error, {
        title: "保存模型厂商配置失败",
        fallbackMessage: "请检查 API Key 或稍后重试",
      }),
    );
  } finally {
    isSavingGatewaySetup.value = false;
  }
}

function buildGatewayEndpointFromDialogPayload(payload: { providerId: string; apiKey: string; modelId: string }): GatewayEndpoint | null {
  const provider = presetProviders.value.find((item) => item.id === payload.providerId);
  if (!provider) {
    notifyError("请选择模型厂商");
    return null;
  }

  const apiKey = payload.apiKey.trim();
  const modelId = payload.modelId.trim();
  if (!apiKey) {
    notifyError("请输入 API Key");
    return null;
  }

  const selectedModelOption = modelId
    ? gatewayModelOptions.value.find((item) => item.id === modelId && item.providerId === payload.providerId)
    : null;

  return {
    id: provider.id,
    name: provider.name,
    provider: provider.id,
    baseURL: provider.baseURL,
    providerId: provider.id,
    apiKey,
    ...(modelId ? { modelId } : {}),
    ...(selectedModelOption?.label ? { modelDisplayName: selectedModelOption.label } : {}),
  };
}

async function testGatewaySetupFromDialog(payload: { providerId: string; apiKey: string; modelId: string }) {
  const endpoint = buildGatewayEndpointFromDialogPayload(payload);
  if (!endpoint) {
    return;
  }

  isTestingGatewaySetup.value = true;
  try {
    const result = await luiStore.testCustomEndpoint(endpoint);
    if (result.modelCount > 0) {
      notifySuccess(`连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`);
    } else {
      notifyInfo("连接成功，但当前端点未返回任何模型");
    }
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "测试端点连接失败");
  } finally {
    isTestingGatewaySetup.value = false;
  }
}

function selectImportModel(modelId: string, providerId: string) {
  luiStore.selectModel(modelId, providerId);
  modelSelectionDialogOpen.value = false;
  setAutoScreenManual(true);
  notifySuccess("模型已选择");

  if (pendingImportRequest.value) {
    proceedImport();
  }
}

async function ensureAutoScreeningReady() {
  await Promise.all([
    luiStore.loadModels(),
    loadPresetProviders(),
  ]);

  if (luiStore.customEndpoints.length === 0) {
    openGatewaySetupDialog();
    notifyError(
      reportAppError("import/provider-required", new Error("请先配置模型厂商"), {
        title: "无法开始导入",
        fallbackMessage: "已开启 AI 初筛，请先配置模型厂商",
      }),
    );
    return false;
  }

  if (!hasAvailableModels.value) {
    openGatewaySetupDialog();
    notifyError(
      reportAppError("import/model-unavailable", new Error("未检测到可用模型"), {
        title: "无法开启 AI 初筛",
        fallbackMessage: "请先在端点配置里完成模型检测并确认可用",
      }),
    );
    return false;
  }

  if (!hasSelectedModel.value) {
    modelSelectionDialogOpen.value = true;
    notifyError(
      reportAppError("import/model-required", new Error("请先选择模型"), {
        title: "无法开始导入",
        fallbackMessage: "已开启 AI 初筛，请先选择模型",
      }),
    );
    return false;
  }

  return true;
}

function proceedImport() {
  pendingImportRequest.value = false;
  const templateId = autoScreen.value ? (screeningTemplates.selectedId.value || undefined) : undefined;
  void fileImport.triggerImport({ autoScreen: autoScreen.value, templateId });
}

onMounted(() => {
  void importBatches.initialize();
  void Promise.all([luiStore.loadModels(), loadPresetProviders()]).then(() => {
    syncAutoScreenAvailability();
  });
});

watch([
  () => luiStore.customEndpoints.length,
  hasAvailableModels,
  hasSelectedModel,
], () => {
  syncAutoScreenAvailability();
});

watch(templateDialogOpen, (open) => {
  if (open) {
    scrollSelectedTemplateIntoView();
  }
});

function startImport() {
  if (!autoScreen.value) {
    proceedImport();
    return;
  }

  if (isAutoScreeningReadyForEnable()) {
    proceedImport();
    return;
  }

  pendingImportRequest.value = true;
  void ensureAutoScreeningReady().then((ready) => {
    if (ready) {
      proceedImport();
    }
  }).catch((error) => {
    pendingImportRequest.value = false;
    notifyError(
      reportAppError("import/ensure-auto-screening-ready", error, {
        title: "AI 初筛准备失败",
        fallbackMessage: "请稍后重试，或先到设置页检查模型配置",
      }),
    );
  });
}

function screeningResult(file: ImportFileTask) {
  return parseImportTaskResult(file.resultJson);
}

function initialDialogTemplateId() {
  const templates = screeningTemplates.templates.value;
  if (templates.length === 0) return "";

  const selectedId = screeningTemplates.selectedId.value;
  if (selectedId && templates.some((template) => template.id === selectedId)) {
    return selectedId;
  }

  return screeningTemplates.defaultTemplate.value?.id ?? templates[0].id;
}

function setTemplateOptionRef(templateId: string, el: Element | ComponentPublicInstance | null) {
  const element = el instanceof Element ? el : el?.$el;
  if (element instanceof Element) {
    templateOptionRefs.set(templateId, element);
  } else {
    templateOptionRefs.delete(templateId);
  }
}

function scrollSelectedTemplateIntoView() {
  const selectedId = dialogSelectedTemplateId.value;
  if (!selectedId) return;

  requestAnimationFrame(() => {
    templateOptionRefs.get(selectedId)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  });
}

function screeningScoreStampLabel(label?: string | null) {
  if (label === "淘汰") return "NO MATCH";
  if (label === "待定") return "REVIEW";
  return "MATCH";
}

function screeningScoreStampClass(score?: number | null, label?: string | null) {
  if (label === "淘汰") {
    return "border-rose-500/75 text-rose-600 dark:border-rose-400/75 dark:text-rose-300";
  }

  if (label === "待定") {
    return "border-amber-500/75 text-amber-600 dark:border-amber-400/75 dark:text-amber-300";
  }

  if (typeof score !== "number") {
    return "border-muted-foreground/40 text-muted-foreground/70";
  }

  if (score >= 80) {
    return "border-blue-500/70 text-blue-600 dark:border-blue-400/70 dark:text-blue-300";
  }

  if (score >= 60) {
    return "border-amber-500/75 text-amber-600 dark:border-amber-400/75 dark:text-amber-300";
  }

  return "border-rose-500/75 text-rose-600 dark:border-rose-400/75 dark:text-rose-300";
}

function batchProgress(processed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((processed / total) * 100);
}

function screenableFiles(batchId: string) {
  return (batchFiles.value[batchId] ?? []).filter((file) => {
    const result = screeningResult(file);
    return Boolean(result?.parsedResume);
  });
}

function batchScreeningProgress(batch: (typeof batches.value)[number]) {
  return batchProgress(batchAnalysisCompletedFiles(batch), batchAnalysableCount(batch));
}

function batchPrimaryStatusLabel(batch: ImportBatchView) {
  if (batchAnalysisRunningFiles(batch) > 0) {
    return "分析中";
  }

  if (batchAnalysisTotalFiles(batch) > 0 && batchAnalysisCompletedFiles(batch) >= batchAnalysisTotalFiles(batch)) {
    return "分析完成";
  }

  if (!batch.autoScreen && batch.status === "completed") {
    return "待初筛";
  }

  if (!batch.autoScreen && batch.status === "partial_success") {
    return "部分待初筛";
  }

  return statusLabel(batch.status);
}

function batchPrimaryStatusVariant(batch: ImportBatchView) {
  if (batchAnalysisRunningFiles(batch) > 0 || (batchAnalysisTotalFiles(batch) > 0 && batchAnalysisCompletedFiles(batch) >= batchAnalysisTotalFiles(batch))) {
    return "default";
  }

  if (!batch.autoScreen && batch.status === "completed") {
    return "outline";
  }

  return statusVariant(batch.status);
}

function batchScreeningActionLabel(batch: ImportBatchView) {
  if (isBatchScreeningPending(batch.id)) {
    return "启动中";
  }

  return batch.autoScreen ? "重跑 AI 初筛" : "开始 AI 初筛";
}

function batchProgressValue(batch: ImportBatchView) {
  if (batchAnalysisTotalFiles(batch) > 0) {
    return batchProgress(batchAnalysisCompletedFiles(batch), batchAnalysisTotalFiles(batch));
  }

  if (!batch.autoScreen && (batch.status === "completed" || batch.status === "partial_success")) {
    return 0;
  }

  return batchScreeningProgress(batch);
}

function batchCircularStatus(status: string): "processing" | "done" | "error" | "default" {
  if (status === "completed") return "done";
  if (status === "failed") return "error";
  if (status === "processing") return "processing";
  return "default";
}

function batchProgressCountText(batch: ImportBatchView) {
  const completed = batchCompletedAnalysisCount(batch);
  const analysable = batchAnalysableCount(batch);

  if (analysable <= 0) {
    return batch.autoScreen ? "待分析" : "待分析";
  }

  if (!batch.autoScreen) {
    return `待分析 ${completed}/${analysable}`;
  }

  return `已分析 ${completed}/${analysable}`;
}

function batchAnalysableCount(batch: ImportBatchView) {
  return Math.max(batchAnalysisTotalFiles(batch), batch.totalFiles, 0);
}

function batchCompletedAnalysisCount(batch: ImportBatchView) {
  if (batchAnalysisTotalFiles(batch) > 0 || batchAnalysisCompletedFiles(batch) > 0) {
    return batchAnalysisCompletedFiles(batch);
  }

  const files = screenableFiles(batch.id);
  if (files.length > 0) {
    return files.filter((file) => isScreeningTerminal(screeningResult(file)?.screeningStatus)).length;
  }

  return 0;
}

function batchPendingAnalysisCount(batch: ImportBatchView) {
  if (batchAnalysisTotalFiles(batch) > 0 || batchAnalysisPendingFiles(batch) > 0) {
    return batchAnalysisPendingFiles(batch);
  }

  return Math.max(batchAnalysableCount(batch) - batchCompletedAnalysisCount(batch), 0);
}

function batchSecondaryMetricLabel() {
  return "已分析";
}

function batchSecondaryMetricCount(batch: ImportBatchView) {
  return batchCompletedAnalysisCount(batch);
}

function batchTertiaryMetricLabel(batch: ImportBatchView) {
  const pending = batchAnalysisPendingFiles(batch);
  const running = batchAnalysisRunningFiles(batch);
  if (running > 0 && pending > 0) {
    return '等待中 / 分析中';
  }
  if (running > 0) {
    return '分析中';
  }
  return '待分析';
}

function batchTertiaryMetricCount(batch: ImportBatchView) {
  const pending = batchAnalysisPendingFiles(batch);
  const running = batchAnalysisRunningFiles(batch);
  if (running > 0 && pending > 0) {
    return `${pending} / ${running}`;
  }
  if (running > 0) {
    return running;
  }
  return batchPendingAnalysisCount(batch);
}

function batchStatusText(batch: ImportBatchView) {
  if (batchAnalysisRunningFiles(batch) > 0) {
    return "AI 初筛处理中";
  }

  if (batchAnalysisTotalFiles(batch) > 0) {
    if (batchAnalysisCompletedFiles(batch) >= batchAnalysisTotalFiles(batch)) {
      return "AI 初筛已完成";
    }

    if (batchAnalysisCompletedFiles(batch) > 0) {
      return `已分析 ${batchAnalysisCompletedFiles(batch)}/${batchAnalysisTotalFiles(batch)}`;
    }

    return "待开始 AI 初筛";
  }

  if (!batch.autoScreen) {
    if (batch.status === "queued") return "等待开始导入";
    if (batch.status === "processing") return "后台持续导入中";
    if (batch.status === "completed") return "导入成功，待开始 AI 初筛";
    if (batch.status === "partial_success") return `导入已结束，失败 ${batch.failedFiles} 个`;
    if (batch.status === "failed") return "批次导入失败";
    if (batch.status === "cancelled") return "批次已取消";
    return importStageLabel(batch.currentStage);
  }

  if (batch.status === "queued") {
    return "等待开始处理";
  }

  if (batch.status === "processing") {
    return batch.currentStage === "ai_screening" ? "AI 初筛处理中" : "后台持续处理中";
  }

  if (batch.status === "completed") {
    return "导入与初筛已完成";
  }

  if (batch.status === "partial_success") {
    return `批次已收口，失败 ${batch.failedFiles} 个`;
  }

  if (batch.status === "failed") {
    return "批次处理失败";
  }

  if (batch.status === "cancelled") {
    return "批次已取消";
  }

  const files = screenableFiles(batch.id);
  if (files.length === 0) {
    return "待分析";
  }

  const running = files.some((file) => screeningResult(file)?.screeningStatus === 'running');
  const queued = files.some((file) => screeningResult(file)?.screeningStatus === 'queued');
  if (running) {
    return 'AI 初筛进行中';
  }
  if (queued) {
    return 'AI 初筛等待中';
  }

  const completed = files.filter((file) => isScreeningTerminal(screeningResult(file)?.screeningStatus)).length;
  if (completed === 0) {
    return "待分析";
  }
  if (completed < files.length) {
    return `已分析 ${completed}/${files.length}`;
  }
  return "已完成分析";
}

function isScreeningTerminal(status: string | null | undefined) {
  return status === "completed" || status === "failed";
}

function fileNameOf(originalPath: string) {
  return originalPath.split("#").pop()?.split("/").pop() ?? originalPath;
}

function syncAutoScreenAvailability() {
  const ready = isAutoScreeningReadyForEnable();

  if (!ready) {
    // 模型不可用 → 强制关闭
    if (autoScreen.value) {
      setAutoScreenSystem(false);
    }
    return;
  }

  // 模型可用，用户未手动禁用 → 系统自动打开
  if (!userManuallyDisabled.value && !autoScreen.value) {
    setAutoScreenSystem(true);
  }
}

function isAutoScreeningReadyForEnable() {
  return luiStore.customEndpoints.length > 0 && hasAvailableModels.value && hasSelectedModel.value;
}

function onAutoScreenChange(value: boolean | string) {
  const nextValue = Boolean(value);
  if (!nextValue) {
    // 用户手动关闭
    setAutoScreenManual(false);
    return;
  }

  // 用户手动打开
  void ensureAutoScreeningReady().then((ready) => {
    if (ready) {
      setAutoScreenManual(true);
    }
  }).catch((error) => {
    setAutoScreenManual(false);
    notifyError(
      reportAppError("import/enable-auto-screen", error, {
        title: "AI 初筛暂时无法开启",
        fallbackMessage: "请先完成端点与模型配置",
      }),
    );
  });
}

async function removeBatch(batchId: string) {
  if (!window.confirm("删除后将移除此导入批次及其文件明细记录，继续吗？")) {
    return;
  }
  await deleteBatch(batchId);
}

// AI Screening detail dialog
const exportDialogOpen = ref(false);
const screeningDialogOpen = ref(false);
const selectedScreeningData =
  ref<ReturnType<typeof parseImportTaskResult>>(null);
const selectedFile = ref<ImportFileTask | null>(null);

const currentScreeningFiles = computed(() => {
  const batchId = selectedFile.value?.batchId;
  if (!batchId) return [] as ImportFileTask[];
  return (batchFiles.value[batchId] ?? []).filter(
    (file) => Boolean(parseImportTaskResult(file.resultJson)?.parsedResume),
  );
});

const currentScreeningFileIndex = computed(() => {
  const currentId = selectedFile.value?.id;
  if (!currentId) return -1;
  return currentScreeningFiles.value.findIndex((file) => file.id === currentId);
});

const previousScreeningFile = computed(() => {
  const index = currentScreeningFileIndex.value;
  return index > 0 ? currentScreeningFiles.value[index - 1] ?? null : null;
});

const nextScreeningFile = computed(() => {
  const index = currentScreeningFileIndex.value;
  return index >= 0 ? currentScreeningFiles.value[index + 1] ?? null : null;
});

function showScreeningDetail(file: ImportFileTask) {
  const result = parseImportTaskResult(file.resultJson);
  if (result?.parsedResume) {
    selectedScreeningData.value = result;
    selectedFile.value = file;
    screeningDialogOpen.value = true;
  }
}

function showAdjacentScreeningDetail(direction: -1 | 1) {
  const target = direction < 0 ? previousScreeningFile.value : nextScreeningFile.value;
  if (!target) return;
  showScreeningDetail(target);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function refreshSelectedScreeningFile(taskId: string, batchId: string) {
  await importBatches.refresh();
  const nextFile = batchFiles.value[batchId]?.find((file) => file.id === taskId) ?? null;
  if (!nextFile) return null;

  selectedFile.value = nextFile;
  selectedScreeningData.value = parseImportTaskResult(nextFile.resultJson);
  return selectedScreeningData.value;
}

async function waitForFileScreeningResult(taskId: string, batchId: string) {
  for (let attempt = 0; attempt < FILE_SCREENING_POLL_ATTEMPTS; attempt += 1) {
    await wait(FILE_SCREENING_POLL_INTERVAL_MS);
    const result = await refreshSelectedScreeningFile(taskId, batchId);
    if (isScreeningTerminal(result?.screeningStatus)) {
      return;
    }
  }
}

async function handleRunFileScreening(taskId: string) {
  if (!(await ensureAutoScreeningReady())) {
    return;
  }

  for (const [batchId, files] of Object.entries(batchFiles.value)) {
    const file = files.find((f) => f.id === taskId);
    if (file) {
      templateDialogTarget.value = { type: "file", id: taskId, batchId };
      dialogSelectedTemplateId.value = initialDialogTemplateId();
      templateDialogOpen.value = true;
      screeningDialogOpen.value = false;
      return;
    }
  }
}

async function requestRunFileScreening(taskId: string, batchId: string) {
  if (!(await ensureAutoScreeningReady())) {
    return;
  }

  templateDialogTarget.value = { type: "file", id: taskId, batchId };
  dialogSelectedTemplateId.value = initialDialogTemplateId();
  templateDialogOpen.value = true;
}

async function handleRetryUniversityVerification(taskId: string) {
  const targetBatchId = selectedFile.value?.batchId
    ?? Object.entries(batchFiles.value).find(([, files]) => files.some((file) => file.id === taskId))?.[0];

  if (!targetBatchId) {
    notifyError("无法定位导入批次，暂时不能重试院校认证");
    return;
  }

  try {
    await importBatches.retryUniversityVerification(taskId, targetBatchId);
    await refreshSelectedScreeningFile(taskId, targetBatchId);
    notifySuccess("院校认证已重新查询");
  } catch (error) {
    notifyError(
      reportAppError("import/retry-university-verification", error, {
        title: "院校认证重试失败",
        fallbackMessage: "第三方院校服务仍不可用，请稍后再试",
      }),
    );
  }
}

function canRerunBatchScreening(batch: ImportBatchView) {
  return (
    batch.status !== "processing" &&
    batch.status !== "queued" &&
    batch.status !== "cancelled" &&
    batch.successFiles > 0
  );
}

function isBatchScreeningPending(batchId: string) {
  return pendingBatchScreeningRuns.value.has(batchId);
}

function markBatchScreeningPending(batchId: string, pending: boolean) {
  const next = new Set(pendingBatchScreeningRuns.value);
  if (pending) {
    next.add(batchId);
  } else {
    next.delete(batchId);
  }
  pendingBatchScreeningRuns.value = next;
}

async function rerunBatchScreening(batchId: string) {
  if (isBatchScreeningPending(batchId)) {
    return;
  }

  if (!(await ensureAutoScreeningReady())) {
    return;
  }

  templateDialogTarget.value = { type: "batch", id: batchId };
  dialogSelectedTemplateId.value = initialDialogTemplateId();
  templateDialogOpen.value = true;
}

async function executeBatchRerun(batchId: string, templateId?: string) {
  markBatchScreeningPending(batchId, true);

  try {
    const result = await rerunScreening(batchId, templateId);
    if (result.status === "processing") {
      notifySuccess(`已开始 AI 初筛，本批次共 ${result.retriedCount} 个文件`, {
        title: "任务已启动",
      });
      return;
    }

    notifyInfo("当前批次没有可重跑的分析任务", {
      title: "无需重跑",
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "BATCH_ACTIVE") {
      await importBatches.refresh();
      notifyInfo("AI 初筛已在处理中，请等待状态刷新", {
        title: "任务已在运行",
      });
      return;
    }

    notifyError(
      reportAppError("import/rerun-batch-screening", error, {
        title: "启动 AI 初筛失败",
        fallbackMessage: "请稍后重试",
      }),
    );
  } finally {
    markBatchScreeningPending(batchId, false);
  }
}

async function executeTemplateRerun() {
  const target = templateDialogTarget.value;
  if (!target) return;

  templateDialogOpen.value = false;
  const tid = dialogSelectedTemplateId.value || undefined;
  if (tid) {
    screeningTemplates.selectTemplate(tid);
  }

  if (target.type === "batch") {
    await executeBatchRerun(target.id, tid);
  } else {
    await importBatches.rerunFileScreening(target.id, target.batchId!, tid);
    await waitForFileScreeningResult(target.id, target.batchId!);
  }
}
</script>
