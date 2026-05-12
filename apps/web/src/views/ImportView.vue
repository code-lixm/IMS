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
      <div class="space-y-5">
        <Card class="overflow-hidden border-border/60 bg-card">
          <div
            class="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-xl font-semibold tracking-tight">
                  简历导入
                </h1>
                <Badge variant="secondary">AI 初筛</Badge>
                <Badge v-if="hasActiveResumeImports" variant="secondary"
                  >{{ resumeActiveBatchCount }} 进行中</Badge
                >
              </div>
              <p class="text-sm text-muted-foreground">
                上传简历，跟进批次，导出结果。
              </p>
              <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-1">
                  批次 {{ resumeBatches.length }}
                </span>
                <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-1">
                  可导出 {{ exportableBatchCount }}
                </span>
                <span
                  v-if="analysisTotalFiles > 0"
                  class="inline-flex items-center rounded-full bg-muted px-2.5 py-1"
                >
                  已分析 {{ analysisCompletedFiles }}/{{ analysisTotalFiles }}
                </span>
                <span
                  v-if="analysisPendingFiles > 0 || analysisRunningFiles > 0"
                  class="inline-flex items-center rounded-full bg-muted px-2.5 py-1"
                >
                  待分析 {{ analysisPendingFiles }} · 分析中 {{ analysisRunningFiles }}
                </span>
              </div>
            </div>

            <div
              data-onboarding="screening-toggle"
              class="flex w-full flex-col gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 md:min-w-[320px] md:max-w-[340px]"
            >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium">AI 初筛</p>
                    <p class="text-xs text-muted-foreground">
                      导入后自动生成结论
                    </p>
                  </div>
                  <Switch
                    :model-value="autoScreen"
                    @update:model-value="onAutoScreenChange"
                  />
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ autoScreen ? "新导入默认启用" : "新导入仅解析" }}
                </div>
                <div class="space-y-2 pt-2 border-t border-border/40">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-xs font-medium text-muted-foreground">分组</p>
                    <router-link
                      to="/screening/template-groups"
                      class="shrink-0 text-xs text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                    >
                      管理分组
                    </router-link>
                  </div>
                  <Select
                    v-if="screeningTemplates.groups.value.length > 0"
                    :model-value="screeningTemplates.selectedGroupId.value ?? ''"
                    @update:model-value="handleGroupChange(String($event))"
                  >
                    <SelectTrigger class="h-9 w-full min-w-0 justify-between rounded-lg text-sm">
                      <SelectValue placeholder="选择筛选分组" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="group in screeningTemplates.groups.value"
                        :key="group.id"
                        :value="group.id"
                      >
                        <span class="flex min-w-0 items-center gap-2">
                          <span class="min-w-0 truncate">{{ group.name }}</span>
                          <Badge variant="secondary" class="shrink-0 text-[10px] px-1.5 py-0">{{ group.templateCount }} 模板</Badge>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p v-else class="text-xs text-muted-foreground">
                    先创建分组
                  </p>
                </div>
                <div v-if="autoScreen" class="space-y-2 pt-2 border-t border-border/40">
                    <div class="flex items-center justify-between gap-3">
                      <p class="text-xs font-medium text-muted-foreground">模板</p>
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
                    使用默认模板
                  </p>
                </div>
            </div>
          </div>
        </Card>

        <div class="space-y-6">
      <Card v-if="loading" class="p-6 space-y-3">
        <Skeleton class="h-4 w-full rounded-md" />
        <Skeleton class="h-4 w-4/5 rounded-md" />
        <Skeleton class="h-4 w-3/5 rounded-md" />
      </Card>

      <EmptyState
        v-else-if="!resumeBatches.length"
        scenario="import"
        description="还没有导入批次，先新建一个。"
        :action-text="'新建导入'"
        :action-icon="Plus"
        :action-handler="startImport"
      />

      <div v-else class="space-y-4">
        <div class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p class="text-sm font-medium">简历批次</p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{{ resumeBatches.length }} 个批次</span>
              <span v-if="resumeActiveBatchCount > 0">· {{ resumeActiveBatchCount }} 个处理中</span>
              <span v-if="exportableBatchCount > 0">· {{ exportableBatchCount }} 个可导出</span>
            </div>
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
                v-if="resumeActiveBatchCount > 0"
                variant="default"
                class="absolute -right-2 -top-2 min-w-5 justify-center rounded-full bg-sky-600 px-1.5 py-0 text-white hover:bg-sky-600"
              >
                {{ resumeActiveBatchCount }}
              </Badge>
            </div>
          </div>
        </div>
        <Card
          v-for="b in resumeBatches"
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
                  <span>·</span>
                  <span>{{ batchThresholdSummary(b) }}</span>
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
                  :disabled="b.status === 'processing' || b.status === 'queued'"
                  @click="openBatchThresholdDialog(b)"
                >
                  <SlidersHorizontal class="h-3.5 w-3.5" />
                  调整阈值
                </Button>
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
                v-for="f in sortedBatchFiles(b.id)"
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
                            screeningDisplayScore(f),
                            screeningRecommendationVerdict(f),
                          ),
                        ]"
                      >
                        初筛{{ screeningRecommendationLabel(f) }}
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

                    <div class="rounded-xl border border-border/60 bg-muted/20 p-3">
                      <dl class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div
                          v-for="item in screeningCandidateOverviewItems(f)"
                          :key="item.label"
                          class="min-w-0 space-y-1"
                        >
                          <dt class="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            {{ item.label }}
                          </dt>
                          <dd
                            :class="[
                              item.label === '学历/学校'
                                ? 'line-clamp-2 break-words text-sm font-medium leading-relaxed'
                                : 'truncate text-sm font-medium leading-relaxed',
                            ]"
                          >
                            {{ item.value }}
                          </dd>
                        </div>
                      </dl>
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
                    screeningScoreStampClass(screeningRecommendationVerdict(f)),
                  ]"
                >
                  <span class="text-[10px] leading-none tracking-[0.18em]">
                    {{
                      screeningScoreStampLabel(
                        screeningRecommendationVerdict(f),
                      )
                    }}
                  </span>
                  <span class="mt-1 text-xl leading-none tabular-nums">
                    {{ screeningDisplayScore(f) }}%
                  </span>
                </div>
              </article>
            </div>
          </div>
        </Card>
      </div>
        </div>

        <Collapsible v-slot="{ open }" :default-open="false" class="rounded-xl border border-border/60 bg-card/70">
          <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-sm font-medium">历史面试导入</p>
              <p class="text-xs text-muted-foreground">
                从候选人页发起的面试导入会汇总在这里。
              </p>
            </div>
            <CollapsibleTrigger class="group inline-flex items-center gap-2 self-start rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 sm:self-auto">
              <span>{{ interviewBatches.length }} 个批次</span>
              <span v-if="interviewActiveBatchCount > 0">· {{ interviewActiveBatchCount }} 个处理中</span>
              <ChevronDown :class="['h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '']" />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <div class="space-y-4 border-t border-border/60 p-4">
          <Card v-if="!interviewBatches.length" class="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            暂无历史记录，请从候选人页发起导入。
          </Card>

          <template v-else>
            <Card
              v-for="b in interviewBatches"
              :key="b.id"
              class="overflow-hidden border-border/70 shadow-sm"
            >
              <div class="space-y-4 p-5">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="min-w-0 flex-1 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge :variant="statusVariant(b.status)">{{ interviewBatchStatusLabel(b) }}</Badge>
                      <Badge variant="outline">{{ interviewImportSourceTypeLabel(b.sourceType) }}</Badge>
                      <span class="text-sm font-medium text-foreground/90">{{ formatImportBatchDisplayName(b) }}</span>
                      <span class="text-xs text-muted-foreground">{{ formatImportTimestamp(b.createdAt) }}</span>
                    </div>

                    <p class="text-sm text-muted-foreground">
                      {{ interviewBatchStatusDescription(b) }}
                    </p>

                    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <div
                        v-for="item in interviewBatchOverviewItems(b)"
                        :key="`${b.id}-${item.label}`"
                        class="rounded-xl border border-border/60 bg-muted/20 p-3"
                      >
                        <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{{ item.label }}</p>
                        <p class="mt-1 text-sm font-semibold text-foreground">{{ item.value }}</p>
                        <p class="mt-1 text-xs text-muted-foreground">{{ item.hint }}</p>
                      </div>
                    </div>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
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
                      {{ expandedBatches.has(b.id) ? '收起详情' : '查看详情' }}
                    </Button>
                    <Button
                      v-if="b.status === 'processing' || b.status === 'queued'"
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

                <div v-if="b.summary?.errors?.length" class="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <p class="text-sm font-medium text-amber-900 dark:text-amber-200">处理提示</p>
                  <ul class="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
                    <li v-for="item in b.summary.errors" :key="`${b.id}-${item}`">• {{ item }}</li>
                  </ul>
                </div>
              </div>

              <div
                v-if="expandedBatches.has(b.id)"
                class="border-t bg-muted/20 px-5 py-4"
              >
                <div v-if="loadingFiles[b.id]" class="space-y-2">
                  <Skeleton
                    class="h-24 w-full rounded-xl"
                    v-for="i in 2"
                    :key="i"
                  />
                </div>

                <div
                  v-else-if="!batchFiles[b.id]?.length"
                  class="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  暂无任务明细
                </div>

                <div v-else class="space-y-3">
                  <article
                    v-for="task in interviewBatchFilesInDisplayOrder(b.id)"
                    :key="task.id"
                    class="rounded-xl border border-border/60 bg-background px-4 py-4 shadow-sm"
                  >
                    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0 flex-1 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge :variant="statusVariant(task.status)">{{ interviewTaskStatusLabel(task) }}</Badge>
                          <span class="truncate text-sm font-medium text-foreground">{{ fileNameOf(task.originalPath) }}</span>
                        </div>
                        <p class="text-sm text-muted-foreground">{{ interviewTaskStatusDescription(task) }}</p>

                        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          <div
                            v-for="item in interviewTaskOverviewItems(task)"
                            :key="`${task.id}-${item.label}`"
                            class="rounded-xl border border-border/60 bg-muted/20 p-3"
                          >
                            <p class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{{ item.label }}</p>
                            <p class="mt-1 text-sm font-semibold text-foreground">{{ item.value }}</p>
                            <p class="mt-1 text-xs text-muted-foreground">{{ item.hint }}</p>
                          </div>
                        </div>

                        <p v-if="task.errorMessage" class="text-xs text-destructive break-all">{{ task.errorMessage }}</p>
                      </div>

                      <div class="shrink-0 text-xs text-muted-foreground">
                        当前阶段：{{ interviewImportStageLabel(task.stage ?? task.status) }}
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </Card>
          </template>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <ExportScreeningDialog v-model:open="exportDialogOpen" :batches="resumeBatches" />
      </div>
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
      :batch-screening-config="selectedBatchScreeningConfig"
      :score-action-pending="scoreActionPending"
      :current-position="currentScreeningPosition"
      :total-positions="currentScreeningTotal"
      :has-prev="Boolean(previousScreeningFile)"
      :has-next="Boolean(nextScreeningFile)"
      @update:open="screeningDialogOpen = $event"
      @run-screening="handleRunFileScreening"
      @retry-university-verification="handleRetryUniversityVerification"
      @override-score="handleOverrideScreeningScore"
      @clear-score-override="handleClearScreeningScore"
      @navigate-prev="showAdjacentScreeningDetail(-1)"
      @navigate-next="showAdjacentScreeningDetail(1)"
    />
    <Dialog v-model:open="thresholdDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>调整推荐阈值</DialogTitle>
          <DialogDescription>
            {{ thresholdDialogBatch ? `当前批次：${formatImportBatchDisplayName(thresholdDialogBatch)}` : '调整当前批次的通过 / 待定 / 淘汰推荐规则' }}
          </DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-2 md:grid-cols-2">
          <div class="space-y-2">
            <Label for="batch-pass-threshold">通过阈值</Label>
            <Input id="batch-pass-threshold" v-model="thresholdPassInput" inputmode="numeric" placeholder="例如 80" />
          </div>
          <div class="space-y-2">
            <Label for="batch-review-threshold">待定阈值</Label>
            <Input id="batch-review-threshold" v-model="thresholdReviewInput" inputmode="numeric" placeholder="例如 70" />
          </div>
        </div>

        <div class="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <div>
            <p class="text-sm font-medium text-foreground">本地学习反馈</p>
            <p class="mt-1 text-xs text-muted-foreground">开启后，后续同分组/同模板的 AI 初筛会参考本地人工改分样本。</p>
          </div>
          <Switch :model-value="thresholdLearningEnabled" @update:model-value="thresholdLearningEnabled = Boolean($event)" />
        </div>

        <div class="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <p class="font-medium text-foreground">分段预览</p>
          <p v-if="thresholdPreviewText" class="mt-1 text-muted-foreground">{{ thresholdPreviewText }}</p>
          <p v-else class="mt-1 text-muted-foreground">请输入两个整数阈值后查看预览</p>
        </div>

        <div class="flex items-center justify-between rounded-xl border border-dashed border-border/60 px-4 py-3 text-sm">
          <div>
            <p class="font-medium text-foreground">清空本批次改分记录</p>
            <p class="mt-1 text-xs text-muted-foreground">会移除本批次所有人工改分覆盖层，但不会改动原始 AI 结果。</p>
          </div>
          <Button variant="outline" :disabled="thresholdSaving" @click="clearBatchFeedbacks">
            清空记录
          </Button>
        </div>

        <p v-if="thresholdValidationMessage" class="text-sm text-destructive">
          {{ thresholdValidationMessage }}
        </p>

        <DialogFooter class="mt-2 gap-2">
          <Button variant="secondary" :disabled="thresholdSaving" @click="thresholdDialogOpen = false">
            取消
          </Button>
          <Button :disabled="Boolean(thresholdValidationMessage) || thresholdSaving" @click="saveBatchThresholdConfig">
            {{ thresholdSaving ? "保存中..." : "保存阈值" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="templateDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择筛选分组与模板</DialogTitle>
          <DialogDescription>
            选择本次重跑使用的筛选分组和模板
          </DialogDescription>
        </DialogHeader>

        <Separator class="my-4" />

        <div class="space-y-2 pb-4">
          <p class="text-xs font-medium text-muted-foreground px-1">筛选分组</p>
          <Select
            v-if="screeningTemplates.groups.value.length > 0"
            :model-value="dialogSelectedGroupId"
            @update:model-value="onDialogGroupChange(String($event))"
          >
            <SelectTrigger class="h-9 w-full min-w-0 justify-between rounded-lg text-sm">
              <SelectValue placeholder="选择筛选分组" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="group in screeningTemplates.groups.value"
                :key="group.id"
                :value="group.id"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 truncate">{{ group.name }}</span>
                  <Badge variant="secondary" class="shrink-0 text-[10px] px-1.5 py-0">{{ group.templateCount }} 模板</Badge>
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <p v-if="screeningTemplates.selectedGroupBatchScreeningConfig.value" class="text-xs text-muted-foreground px-1">
            推荐阈值：通过 ≥ {{ screeningTemplates.selectedGroupBatchScreeningConfig.value.passThreshold }}，待定 ≥ {{ screeningTemplates.selectedGroupBatchScreeningConfig.value.reviewThreshold }}。
          </p>
        </div>

        <div class="max-h-[360px] space-y-3 overflow-y-auto pr-1">
          <template v-if="screeningTemplates.templates.value.length > 0">
            <p class="text-xs font-medium text-muted-foreground px-1">
              分组内模板
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
            :disabled="!dialogSelectedGroupId || !dialogSelectedTemplateId"
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
  SlidersHorizontal,
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
  extractImportOriginalFileName,
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
import {
  buildInterviewImportOverviewItems,
  interviewImportSourceTypeLabel,
  interviewImportStageLabel,
  interviewImportStatusDescription,
  interviewImportStatusLabel,
  isInterviewImportSourceType,
  resolveInterviewImportBatchSummary,
} from "@/composables/import/interview-import-formatters";
import { buildScreeningCandidateOverviewItems } from "@/composables/import/screening-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  deriveScreeningRecommendation,
  formatScreeningThresholdSummary,
  getEffectiveScreeningScore,
  type InterviewImportBatchSummary,
  normalizeBatchScreeningConfig,
  validateBatchScreeningConfig,
} from "@ims/shared";
import type { BatchScreeningConfig, ImportBatchListItem, ImportFileTask } from "@ims/shared";

interface PresetProvider {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

interface ImportBatchView extends ImportBatchListItem {
  groupId: string | null;
  batchScreeningConfig: BatchScreeningConfig;
  summaryJson: string | null;
  summary: InterviewImportBatchSummary | null;
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
  updateBatchScreeningConfig,
  updateTaskScreeningScore,
  clearTaskScreeningScore,
  clearBatchScoreFeedbacks,
  cancelBatch,
  deleteBatch,
} = importBatches;

const screeningTemplates = useScreeningTemplates();
const templateDialogOpen = ref(false);
const dialogSelectedTemplateId = ref("");
const dialogSelectedGroupId = ref("");
const templateOptionRefs = new Map<string, Element>();
const FILE_SCREENING_POLL_INTERVAL_MS = 1500;
const FILE_SCREENING_POLL_ATTEMPTS = 40;
interface TemplateDialogTarget {
  type: "batch" | "file";
  id: string;
  batchId?: string;
}
const templateDialogTarget = ref<TemplateDialogTarget | null>(null);
const thresholdDialogOpen = ref(false);
const thresholdDialogBatchId = ref("");
const thresholdPassInput = ref("");
const thresholdReviewInput = ref("");
const thresholdLearningEnabled = ref(false);
const thresholdSaving = ref(false);
const scoreActionPending = ref(false);

const thresholdDialogBatch = computed(() => (
  thresholdDialogBatchId.value
    ? batchById.value.get(thresholdDialogBatchId.value) ?? null
    : null
));

function parseThresholdInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

const thresholdValidationMessage = computed(() => {
  const passThreshold = parseThresholdInput(thresholdPassInput.value);
  const reviewThreshold = parseThresholdInput(thresholdReviewInput.value);
  if (passThreshold === null || reviewThreshold === null) {
    return "请填写两个整数阈值";
  }

  return validateBatchScreeningConfig({
    passThreshold,
    reviewThreshold,
    learningEnabled: thresholdLearningEnabled.value,
  });
});

const thresholdPreviewText = computed(() => {
  const passThreshold = parseThresholdInput(thresholdPassInput.value);
  const reviewThreshold = parseThresholdInput(thresholdReviewInput.value);
  if (passThreshold === null || reviewThreshold === null) {
    return "";
  }

  return formatScreeningThresholdSummary({
    groupId: thresholdDialogBatch.value?.groupId ?? null,
    passThreshold,
    reviewThreshold,
    learningEnabled: thresholdLearningEnabled.value,
  });
});

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
  const summary = resolveInterviewImportBatchSummary({
    summary: batch?.summary ?? null,
    summaryJson: batch?.summaryJson ?? null,
  });

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
    groupId: batch?.groupId ?? null,
    templateId: batch?.templateId ?? null,
    passThreshold: batch?.passThreshold ?? null,
    reviewThreshold: batch?.reviewThreshold ?? null,
    learningEnabled: batch?.learningEnabled ?? null,
    summaryJson: batch?.summaryJson ?? null,
    summary,
    batchScreeningConfig: normalizeBatchScreeningConfig(batch?.batchScreeningConfig ?? {
      groupId: batch?.groupId ?? null,
      passThreshold: 80,
      reviewThreshold: 70,
      learningEnabled: false,
    }),
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
const resumeBatches = computed(() => safeBatches.value.filter((batch) => !isInterviewImportSourceType(batch.sourceType)));
const interviewBatches = computed(() => safeBatches.value.filter((batch) => isInterviewImportSourceType(batch.sourceType)));
const batchById = computed(() => new Map(safeBatches.value.map((batch) => [batch.id, batch])));
const hasActiveResumeImports = computed(() => resumeBatches.value.some((batch) => batch.status === "processing" || batch.status === "queued"));
const resumeActiveBatchCount = computed(() => resumeBatches.value.filter((batch) => batch.status === "processing" || batch.status === "queued").length);
const interviewActiveBatchCount = computed(() => interviewBatches.value.filter((batch) => batch.status === "processing" || batch.status === "queued").length);
const exportableBatchCount = computed(
  () => resumeBatches.value.filter((batch) => batch.status === "completed" || batch.status === "partial_success").length,
);

function batchScreeningConfigOf(batchId: string | null | undefined): BatchScreeningConfig {
  if (!batchId) {
    return normalizeBatchScreeningConfig(null);
  }

  return normalizeBatchScreeningConfig(batchById.value.get(batchId)?.batchScreeningConfig ?? null);
}

function screeningRecommendationOf(file: ImportFileTask) {
  const conclusion = screeningResult(file)?.screeningConclusion;
  if (!conclusion) {
    return null;
  }

  return conclusion.derivedRecommendation
    ?? deriveScreeningRecommendation(getEffectiveScreeningScore(conclusion), batchScreeningConfigOf(file.batchId));
}

function screeningDisplayScore(file: ImportFileTask) {
  return getEffectiveScreeningScore(screeningResult(file)?.screeningConclusion ?? null) ?? 0;
}

function screeningRecommendationLabel(file: ImportFileTask) {
  return screeningRecommendationOf(file)?.label
    ?? screeningResult(file)?.screeningConclusion?.label
    ?? "";
}

function screeningRecommendationVerdict(file: ImportFileTask) {
  return screeningRecommendationOf(file)?.verdict
    ?? screeningResult(file)?.screeningConclusion?.derivedRecommendation?.verdict
    ?? screeningResult(file)?.screeningConclusion?.verdict;
}

function batchThresholdSummary(batch: ImportBatchView) {
  return formatScreeningThresholdSummary(batch.batchScreeningConfig);
}

const analysisTotalFiles = computed(() =>
  resumeBatches.value.reduce((sum, batch) => sum + batchAnalysisTotalFiles(batch), 0),
);
const analysisCompletedFiles = computed(() =>
  resumeBatches.value.reduce((sum, batch) => sum + batchAnalysisCompletedFiles(batch), 0),
);
const analysisPendingFiles = computed(() =>
  resumeBatches.value.reduce((sum, batch) => sum + batchAnalysisPendingFiles(batch), 0),
);
const analysisRunningFiles = computed(() =>
  resumeBatches.value.reduce((sum, batch) => sum + batchAnalysisRunningFiles(batch), 0),
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
  const groupId = screeningTemplates.selectedGroupId.value || undefined;
  if (!groupId) {
    notifyError("请先选择筛选分组", {
      title: "无法开始导入",
      fallbackMessage: "新建导入需要先选择筛选分组",
    });
    return;
  }
  const templateId = autoScreen.value ? (screeningTemplates.selectedId.value || undefined) : undefined;
  void fileImport.triggerImport({ autoScreen: autoScreen.value, groupId, templateId });
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

function screeningCandidateOverviewItems(file: ImportFileTask) {
  return buildScreeningCandidateOverviewItems(screeningResult(file));
}

function screeningScoreValue(file: ImportFileTask): number | null {
  const conclusion = screeningResult(file)?.screeningConclusion;
  if (!conclusion) {
    return null;
  }
  return getEffectiveScreeningScore(conclusion);
}

function interviewBatchStatusLabel(batch: ImportBatchView) {
  return interviewImportStatusLabel({
    status: batch.status,
    currentStage: batch.currentStage,
    summary: batch.summary,
  });
}

function interviewBatchStatusDescription(batch: ImportBatchView) {
  return interviewImportStatusDescription({
    status: batch.status,
    currentStage: batch.currentStage,
    summary: batch.summary,
  });
}

function interviewBatchOverviewItems(batch: ImportBatchView) {
  return buildInterviewImportOverviewItems(batch.summary);
}

function interviewBatchFilesInDisplayOrder(batchId: string) {
  return [...(batchFiles.value[batchId] ?? [])].sort((left, right) => right.createdAt - left.createdAt);
}

function interviewTaskSummary(task: ImportFileTask) {
  return resolveInterviewImportBatchSummary({ resultJson: task.resultJson });
}

function interviewTaskStatusLabel(task: ImportFileTask) {
  return interviewImportStatusLabel({
    status: task.status,
    currentStage: task.stage,
    summary: interviewTaskSummary(task),
  });
}

function interviewTaskStatusDescription(task: ImportFileTask) {
  return interviewImportStatusDescription({
    status: task.status,
    currentStage: task.stage,
    summary: interviewTaskSummary(task),
  });
}

function interviewTaskOverviewItems(task: ImportFileTask) {
  return buildInterviewImportOverviewItems(interviewTaskSummary(task));
}

function sortedBatchFiles(batchId: string): ImportFileTask[] {
  return (batchFiles.value[batchId] ?? [])
    .map((file, index) => ({ file, index }))
    .sort((a, b) => {
      const scoreA = screeningScoreValue(a.file);
      const scoreB = screeningScoreValue(b.file);

      if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      if (scoreA !== null && scoreB === null) {
        return -1;
      }

      if (scoreA === null && scoreB !== null) {
        return 1;
      }

      return a.index - b.index;
    })
    .map(({ file }) => file);
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

function initialDialogGroupId(batchId?: string) {
  if (batchId) {
    const batch = safeBatches.value.find((item) => item.id === batchId);
    if (batch?.groupId) {
      return batch.groupId;
    }
  }

  return screeningTemplates.selectedGroupId.value ?? screeningTemplates.groups.value[0]?.id ?? "";
}

async function handleGroupChange(groupId: string) {
  if (!groupId) return;
  await screeningTemplates.selectGroup(groupId);
}

async function onDialogGroupChange(groupId: string) {
  if (!groupId) return;
  dialogSelectedGroupId.value = groupId;
  await screeningTemplates.selectGroup(groupId);
  dialogSelectedTemplateId.value = initialDialogTemplateId();
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

function screeningScoreStampLabel(verdict?: string | null) {
  if (verdict === "reject") return "NO MATCH";
  if (verdict === "review") return "REVIEW";
  return "MATCH";
}

function screeningScoreStampClass(verdict?: string | null) {
  if (verdict === "reject") {
    return "border-rose-500/75 text-rose-600 dark:border-rose-400/75 dark:text-rose-300";
  }

  if (verdict === "review") {
    return "border-amber-500/75 text-amber-600 dark:border-amber-400/75 dark:text-amber-300";
  }

  if (verdict === "pass") {
    return "border-blue-500/70 text-blue-600 dark:border-blue-400/70 dark:text-blue-300";
  }

  return "border-muted-foreground/40 text-muted-foreground/70";
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

function batchScreeningProgress(batch: ImportBatchView) {
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
  return extractImportOriginalFileName(originalPath, originalPath);
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

function openBatchThresholdDialog(batch: ImportBatchView) {
  thresholdDialogBatchId.value = batch.id;
  thresholdPassInput.value = String(batch.batchScreeningConfig.passThreshold);
  thresholdReviewInput.value = String(batch.batchScreeningConfig.reviewThreshold);
  thresholdLearningEnabled.value = batch.batchScreeningConfig.learningEnabled;
  thresholdDialogOpen.value = true;
}

async function saveBatchThresholdConfig() {
  const batch = thresholdDialogBatch.value;
  if (!batch || thresholdSaving.value) {
    return;
  }

  const passThreshold = parseThresholdInput(thresholdPassInput.value);
  const reviewThreshold = parseThresholdInput(thresholdReviewInput.value);
  if (passThreshold === null || reviewThreshold === null) {
    notifyError("请填写有效的整数阈值");
    return;
  }

  if (thresholdValidationMessage.value) {
    notifyError(thresholdValidationMessage.value);
    return;
  }

  thresholdSaving.value = true;
  try {
    await updateBatchScreeningConfig(batch.id, {
      passThreshold,
      reviewThreshold,
      learningEnabled: thresholdLearningEnabled.value,
    });

    if (selectedFile.value?.batchId === batch.id) {
      await refreshSelectedScreeningFile(selectedFile.value.id, batch.id);
    }

    notifySuccess("推荐阈值已保存");
    thresholdDialogOpen.value = false;
  } catch (error) {
    notifyError(
      reportAppError("import/save-batch-threshold-config", error, {
        title: "保存推荐阈值失败",
        fallbackMessage: "请稍后重试",
      }),
    );
  } finally {
    thresholdSaving.value = false;
  }
}

async function clearBatchFeedbacks() {
  const batch = thresholdDialogBatch.value;
  if (!batch || thresholdSaving.value) {
    return;
  }

  if (!window.confirm(`确认清空批次「${formatImportBatchDisplayName(batch)}」的所有人工改分记录吗？`)) {
    return;
  }

  thresholdSaving.value = true;
  try {
    const result = await clearBatchScoreFeedbacks(batch.id);
    if (selectedFile.value?.batchId === batch.id) {
      await refreshSelectedScreeningFile(selectedFile.value.id, batch.id);
    }
    notifySuccess(`已清空 ${result.clearedCount} 条人工改分记录`);
  } catch (error) {
    notifyError(
      reportAppError("import/clear-batch-score-feedbacks", error, {
        title: "清空人工改分记录失败",
        fallbackMessage: "请稍后重试",
      }),
    );
  } finally {
    thresholdSaving.value = false;
  }
}

// AI Screening detail dialog
const exportDialogOpen = ref(false);
const screeningDialogOpen = ref(false);
const selectedScreeningData =
  ref<ReturnType<typeof parseImportTaskResult>>(null);
const selectedFile = ref<ImportFileTask | null>(null);
const selectedBatchScreeningConfig = computed(() => batchScreeningConfigOf(selectedFile.value?.batchId));

const currentScreeningFiles = computed(() => {
  const currentBatchId = selectedFile.value?.batchId;
  if (!currentBatchId) return [] as ImportFileTask[];

  return safeBatches.value.reduce<ImportFileTask[]>((files, batch) => {
    if (!expandedBatches.value.has(batch.id)) {
      return files;
    }

    const screenableBatchFiles = sortedBatchFiles(batch.id).filter(
      (file) => Boolean(parseImportTaskResult(file.resultJson)?.parsedResume),
    );

    if (screenableBatchFiles.length === 0) {
      return files;
    }

    files.push(...screenableBatchFiles);
    return files;
  }, []);
});

const currentScreeningFileIndex = computed(() => {
  const currentId = selectedFile.value?.id;
  if (!currentId) return -1;
  return currentScreeningFiles.value.findIndex((file) => file.id === currentId);
});

const currentScreeningPosition = computed(() => {
  const index = currentScreeningFileIndex.value;
  return index >= 0 ? index + 1 : 0;
});

const currentScreeningTotal = computed(() => {
  return currentScreeningFiles.value.length;
});

const previousScreeningFile = computed(() => {
  const files = currentScreeningFiles.value;
  const index = currentScreeningFileIndex.value;
  if (files.length <= 1 || index < 0) {
    return null;
  }

  return files[(index - 1 + files.length) % files.length] ?? null;
});

const nextScreeningFile = computed(() => {
  const files = currentScreeningFiles.value;
  const index = currentScreeningFileIndex.value;
  if (files.length <= 1 || index < 0) {
    return null;
  }

  return files[(index + 1) % files.length] ?? null;
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
      dialogSelectedGroupId.value = initialDialogGroupId(batchId);
      if (dialogSelectedGroupId.value) {
        await screeningTemplates.selectGroup(dialogSelectedGroupId.value);
      }
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
  dialogSelectedGroupId.value = initialDialogGroupId(batchId);
  if (dialogSelectedGroupId.value) {
    await screeningTemplates.selectGroup(dialogSelectedGroupId.value);
  }
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

async function handleOverrideScreeningScore(payload: { taskId: string; score: number; reason?: string | null }) {
  const batchId = selectedFile.value?.batchId
    ?? Object.entries(batchFiles.value).find(([, files]) => files.some((file) => file.id === payload.taskId))?.[0];
  if (!batchId || scoreActionPending.value) {
    return;
  }

  scoreActionPending.value = true;
  try {
    await updateTaskScreeningScore(payload.taskId, batchId, payload.score, payload.reason ?? null);
    await refreshSelectedScreeningFile(payload.taskId, batchId);
    notifySuccess("人工改分已保存");
  } catch (error) {
    notifyError(
      reportAppError("import/override-screening-score", error, {
        title: "保存人工改分失败",
        fallbackMessage: "请稍后重试",
      }),
    );
  } finally {
    scoreActionPending.value = false;
  }
}

async function handleClearScreeningScore(taskId: string) {
  const batchId = selectedFile.value?.batchId
    ?? Object.entries(batchFiles.value).find(([, files]) => files.some((file) => file.id === taskId))?.[0];
  if (!batchId || scoreActionPending.value) {
    return;
  }

  if (!window.confirm("确认清除这份简历的人工改分记录吗？")) {
    return;
  }

  scoreActionPending.value = true;
  try {
    await clearTaskScreeningScore(taskId, batchId);
    await refreshSelectedScreeningFile(taskId, batchId);
    notifySuccess("人工改分已清除");
  } catch (error) {
    notifyError(
      reportAppError("import/clear-screening-score", error, {
        title: "清除人工改分失败",
        fallbackMessage: "请稍后重试",
      }),
    );
  } finally {
    scoreActionPending.value = false;
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
  dialogSelectedGroupId.value = initialDialogGroupId(batchId);
  if (dialogSelectedGroupId.value) {
    await screeningTemplates.selectGroup(dialogSelectedGroupId.value);
  }
  dialogSelectedTemplateId.value = initialDialogTemplateId();
  templateDialogOpen.value = true;
}

async function executeBatchRerun(batchId: string, groupId?: string, templateId?: string) {
  markBatchScreeningPending(batchId, true);

  try {
    const result = await rerunScreening(batchId, groupId, templateId);
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
  const groupId = dialogSelectedGroupId.value || undefined;
  const tid = dialogSelectedTemplateId.value || undefined;
  if (tid) {
    screeningTemplates.selectTemplate(tid);
  }

  if (target.type === "batch") {
    await executeBatchRerun(target.id, groupId, tid);
  } else {
    await importBatches.rerunFileScreening(target.id, target.batchId!, groupId, tid);
    await waitForFileScreeningResult(target.id, target.batchId!);
  }
}
</script>
