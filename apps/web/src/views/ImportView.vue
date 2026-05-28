<template>
  <AppPageShell :class="imsDesign.shell">
    <ImsPageBackground />

    <AppPageHeader content-class="relative z-[1] h-[72px] px-16">
      <AppBrandLink />
      <div class="flex-1" />
      <div class="flex items-center gap-2 shrink-0">
        <AppUserActions />
      </div>
    </AppPageHeader>

    <AppPageContent class="relative z-[1] space-y-5 px-16 py-6">
      <div class="space-y-5">
        <Card
          class="relative overflow-hidden rounded-[22px] border border-[#DCE6F4] bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(247,250,255,0.94))] shadow-[0_18px_44px_-34px_rgba(15,23,42,0.22)] backdrop-blur dark:border-white/8 dark:bg-[linear-gradient(180deg,rgba(18,28,43,0.96),rgba(11,18,32,0.92))] dark:shadow-[0_22px_54px_-38px_rgba(2,8,23,0.8)]"
        >
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 opacity-100"
          >
            <div
              class="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(201,216,255,0.34),rgba(201,216,255,0))] dark:bg-[linear-gradient(180deg,rgba(59,130,246,0.18),rgba(59,130,246,0))]"
            />
            <div
              class="absolute -left-16 top-12 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(132,164,255,0.14)_0%,rgba(132,164,255,0)_72%)] dark:bg-[radial-gradient(circle,rgba(59,130,246,0.18)_0%,rgba(59,130,246,0)_72%)]"
            />
            <div
              class="absolute right-[22%] top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0)_72%)] dark:bg-[radial-gradient(circle,rgba(148,163,184,0.12)_0%,rgba(148,163,184,0)_72%)]"
            />
            <div
              class="absolute inset-0 bg-[linear-gradient(rgba(145,170,224,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(145,170,224,0.075)_1px,transparent_1px)] bg-[size:26px_26px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.42),transparent_72%)] dark:bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)]"
            />
            <div
              class="absolute inset-y-0 right-[360px] w-px bg-[linear-gradient(180deg,rgba(176,194,230,0),rgba(176,194,230,0.5),rgba(176,194,230,0))] dark:bg-[linear-gradient(180deg,rgba(148,163,184,0),rgba(148,163,184,0.28),rgba(148,163,184,0))]"
            />
          </div>
          <div
            class="relative grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
          >
            <div class="flex min-h-[172px] max-w-[980px] flex-col justify-between gap-6">
              <div class="space-y-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <!-- <span
                    class="inline-flex h-2.5 w-2.5 rounded-full bg-[#0062FF] shadow-[0_0_0_5px_rgba(0,98,255,0.10)]"
                  /> -->
                  <Badge
                    class="rounded-full border-transparent bg-primary/10 px-2.5 text-primary"
                    >AI 初筛</Badge
                  >
                  <Badge
                    v-if="hasActiveResumeImports"
                    variant="secondary"
                    class="rounded-full"
                    >{{ resumeActiveBatchCount }} 进行中</Badge
                  >
                </div>
                <h1
                  class="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground"
                >
                  简历导入与初筛工作台
                </h1>
                <p
                  class="max-w-[760px] text-[14px] leading-6 text-muted-foreground"
                >
                  上传简历、解析文件、运行 AI
                  初筛，并在同一个工作台完成复核、导出和面试安排。
                </p>
              </div>

              <div
                class="grid max-w-[760px] gap-2.5 text-[12px] text-muted-foreground sm:grid-cols-3"
              >
                <span
                  class="rounded-[14px] border border-white/70 bg-white/54 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[10px] dark:border-white/8 dark:bg-white/5"
                >
                  <span class="block text-[11px] tracking-[0.04em] text-muted-foreground/80"
                    >导入批次</span
                  >
                  <span
                    class="mt-1 block text-[18px] font-semibold tracking-[-0.02em] text-foreground"
                    >{{ resumeBatches.length }}</span
                  >
                </span>
                <span
                  class="rounded-[14px] border border-[#C7D8FF] bg-[linear-gradient(180deg,rgba(235,242,255,0.92),rgba(227,236,255,0.72))] px-3.5 py-3 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-primary/18 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.18),rgba(30,64,175,0.12))] dark:text-blue-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <span class="block text-[11px] tracking-[0.04em] text-primary/75">可导出</span>
                  <span class="mt-1 block text-[18px] font-semibold tracking-[-0.02em]">{{
                    exportableBatchCount
                  }}</span>
                </span>
                <span
                  v-if="analysisTotalFiles > 0"
                  class="rounded-[14px] border border-[#C7D8FF] bg-[linear-gradient(180deg,rgba(235,242,255,0.92),rgba(227,236,255,0.72))] px-3.5 py-3 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-primary/18 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.18),rgba(30,64,175,0.12))] dark:text-blue-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <span class="block text-[11px] tracking-[0.04em] text-primary/75"
                    >分析进度</span
                  >
                  <span class="mt-1 block text-[18px] font-semibold tracking-[-0.02em]"
                    >{{ analysisCompletedFiles }}/{{ analysisTotalFiles }}</span
                  >
                </span>
                <span
                  v-if="analysisPendingFiles > 0 || analysisRunningFiles > 0"
                  class="rounded-[14px] border border-white/70 bg-white/54 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] backdrop-blur-[10px] dark:border-white/8 dark:bg-white/5"
                >
                  <span class="block text-[11px] tracking-[0.04em] text-muted-foreground/80"
                    >队列</span
                  >
                  <span
                    class="mt-1 block text-[16px] font-semibold tracking-[-0.02em] text-foreground"
                    >{{ analysisPendingFiles }} 待分析 ·
                    {{ analysisRunningFiles }} 分析中</span
                  >
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
                <span>
                  默认流程
                  <span class="ml-1 font-medium text-foreground">导入 → 初筛 → 复核 → 导出</span>
                </span>
                <span v-if="resumeActiveBatchCount > 0">
                  当前队列
                  <span class="ml-1 font-medium text-foreground">{{ resumeActiveBatchCount }} 个批次处理中</span>
                </span>
              </div>
            </div>

            <div
              data-onboarding="screening-toggle"
              class="flex w-full flex-col gap-4 rounded-[16px] border border-border/50 bg-background/[0.88] p-4 shadow-sm shadow-slate-950/[0.04] dark:border-white/10 dark:bg-white/[0.07] dark:shadow-none"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      :class="
                        autoScreen ? 'bg-primary' : 'bg-muted-foreground/50'
                      "
                    />
                    <p class="text-[14px] font-semibold text-foreground">
                      AI 初筛
                    </p>
                  </div>
                  <p class="text-[12px] leading-5 text-muted-foreground">
                    导入后自动生成结论，减少人工复核前的判断成本。
                  </p>
                </div>
                <Switch
                  class="mt-0.5"
                  :model-value="autoScreen"
                  @update:model-value="onAutoScreenChange"
                />
              </div>
              <div
                class="rounded-[10px] bg-muted/45 px-3 py-2 text-[12px] font-medium text-muted-foreground dark:bg-white/6"
              >
                {{ autoScreen ? "新导入默认启用" : "新导入仅解析" }}
              </div>
              <div
                class="space-y-2 border-t border-border/45 pt-4 dark:border-white/8"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[12px] font-semibold text-muted-foreground">
                    分组
                  </p>
                  <router-link
                    to="/screening/template-groups"
                    class="shrink-0 text-xs font-medium text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
                  >
                    管理分组
                  </router-link>
                </div>
                <Select
                  v-if="screeningTemplates.groups.value.length > 0"
                  :model-value="screeningTemplates.selectedGroupId.value ?? ''"
                  @update:model-value="handleGroupChange(String($event))"
                >
                  <SelectTrigger
                    class="h-10 w-full min-w-0 justify-between rounded-[10px] border-transparent bg-muted/35 text-sm shadow-none dark:bg-white/6"
                  >
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
                        <Badge
                          variant="secondary"
                          class="shrink-0 text-[10px] px-1.5 py-0"
                          >{{ group.templateCount }} 模板</Badge
                        >
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p v-else class="text-xs text-muted-foreground">先创建分组</p>
              </div>
              <div
                v-if="autoScreen"
                class="space-y-2 border-t border-border/45 pt-4 dark:border-white/8"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[12px] font-semibold text-muted-foreground">
                    模板
                  </p>
                  <router-link
                    to="/screening/templates"
                    class="shrink-0 text-xs font-medium text-primary/80 underline underline-offset-2 transition-colors hover:text-primary"
                  >
                    管理模板
                  </router-link>
                </div>
                <Select
                  v-if="screeningTemplates.templates.value.length > 0"
                  :model-value="screeningTemplates.selectedId.value ?? ''"
                  @update:model-value="
                    screeningTemplates.selectTemplate(String($event))
                  "
                >
                  <SelectTrigger
                    class="h-10 w-full min-w-0 justify-between rounded-[10px] border-transparent bg-muted/35 text-sm shadow-none dark:bg-white/6"
                  >
                    <SelectValue placeholder="选择筛选模板" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="template in screeningTemplates.templates.value"
                      :key="template.id"
                      :value="template.id"
                    >
                      <span class="flex min-w-0 items-center gap-2">
                        <span class="min-w-0 truncate">{{
                          template.name
                        }}</span>
                        <Badge
                          v-if="template.isDefault"
                          variant="secondary"
                          class="shrink-0 text-[10px] px-1.5 py-0"
                          >默认</Badge
                        >
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p v-else class="text-xs text-muted-foreground">使用默认模板</p>
              </div>
            </div>
          </div>
        </Card>

        <!-- <div class="grid gap-3 md:grid-cols-4">
          <div
            class="rounded-[14px] border border-border/45 bg-background/60 px-4 py-3.5 dark:border-white/8 dark:bg-white/4"
          >
            <p class="text-[13px] font-semibold text-foreground">01 导入</p>
            <p class="mt-1.5 text-[12px] leading-5 text-muted-foreground">
              PDF/压缩包批量进入队列
            </p>
          </div>
          <div
            class="rounded-[14px] border border-primary/15 bg-primary/[0.08] px-4 py-3.5 dark:bg-primary/10"
          >
            <p class="text-[13px] font-semibold text-foreground">02 解析</p>
            <p class="mt-1.5 text-[12px] leading-5 text-muted-foreground">
              抽取候选人和简历结构
            </p>
          </div>
          <div
            class="rounded-[14px] border border-primary/15 bg-primary/[0.08] px-4 py-3.5 dark:bg-primary/10"
          >
            <p class="text-[13px] font-semibold text-foreground">03 AI 初筛</p>
            <p class="mt-1.5 text-[12px] leading-5 text-muted-foreground">
              根据模板生成结论
            </p>
          </div>
          <div
            class="rounded-[14px] border border-border/45 bg-background/60 px-4 py-3.5 dark:border-white/8 dark:bg-white/4"
          >
            <p class="text-[13px] font-semibold text-foreground">04 复核</p>
            <p class="mt-1.5 text-[12px] leading-5 text-muted-foreground">
              人工确认后导出报告
            </p>
          </div>
        </div> -->

        <div
          class="space-y-6 rounded-[8px] border border-border/60 bg-card p-5 dark:border-white/8 dark:bg-card/82"
        >
          <div
            v-if="loading"
            class="space-y-3 rounded-[6px] bg-muted/35 p-6 dark:bg-white/4"
          >
            <Skeleton class="h-4 w-full rounded-md" />
            <Skeleton class="h-4 w-4/5 rounded-md" />
            <Skeleton class="h-4 w-3/5 rounded-md" />
          </div>

          <EmptyState
            v-else-if="!resumeBatches.length"
            scenario="import"
            description="还没有导入批次，先新建一个。"
            :action-text="'新建导入'"
            :action-icon="Plus"
            :action-handler="startImport"
          />

          <div v-else class="space-y-4">
            <div
              class="flex flex-col gap-3 rounded-[6px] bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-white/4"
            >
              <div class="min-w-0">
                <p class="text-[16px] font-semibold text-foreground">
                  当前批次
                </p>
                <div
                  class="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground"
                >
                  <span>{{ resumeBatches.length }} 个批次</span>
                  <span v-if="resumeActiveBatchCount > 0"
                    >· {{ resumeActiveBatchCount }} 个处理中</span
                  >
                  <span v-if="exportableBatchCount > 0"
                    >· {{ exportableBatchCount }} 个可导出</span
                  >
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  class="h-[38px] gap-2 rounded-[6px] border-0 bg-background px-4 text-[13px] font-semibold text-foreground shadow-none hover:bg-muted disabled:bg-transparent disabled:text-muted-foreground dark:bg-white/8 dark:hover:bg-white/14"
                  data-onboarding="export-screening"
                  :disabled="exportableBatchCount === 0"
                  @click="exportDialogOpen = true"
                >
                  <Upload class="h-4 w-4" />
                  导出报告
                </Button>
                <div class="relative">
                  <Button
                    class="h-[38px] gap-2 rounded-[6px] bg-[#0062FF] px-4 text-[13px] font-semibold text-white hover:bg-[#0057E5]"
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
                'overflow-hidden rounded-[6px] border border-border/50 bg-background/70 shadow-none dark:border-white/8 dark:bg-white/4',
                b.status === 'processing'
                  ? 'bg-muted/50 ring-0 dark:bg-white/8'
                  : '',
              ]"
            >
              <div
                class="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_1px_minmax(320px,0.78fr)] xl:items-stretch"
              >
                <div class="min-w-0 space-y-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge
                      :variant="batchPrimaryStatusVariant(b)"
                      class="rounded-[6px]"
                    >
                      {{ batchPrimaryStatusLabel(b) }}
                    </Badge>
                    <Badge
                      v-if="showBatchAutoScreenBadge(b)"
                      variant="outline"
                      class="rounded-[6px]"
                    >
                      AI 初筛
                    </Badge>
                    <span class="text-[12px] text-muted-foreground">{{
                      formatImportTimestamp(b.createdAt)
                    }}</span>
                  </div>
                  <div class="min-w-0">
                    <p
                      class="truncate text-[16px] font-semibold leading-tight text-foreground"
                    >
                      {{ formatImportBatchDisplayName(b) }}
                    </p>
                    <p class="mt-1 text-[12px] leading-5 text-muted-foreground">
                      {{ batchThresholdSummary(b) }}
                    </p>
                  </div>

                  <div
                    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-muted-foreground"
                  >
                    <span
                      class="font-medium text-slate-500 dark:text-slate-400"
                    >
                      总 {{ b.totalFiles }}
                    </span>
                    <span class="text-border">/</span>
                    <span
                      class="font-medium text-emerald-700 dark:text-emerald-300"
                    >
                      通过 {{ batchVerdictCount(b, "pass") }}
                    </span>
                    <span class="text-border">/</span>
                    <span
                      class="font-medium text-amber-700 dark:text-amber-300"
                    >
                      待复核 {{ batchVerdictCount(b, "review") }}
                    </span>
                    <span class="text-border">/</span>
                    <span class="font-medium text-rose-700 dark:text-rose-300">
                      淘汰 {{ batchVerdictCount(b, "reject") }}
                    </span>
                    <span class="text-border">/</span>
                    <span
                      class="font-medium text-slate-500 dark:text-slate-400"
                    >
                      待处理 {{ batchPendingOrRunningCount(b) }}
                    </span>
                  </div>
                </div>

                <div
                  class="hidden self-stretch bg-border/60 xl:block dark:bg-white/8"
                />

                <div class="space-y-3 px-1 py-1 xl:px-3 xl:py-2">
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 rounded-[6px] px-3 text-[12px] font-semibold"
                        @click="toggleFiles(b.id)"
                      >
                        <ChevronDown
                          :class="[
                            'h-3.5 w-3.5 transition-transform',
                            expandedBatches.has(b.id) ? 'rotate-180' : '',
                          ]"
                        />
                        {{
                          expandedBatches.has(b.id) ? "收起详情" : "查看文件"
                        }}
                      </Button>
                      <Button
                        v-if="b.failedFiles > 0"
                        variant="outline"
                        size="sm"
                        class="h-8 rounded-[6px] px-3 text-[12px] font-semibold"
                        @click="retryFailed(b.id)"
                      >
                        <RefreshCw class="h-3.5 w-3.5" />
                        重试
                      </Button>
                      <Button
                        v-if="canRerunBatchScreening(b)"
                        variant="outline"
                        size="sm"
                        class="h-8 rounded-[6px] px-3 text-[12px] font-semibold text-primary hover:text-primary"
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
                        class="h-8 rounded-[6px] px-3 text-[12px] font-semibold"
                        @click="cancelBatch(b.id)"
                      >
                        <X class="h-3.5 w-3.5" />
                        取消
                      </Button>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button
                          variant="outline"
                          size="icon"
                          class="h-8 w-8 rounded-[6px] text-muted-foreground"
                        >
                          <MoreHorizontal class="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-36">
                        <DropdownMenuItem
                          :disabled="
                            b.status === 'processing' || b.status === 'queued'
                          "
                          @click="openBatchThresholdDialog(b)"
                        >
                          <SlidersHorizontal class="mr-2 h-3.5 w-3.5" />
                          阈值
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          v-if="b.status !== 'processing'"
                          class="text-destructive focus:text-destructive"
                          @click="removeBatch(b.id)"
                        >
                          <Trash2 class="mr-2 h-3.5 w-3.5" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div
                    class="rounded-[6px] bg-muted/50 px-3 py-3 dark:bg-white/6"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="text-[12px] font-semibold text-foreground">
                        文件进度
                      </p>
                      <p
                        class="text-[12px] font-semibold tabular-nums text-[#0062FF]"
                      >
                        {{ batchProgressValue(b) }}%
                      </p>
                    </div>
                    <Progress
                      :model-value="batchProgressValue(b)"
                      class="mt-3 h-2"
                    />
                    <div
                      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground"
                    >
                      <span>{{ batchProgressCountText(b) }}</span>
                      <span
                        >{{ batchSecondaryMetricLabel() }}
                        {{ batchSecondaryMetricCount(b) }}</span
                      >
                      <span
                        >{{ batchTertiaryMetricLabel(b) }}
                        {{ batchTertiaryMetricCount(b) }}</span
                      >
                    </div>
                    <p
                      v-if="showBatchStatusText(b)"
                      class="mt-3 text-[12px] text-muted-foreground"
                    >
                      AI 状态：{{ batchStatusText(b) }}
                    </p>
                  </div>
                </div>
              </div>

              <div
                v-if="expandedBatches.has(b.id)"
                class="border-t border-border/50 bg-muted/30 px-4 py-4 dark:border-white/8 dark:bg-white/4"
              >
                <div class="mb-4 space-y-4 rounded-[6px]">
                  <div
                    class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
                  >
                    <div class="min-w-0 space-y-2">
                      <!-- <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" class="rounded-[6px]">
                      {{ importStageLabel(b.currentStage) }}
                    </Badge>
                  </div> -->
                      <div>
                        <p class="text-[16px] font-semibold text-foreground">
                          导入批次详情
                        </p>
                        <p
                          class="mt-1 text-[12px] leading-5 text-muted-foreground"
                        >
                          {{ batchExpandedSummary(b) }}
                        </p>
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <Button
                        v-if="b.failedFiles > 0"
                        variant="outline"
                        size="sm"
                        class="h-8 rounded-[6px] text-[12px] font-semibold"
                        @click="retryFailed(b.id)"
                      >
                        <RefreshCw class="h-3.5 w-3.5" />
                        重试失败
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-8 rounded-[6px] text-[12px] font-semibold text-primary hover:text-primary"
                        :disabled="exportableBatchCount === 0"
                        @click="exportDialogOpen = true"
                      >
                        <Upload class="h-3.5 w-3.5" />
                        导出报告
                      </Button>
                    </div>
                  </div>
                  <div
                    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-muted-foreground"
                  >
                    <span class="font-medium text-foreground">
                      文件 {{ b.totalFiles }}
                    </span>
                    <span class="text-border">/</span>
                    <span class="font-medium text-primary">
                      已分析 {{ batchSecondaryMetricCount(b) }}
                    </span>
                    <span class="text-border">/</span>
                    <span
                      class="font-medium text-slate-500 dark:text-slate-400"
                    >
                      待处理 {{ batchTertiaryMetricCount(b) }}
                    </span>
                    <span class="text-border">/</span>
                    <span class="font-medium text-rose-700 dark:text-rose-300">
                      失败 {{ b.failedFiles }}
                    </span>
                  </div>
                </div>
                <div v-if="loadingFiles[b.id]" class="space-y-2">
                  <Skeleton
                    class="h-16 w-full rounded-xl"
                    v-for="i in 3"
                    :key="i"
                  />
                </div>
                <div
                  v-else-if="!batchFiles[b.id]?.length"
                  class="rounded-[6px] bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground dark:bg-white/4"
                >
                  暂无文件明细
                </div>
                <div
                  v-else
                  class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3 3xl:grid-cols-4"
                >
                  <article
                    v-for="f in sortedBatchFiles(b.id)"
                    :key="f.id"
                    class="group relative flex h-[220px] cursor-pointer flex-col overflow-hidden rounded-[6px] border border-border/40 bg-background/80 p-4 transition-colors hover:bg-muted/35 dark:border-white/8 dark:bg-white/3 dark:hover:bg-white/6"
                    @click="
                      parseImportTaskResult(f.resultJson)?.parsedResume &&
                      showScreeningDetail(f)
                    "
                  >
                    <div class="flex min-h-0 flex-1 flex-col">
                      <div class="min-w-0 space-y-3 pr-[112px]">
                        <div class="flex flex-wrap items-center gap-2">
                          <span
                            v-if="screeningInlineStatus(f)"
                            :class="[
                              'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              screeningInlineStatusClass(f),
                            ]"
                          >
                            {{ screeningInlineStatus(f) }}
                          </span>
                          <span
                            v-if="showInlineStage(f)"
                            class="text-xs text-muted-foreground"
                            >{{ importStageLabel(f.stage) }}</span
                          >
                        </div>

                        <div class="min-w-0">
                          <h4
                            class="truncate text-[15px] font-semibold text-foreground"
                          >
                            {{ fileNameOf(f.originalPath) }}
                          </h4>
                          <p
                            class="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground"
                          >
                            {{ fileOverviewText(f) }}
                          </p>
                        </div>

                        <p class="line-clamp-4 text-[13px] leading-6 text-muted-foreground">
                          {{ fileDecisionSummary(f) }}
                        </p>
                      </div>

                      <div
                        class="pointer-events-none absolute inset-y-0 right-0 z-0 w-[240px] bg-gradient-to-l from-background via-background/95 to-transparent dark:from-[#5B657B]/90 dark:via-[#5B657B]/55 dark:to-transparent"
                      />
                      <div
                        class="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2"
                      >
                        <div
                          v-if="screeningResult(f)?.screeningConclusion"
                          :class="[
                            'pointer-events-none flex h-[88px] w-[88px] shrink-0 -rotate-[10deg] select-none flex-col items-center justify-center rounded-full border-[3px] bg-background/72 text-center font-semibold shadow-none transition-opacity duration-150 group-hover:opacity-0',
                            screeningScoreStampClass(
                              screeningRecommendationVerdict(f),
                            ),
                          ]"
                        >
                          <span
                            class="absolute inset-2 rounded-full border border-current opacity-18"
                          />
                          <span
                            class="absolute inset-4 rounded-full border border-dashed border-current opacity-28"
                          />
                          <span
                            class="relative z-10 text-[12px] leading-none tracking-[0.06em]"
                          >
                            {{
                              screeningScoreStampLabel(
                                screeningRecommendationVerdict(f),
                              )
                            }}
                          </span>
                          <span
                            class="relative z-10 mt-1.5 text-[10px] font-medium leading-none tracking-[0.02em] opacity-80"
                          >
                            {{ screeningScoreMiniLabel(f) }}
                          </span>
                        </div>
                      </div>

                      <div
                        class="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                      >
                        <button
                          v-if="
                            parseImportTaskResult(f.resultJson)?.parsedResume
                          "
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
                          class="pointer-events-auto inline-flex h-8 items-center justify-center px-0 text-xs font-semibold text-destructive hover:text-destructive/80 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                          @click.stop="
                            screeningResult(f)?.screeningStatus === 'running' ||
                            screeningResult(f)?.screeningStatus === 'queued'
                              ? null
                              : requestRunFileScreening(f.id, f.batchId)
                          "
                        >
                          {{
                            screeningResult(f)?.screeningStatus === "running"
                              ? "分析中"
                              : screeningResult(f)?.screeningStatus === "queued"
                                ? "等待中"
                                : "重新分析"
                          }}
                        </button>
                        <button
                          v-if="
                            parseImportTaskResult(f.resultJson)?.parsedResume
                          "
                          class="pointer-events-auto inline-flex h-8 items-center justify-center px-0 text-xs font-semibold text-primary hover:text-primary/80 cursor-pointer"
                          @click.stop="showScreeningDetail(f)"
                        >
                          查看详情
                        </button>
                      </div>
                    </div>

                    <p
                      v-if="screeningResult(f)?.screeningError"
                      :class="
                        screeningResult(f)?.screeningStatus === 'failed'
                          ? 'mt-3 rounded-[6px] bg-red-50 px-3 py-2 text-xs text-destructive'
                          : 'mt-3 rounded-[6px] bg-amber-50 px-3 py-2 text-xs text-amber-600'
                      "
                    >
                      {{
                        screeningResult(f)?.screeningStatus === "failed"
                          ? "AI 初筛失败，未生成规则回退结论："
                          : "AI 初筛提示："
                      }}{{ screeningResult(f)?.screeningError }}
                    </p>

                    <p
                      v-if="f.errorMessage"
                      class="mt-3 rounded-[6px] bg-red-50 px-3 py-2 text-xs text-destructive break-all"
                    >
                      {{ f.errorMessage }}
                    </p>
                  </article>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Collapsible
          v-slot="{ open }"
          :default-open="false"
          class="rounded-[6px] border-0 bg-card dark:bg-card/82"
        >
          <div
            class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">历史面试导入</p>
              <p class="text-xs text-muted-foreground">
                从候选人页发起的面试导入会汇总在这里。
              </p>
            </div>
            <CollapsibleTrigger
              class="group inline-flex items-center gap-2 self-start rounded-[6px] border-0 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted sm:self-auto dark:bg-white/8 dark:hover:bg-white/14"
            >
              <span>{{ interviewBatches.length }} 个批次</span>
              <span v-if="interviewActiveBatchCount > 0"
                >· {{ interviewActiveBatchCount }} 个处理中</span
              >
              <ChevronDown
                :class="[
                  'h-3.5 w-3.5 transition-transform',
                  open ? 'rotate-180' : '',
                ]"
              />
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            <div class="space-y-4 bg-card p-4 dark:bg-transparent">
              <Card
                v-if="!interviewBatches.length"
                class="rounded-[6px] border-0 bg-muted px-4 py-8 text-center text-sm text-muted-foreground dark:bg-white/8"
              >
                暂无历史记录，请从候选人页发起导入。
              </Card>

              <template v-else>
                <Card
                  v-for="b in interviewBatches"
                  :key="b.id"
                  class="overflow-hidden border-0 bg-background shadow-none dark:bg-white/6"
                >
                  <div class="space-y-4 p-5">
                    <div
                      class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                    >
                      <div class="min-w-0 flex-1 space-y-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <Badge :variant="statusVariant(b.status)">{{
                            interviewBatchStatusLabel(b)
                          }}</Badge>
                          <Badge variant="outline">{{
                            interviewImportSourceTypeLabel(b.sourceType)
                          }}</Badge>
                          <span
                            class="text-sm font-medium text-foreground/90"
                            >{{ formatImportBatchDisplayName(b) }}</span
                          >
                          <span class="text-xs text-muted-foreground">{{
                            formatImportTimestamp(b.createdAt)
                          }}</span>
                        </div>

                        <p class="text-sm text-muted-foreground">
                          {{ interviewBatchStatusDescription(b) }}
                        </p>

                        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div
                            v-for="item in interviewBatchOverviewItems(b)"
                            :key="`${b.id}-${item.label}`"
                            class="rounded-[6px] border-0 bg-muted px-3 py-2.5 dark:bg-white/8"
                          >
                            <p
                              class="text-[12px] font-medium text-muted-foreground"
                            >
                              {{ item.label }}
                            </p>
                            <p
                              class="mt-0.5 text-sm font-semibold text-foreground"
                            >
                              {{ item.value }}
                            </p>
                            <p class="mt-0.5 truncate text-[12px] text-muted-foreground">
                              {{ item.hint }}
                            </p>
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
                          {{
                            expandedBatches.has(b.id) ? "收起详情" : "查看详情"
                          }}
                        </Button>
                        <Button
                          v-if="
                            b.status === 'processing' || b.status === 'queued'
                          "
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
                      v-if="b.summary?.errors?.length"
                      class="rounded-[6px] border-0 bg-amber-50/80 p-4 dark:bg-amber-950/30"
                    >
                      <p
                        class="text-sm font-medium text-amber-900 dark:text-amber-200"
                      >
                        处理提示
                      </p>
                      <ul
                        class="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300"
                      >
                        <li
                          v-for="item in b.summary.errors"
                          :key="`${b.id}-${item}`"
                        >
                          • {{ item }}
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div
                    v-if="expandedBatches.has(b.id)"
                    class="bg-muted px-5 py-4 dark:bg-white/6"
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
                      class="rounded-[6px] border-0 bg-muted px-4 py-6 text-center text-sm text-muted-foreground dark:bg-white/8"
                    >
                      暂无任务明细
                    </div>

                    <div v-else class="space-y-3">
                      <article
                        v-for="task in interviewBatchFilesInDisplayOrder(b.id)"
                        :key="task.id"
                        class="rounded-[6px] border-0 bg-background px-4 py-4 shadow-none dark:bg-white/6"
                      >
                        <div
                          class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"
                        >
                          <div class="min-w-0 flex-1 space-y-2">
                            <div class="flex flex-wrap items-center gap-2">
                              <Badge :variant="statusVariant(task.status)">{{
                                interviewTaskStatusLabel(task)
                              }}</Badge>
                              <span
                                class="truncate text-sm font-medium text-foreground"
                                >{{ fileNameOf(task.originalPath) }}</span
                              >
                            </div>
                            <p class="text-sm text-muted-foreground">
                              {{ interviewTaskStatusDescription(task) }}
                            </p>

                            <div
                              class="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
                            >
                              <div
                                v-for="item in interviewTaskOverviewItems(task)"
                                :key="`${task.id}-${item.label}`"
                                class="rounded-[6px] border-0 bg-muted p-3 dark:bg-white/8"
                              >
                                <p
                                  class="text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                                >
                                  {{ item.label }}
                                </p>
                                <p
                                  class="mt-1 text-sm font-semibold text-foreground"
                                >
                                  {{ item.value }}
                                </p>
                                <p class="mt-1 text-xs text-muted-foreground">
                                  {{ item.hint }}
                                </p>
                              </div>
                            </div>

                            <p
                              v-if="task.errorMessage"
                              class="text-xs text-destructive break-all"
                            >
                              {{ task.errorMessage }}
                            </p>
                          </div>

                          <div class="shrink-0 text-xs text-muted-foreground">
                            当前阶段：{{
                              interviewImportStageLabel(
                                task.stage ?? task.status,
                              )
                            }}
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

        <ExportScreeningDialog
          v-model:open="exportDialogOpen"
          :batches="resumeBatches"
        />
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
      content-class="sm:max-w-lg max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-background p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
      @update:open="handleModelSelectionDialogOpenChange"
    >
      <template #content>
        <AppDialogLayout>
          <template #header>
            <DialogHeader>
              <DialogTitle>选择模型</DialogTitle>
              <DialogDescription>
                AI 初筛需要先选择一个模型，选择后会自动继续当前导入。
              </DialogDescription>
            </DialogHeader>
          </template>

          <div
            v-if="availableModelProviders.length === 0"
            class="rounded-[6px] bg-white px-4 py-6 text-sm text-muted-foreground dark:bg-white/7 dark:text-slate-300"
          >
            当前没有可用模型，请先检查厂商 API Key
            是否可用，或到设置页完善端点配置。
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="provider in availableModelProviders"
              :key="provider.id"
              class="space-y-2 rounded-[6px] bg-white p-3 dark:bg-white/7"
            >
              <p class="text-xs font-medium text-muted-foreground">
                {{ provider.name }}
              </p>
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

          <template #footer>
            <Button
              variant="secondary"
              @click="modelSelectionDialogOpen = false"
            >
              取消
            </Button>
          </template>
        </AppDialogLayout>
      </template>
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
    <Dialog
      v-model:open="thresholdDialogOpen"
      content-class="max-w-4xl max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-background p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
    >
      <template #content>
        <AppDialogLayout body-class="grid gap-4 md:grid-cols-[1fr,0.85fr]">
          <template #header>
            <DialogHeader>
              <DialogTitle>阈值调整与模板重跑</DialogTitle>
              <DialogDescription>
                {{
                  thresholdDialogBatch
                    ? `当前批次：${formatImportBatchDisplayName(thresholdDialogBatch)}`
                    : "调整当前批次的通过 / 待定 / 淘汰推荐规则"
                }}
              </DialogDescription>
            </DialogHeader>
          </template>

          <section
            class="space-y-4 rounded-[6px] bg-background p-4 shadow-none dark:bg-white/7"
          >
            <div>
              <p
                class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100"
              >
                推荐阈值
              </p>
              <p
                class="mt-1 text-[12px] leading-5 text-[#4B5563] dark:text-slate-300"
              >
                设置通过、待定和淘汰分段，保存后只影响本批次后续展示和重跑判断。
              </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-2">
                <Label
                  for="batch-pass-threshold"
                  class="text-[12px] font-semibold text-[#4B5563] dark:text-slate-300"
                  >通过阈值</Label
                >
                <Input
                  id="batch-pass-threshold"
                  v-model="thresholdPassInput"
                  class="h-[34px] rounded-[6px] border-0 bg-background shadow-none dark:bg-white/8"
                  inputmode="numeric"
                  placeholder="例如 80"
                />
              </div>
              <div class="space-y-2">
                <Label
                  for="batch-review-threshold"
                  class="text-[12px] font-semibold text-[#4B5563] dark:text-slate-300"
                  >待定阈值</Label
                >
                <Input
                  id="batch-review-threshold"
                  v-model="thresholdReviewInput"
                  class="h-[34px] rounded-[6px] border-0 bg-background shadow-none dark:bg-white/8"
                  inputmode="numeric"
                  placeholder="例如 70"
                />
              </div>
            </div>

            <div
              class="flex items-center justify-between gap-4 rounded-[6px] border-0 bg-[#F9FAFB] px-4 py-3 dark:bg-white/6"
            >
              <div>
                <p
                  class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100"
                >
                  本地学习反馈
                </p>
                <p
                  class="mt-1 text-xs leading-5 text-[#4B5563] dark:text-slate-300"
                >
                  后续同分组/同模板初筛会参考本地人工改分样本。
                </p>
              </div>
              <Switch
                :model-value="thresholdLearningEnabled"
                @update:model-value="thresholdLearningEnabled = Boolean($event)"
              />
            </div>
          </section>

          <section
            class="space-y-4 rounded-[6px] bg-background p-4 shadow-none dark:bg-white/7"
          >
            <div
              class="rounded-[6px] bg-[#EEF4FF] px-4 py-3 text-sm dark:bg-white/10"
            >
              <p class="font-semibold text-[#1A1A1A] dark:text-slate-100">
                分段预览
              </p>
              <p
                v-if="thresholdPreviewText"
                class="mt-1 leading-5 text-[#4B5563] dark:text-slate-300"
              >
                {{ thresholdPreviewText }}
              </p>
              <p
                v-else
                class="mt-1 leading-5 text-[#4B5563] dark:text-slate-300"
              >
                请输入两个整数阈值后查看预览
              </p>
            </div>

            <div
              class="rounded-[6px] border-0 bg-[#F9FAFB] px-4 py-3 text-sm dark:bg-white/6"
            >
              <div>
                <p class="font-semibold text-[#1A1A1A] dark:text-slate-100">
                  清空本批次改分记录
                </p>
                <p
                  class="mt-1 text-xs leading-5 text-[#4B5563] dark:text-slate-300"
                >
                  移除本批次所有人工改分覆盖层，不改动原始 AI 结果。
                </p>
              </div>
              <Button
                class="mt-3 h-8 rounded-[6px] text-[12px] font-semibold"
                variant="outline"
                :disabled="thresholdSaving"
                @click="clearBatchFeedbacks"
              >
                清空记录
              </Button>
            </div>
          </section>

          <p
            v-if="thresholdValidationMessage"
            class="text-sm text-destructive md:col-span-2"
          >
            {{ thresholdValidationMessage }}
          </p>

          <template #footer>
            <Button
              class="h-9 rounded-[6px] text-[13px] font-semibold"
              variant="secondary"
              :disabled="thresholdSaving"
              @click="thresholdDialogOpen = false"
            >
              取消
            </Button>
            <Button
              class="h-9 rounded-[6px] bg-[#0062FF] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[#0057E5]"
              :disabled="Boolean(thresholdValidationMessage) || thresholdSaving"
              @click="saveBatchThresholdConfig"
            >
              {{ thresholdSaving ? "保存中..." : "保存阈值" }}
            </Button>
          </template>
        </AppDialogLayout>
      </template>
    </Dialog>
    <Dialog
      v-model:open="templateDialogOpen"
      content-class="max-w-4xl max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-background p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
    >
      <template #content>
        <AppDialogLayout body-class="grid gap-4 md:grid-cols-[0.85fr,1.15fr]">
          <template #header>
            <DialogHeader>
              <DialogTitle>选择筛选分组与模板</DialogTitle>
              <DialogDescription>
                选择本次重跑使用的筛选分组和模板
              </DialogDescription>
            </DialogHeader>
          </template>

          <section
            class="space-y-4 rounded-[6px] bg-background p-4 shadow-none dark:bg-white/7"
          >
            <div>
              <p
                class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100"
              >
                筛选分组
              </p>
              <p
                class="mt-1 text-[12px] leading-5 text-[#4B5563] dark:text-slate-300"
              >
                切换分组后，右侧模板列表会同步更新。
              </p>
            </div>
            <Select
              v-if="screeningTemplates.groups.value.length > 0"
              :model-value="dialogSelectedGroupId"
              @update:model-value="onDialogGroupChange(String($event))"
            >
              <SelectTrigger
                class="h-[34px] w-full min-w-0 justify-between rounded-[6px] border-0 bg-background text-sm shadow-none dark:bg-white/8"
              >
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
                    <Badge
                      variant="secondary"
                      class="shrink-0 rounded-[6px] px-1.5 py-0 text-[10px]"
                      >{{ group.templateCount }} 模板</Badge
                    >
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <div
              v-if="screeningTemplates.selectedGroupBatchScreeningConfig.value"
              class="rounded-[6px] bg-[#EEF4FF] px-3 py-3 text-xs leading-5 text-[#4B5563] dark:bg-white/10 dark:text-slate-300"
            >
              <p class="font-semibold text-[#1A1A1A] dark:text-slate-100">
                分组阈值
              </p>
              <p class="mt-1">
                通过 ≥
                {{
                  screeningTemplates.selectedGroupBatchScreeningConfig.value
                    .passThreshold
                }}，待定 ≥
                {{
                  screeningTemplates.selectedGroupBatchScreeningConfig.value
                    .reviewThreshold
                }}。
              </p>
            </div>
          </section>

          <section
            class="space-y-3 rounded-[6px] bg-background p-4 shadow-none dark:bg-white/7"
          >
            <div>
              <p
                class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100"
              >
                模板列表
              </p>
              <p
                class="mt-1 text-[12px] leading-5 text-[#4B5563] dark:text-slate-300"
              >
                选择一个模板后开始重跑当前批次或单个文件。
              </p>
            </div>
            <div class="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              <template v-if="screeningTemplates.templates.value.length > 0">
                <button
                  v-for="template in screeningTemplates.templates.value"
                  :key="template.id"
                  :ref="(el) => setTemplateOptionRef(template.id, el)"
                  type="button"
                  class="flex w-full items-center justify-between rounded-[6px] px-3 py-3 text-left transition-colors"
                  :class="
                    dialogSelectedTemplateId === template.id
                      ? 'border-0 bg-primary/10 dark:bg-white/14'
                      : 'border-0 bg-background hover:bg-muted dark:bg-white/6 dark:hover:bg-white/10'
                  "
                  @click="dialogSelectedTemplateId = template.id"
                >
                  <span class="min-w-0">
                    <span
                      class="block truncate text-sm font-semibold text-[#1A1A1A] dark:text-slate-100"
                      >{{ template.name }}</span
                    >
                    <span
                      class="mt-1 block text-xs text-[#4B5563] dark:text-slate-300"
                      >用于本次 AI 初筛重跑</span
                    >
                  </span>
                  <span class="ml-3 flex shrink-0 items-center gap-2">
                    <Badge
                      v-if="template.isDefault"
                      variant="secondary"
                      class="rounded-[6px] text-xs"
                      >默认</Badge
                    >
                    <Check
                      v-if="dialogSelectedTemplateId === template.id"
                      class="h-4 w-4 text-[#0062FF]"
                    />
                  </span>
                </button>
              </template>
              <div
                v-else
                class="rounded-[6px] border-0 bg-[#F9FAFB] px-4 py-6 text-center text-sm text-[#4B5563] dark:bg-white/6 dark:text-slate-300"
              >
                暂无可用筛选模板，请先到模板管理中创建或恢复默认模板。
              </div>
            </div>
          </section>

          <template #footer>
            <Button
              class="h-9 rounded-[6px] text-[13px] font-semibold"
              variant="secondary"
              @click="templateDialogOpen = false"
            >
              取消
            </Button>
            <Button
              class="h-9 rounded-[6px] bg-[#0062FF] px-4 text-[13px] font-semibold text-white shadow-none hover:bg-[#0057E5]"
              :disabled="!dialogSelectedGroupId || !dialogSelectedTemplateId"
              @click="executeTemplateRerun"
            >
              开始筛选
            </Button>
          </template>
        </AppDialogLayout>
      </template>
    </Dialog>
  </AppPageShell>
</template>

<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  Upload,
  Download,
  Plus,
  Check,
  ChevronDown,
  MoreHorizontal,
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
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import GatewayEndpointDialog from "@/components/lui/gateway-endpoint-dialog.vue";
import { useImportBatches } from "@/composables/import/use-import-batches";
import { useScreeningTemplates } from "@/composables/import/use-screening-templates";
import { useImportFileSelection } from "@/composables/import/use-import-file-selection";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import {
  extractImportOriginalFileName,
  formatImportBatchDisplayName,
  formatImportTimestamp,
  importStageLabel,
  parseImportTaskResult,
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
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  AppDialogLayout,
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/api/client";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import {
  PRESET_PROVIDER_BASE_URLS,
  type GatewayEndpoint,
} from "@/lib/ai-gateway-config";
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
import type {
  BatchScreeningConfig,
  ImportBatchListItem,
  ImportFileTask,
} from "@ims/shared";

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
const {
  autoScreen,
  userManuallyDisabled,
  setAutoScreenManual,
  setAutoScreenSystem,
} = useImportPreferences();
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

const thresholdDialogBatch = computed(() =>
  thresholdDialogBatchId.value
    ? (batchById.value.get(thresholdDialogBatchId.value) ?? null)
    : null,
);

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

function normalizeImportBatch(
  batch: (typeof batches.value)[number],
): ImportBatchView {
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
    batchScreeningConfig: normalizeBatchScreeningConfig(
      batch?.batchScreeningConfig ?? {
        groupId: batch?.groupId ?? null,
        passThreshold: 80,
        reviewThreshold: 70,
        learningEnabled: false,
      },
    ),
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
const resumeBatches = computed(() =>
  safeBatches.value.filter(
    (batch) => !isInterviewImportSourceType(batch.sourceType),
  ),
);
const interviewBatches = computed(() =>
  safeBatches.value.filter((batch) =>
    isInterviewImportSourceType(batch.sourceType),
  ),
);
const batchById = computed(
  () => new Map(safeBatches.value.map((batch) => [batch.id, batch])),
);
const hasActiveResumeImports = computed(() =>
  resumeBatches.value.some(
    (batch) => batch.status === "processing" || batch.status === "queued",
  ),
);
const resumeActiveBatchCount = computed(
  () =>
    resumeBatches.value.filter(
      (batch) => batch.status === "processing" || batch.status === "queued",
    ).length,
);
const interviewActiveBatchCount = computed(
  () =>
    interviewBatches.value.filter(
      (batch) => batch.status === "processing" || batch.status === "queued",
    ).length,
);
const exportableBatchCount = computed(
  () =>
    resumeBatches.value.filter(
      (batch) =>
        batch.status === "completed" || batch.status === "partial_success",
    ).length,
);

function batchScreeningConfigOf(
  batchId: string | null | undefined,
): BatchScreeningConfig {
  if (!batchId) {
    return normalizeBatchScreeningConfig(null);
  }

  return normalizeBatchScreeningConfig(
    batchById.value.get(batchId)?.batchScreeningConfig ?? null,
  );
}

function screeningRecommendationOf(file: ImportFileTask) {
  const conclusion = screeningResult(file)?.screeningConclusion;
  if (!conclusion) {
    return null;
  }

  return (
    conclusion.derivedRecommendation ??
    deriveScreeningRecommendation(
      getEffectiveScreeningScore(conclusion),
      batchScreeningConfigOf(file.batchId),
    )
  );
}

function screeningDisplayScore(file: ImportFileTask) {
  return (
    getEffectiveScreeningScore(
      screeningResult(file)?.screeningConclusion ?? null,
    ) ?? 0
  );
}

function screeningRecommendationVerdict(file: ImportFileTask) {
  return (
    screeningRecommendationOf(file)?.verdict ??
    screeningResult(file)?.screeningConclusion?.derivedRecommendation
      ?.verdict ??
    screeningResult(file)?.screeningConclusion?.verdict
  );
}

function batchThresholdSummary(batch: ImportBatchView) {
  return formatScreeningThresholdSummary(batch.batchScreeningConfig);
}

function batchFilesInDisplayOrder(batchId: string) {
  return sortedBatchFiles(batchId);
}

function batchVerdictCount(
  batch: ImportBatchView,
  verdict: "pass" | "review" | "reject",
) {
  return batchFilesInDisplayOrder(batch.id).filter(
    (file) => screeningRecommendationVerdict(file) === verdict,
  ).length;
}

function batchPendingOrRunningCount(batch: ImportBatchView) {
  return batchFilesInDisplayOrder(batch.id).filter((file) => {
    const status = screeningResult(file)?.screeningStatus;
    return (
      status === "queued" ||
      status === "running" ||
      status === null ||
      status === undefined
    );
  }).length;
}

function batchExpandedSummary(batch: ImportBatchView) {
  return `${batchStatusText(batch)} · ${batchVerdictCount(batch, "pass")} 通过，${batchVerdictCount(batch, "review")} 待复核，${batchVerdictCount(batch, "reject")} 淘汰`;
}

const analysisTotalFiles = computed(() =>
  resumeBatches.value.reduce(
    (sum, batch) => sum + batchAnalysisTotalFiles(batch),
    0,
  ),
);
const analysisCompletedFiles = computed(() =>
  resumeBatches.value.reduce(
    (sum, batch) => sum + batchAnalysisCompletedFiles(batch),
    0,
  ),
);
const analysisPendingFiles = computed(() =>
  resumeBatches.value.reduce(
    (sum, batch) => sum + batchAnalysisPendingFiles(batch),
    0,
  ),
);
const analysisRunningFiles = computed(() =>
  resumeBatches.value.reduce(
    (sum, batch) => sum + batchAnalysisRunningFiles(batch),
    0,
  ),
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

const hasAvailableModels = computed(
  () => availableModelProviders.value.length > 0,
);

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
    {
      id: "openai",
      name: "OpenAI",
      icon: "OpenAI",
      baseURL: PRESET_PROVIDER_BASE_URLS.openai ?? "",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      icon: "Anthropic",
      baseURL: PRESET_PROVIDER_BASE_URLS.anthropic ?? "",
    },
    {
      id: "minimax",
      name: "MiniMax",
      icon: "MiniMax",
      baseURL: PRESET_PROVIDER_BASE_URLS.minimax ?? "",
    },
    {
      id: "moonshot",
      name: "Moonshot",
      icon: "Moonshot",
      baseURL: PRESET_PROVIDER_BASE_URLS.moonshot ?? "",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      icon: "DeepSeek",
      baseURL: PRESET_PROVIDER_BASE_URLS.deepseek ?? "",
    },
    {
      id: "gemini",
      name: "Gemini",
      icon: "Gemini",
      baseURL: PRESET_PROVIDER_BASE_URLS.gemini ?? "",
    },
    {
      id: "siliconflow",
      name: "SiliconFlow",
      icon: "SiliconFlow",
      baseURL: PRESET_PROVIDER_BASE_URLS.siliconflow ?? "",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      icon: "OpenRouter",
      baseURL: PRESET_PROVIDER_BASE_URLS.openrouter ?? "",
    },
    {
      id: "grok",
      name: "Grok",
      icon: "Grok",
      baseURL: PRESET_PROVIDER_BASE_URLS.grok ?? "",
    },
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

async function saveGatewaySetupFromDialog(payload: {
  providerId: string;
  apiKey: string;
  modelId: string;
}) {
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

function buildGatewayEndpointFromDialogPayload(payload: {
  providerId: string;
  apiKey: string;
  modelId: string;
}): GatewayEndpoint | null {
  const provider = presetProviders.value.find(
    (item) => item.id === payload.providerId,
  );
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
    ? gatewayModelOptions.value.find(
        (item) => item.id === modelId && item.providerId === payload.providerId,
      )
    : null;

  return {
    id: provider.id,
    name: provider.name,
    provider: provider.id,
    baseURL: provider.baseURL,
    providerId: provider.id,
    apiKey,
    ...(modelId ? { modelId } : {}),
    ...(selectedModelOption?.label
      ? { modelDisplayName: selectedModelOption.label }
      : {}),
  };
}

async function testGatewaySetupFromDialog(payload: {
  providerId: string;
  apiKey: string;
  modelId: string;
}) {
  const endpoint = buildGatewayEndpointFromDialogPayload(payload);
  if (!endpoint) {
    return;
  }

  isTestingGatewaySetup.value = true;
  try {
    const result = await luiStore.testCustomEndpoint(endpoint);
    if (result.modelCount > 0) {
      notifySuccess(
        `连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`,
      );
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
  await Promise.all([luiStore.loadModels(), loadPresetProviders()]);

  if (luiStore.customEndpoints.length === 0) {
    openGatewaySetupDialog();
    notifyError(
      reportAppError(
        "import/provider-required",
        new Error("请先配置模型厂商"),
        {
          title: "无法开始导入",
          fallbackMessage: "已开启 AI 初筛，请先配置模型厂商",
        },
      ),
    );
    return false;
  }

  if (!hasAvailableModels.value) {
    openGatewaySetupDialog();
    notifyError(
      reportAppError(
        "import/model-unavailable",
        new Error("未检测到可用模型"),
        {
          title: "无法开启 AI 初筛",
          fallbackMessage: "请先在端点配置里完成模型检测并确认可用",
        },
      ),
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
  const templateId = autoScreen.value
    ? screeningTemplates.selectedId.value || undefined
    : undefined;
  void fileImport.triggerImport({
    autoScreen: autoScreen.value,
    groupId,
    templateId,
  });
}

onMounted(() => {
  void importBatches.initialize();
  void Promise.all([luiStore.loadModels(), loadPresetProviders()]).then(() => {
    syncAutoScreenAvailability();
  });
});

watch(
  [() => luiStore.customEndpoints.length, hasAvailableModels, hasSelectedModel],
  () => {
    syncAutoScreenAvailability();
  },
);

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
  void ensureAutoScreeningReady()
    .then((ready) => {
      if (ready) {
        proceedImport();
      }
    })
    .catch((error) => {
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

function screeningCandidateOverviewValue(file: ImportFileTask, label: string) {
  return (
    screeningCandidateOverviewItems(file).find((item) => item.label === label)
      ?.value ?? "—"
  );
}

function fileOverviewText(file: ImportFileTask) {
  const parts = [
    screeningCandidateOverviewValue(file, "目标岗位"),
    screeningCandidateOverviewValue(file, "年限/经验"),
    screeningCandidateOverviewValue(file, "学历/学校"),
  ].filter((value) => value && value !== "—");

  return parts.length > 0 ? parts.join(" · ") : "等待解析候选人基本信息";
}

function fileDecisionSummary(file: ImportFileTask) {
  const conclusion = screeningResult(file)?.screeningConclusion;
  if (!conclusion) {
    if (screeningResult(file)?.screeningStatus === "queued")
      return "已进入 AI 初筛队列，等待生成判断。";
    if (screeningResult(file)?.screeningStatus === "running")
      return "AI 正在分析该简历，完成后会补充结论摘要和建议动作。";
    return "尚未生成 AI 初筛结论，可按需重新分析。";
  }

  return (
    conclusion.summary ??
    conclusion.recommendedAction ??
    "已生成 AI 初筛结论，建议打开详情查看完整依据。"
  );
}

function screeningInlineStatus(file: ImportFileTask) {
  const result = screeningResult(file);

  if (result?.screeningStatus === "queued") {
    return "AI 初筛排队中";
  }

  if (result?.screeningStatus === "running") {
    return "AI 初筛中";
  }

  return "";
}

function screeningInlineStatusClass(file: ImportFileTask) {
  const result = screeningResult(file);

  if (result?.screeningStatus === "queued") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  }

  if (result?.screeningStatus === "running") {
    return "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
  }

  return "";
}

function screeningScoreMiniLabel(file: ImportFileTask) {
  return `匹配 ${screeningDisplayScore(file)}%`;
}

function showInlineStage(file: ImportFileTask) {
  const result = screeningResult(file);
  return (
    result?.screeningStatus === "queued" ||
    result?.screeningStatus === "running"
  );
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
  return [...(batchFiles.value[batchId] ?? [])].sort(
    (left, right) => right.createdAt - left.createdAt,
  );
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

  return (
    screeningTemplates.selectedGroupId.value ??
    screeningTemplates.groups.value[0]?.id ??
    ""
  );
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

function setTemplateOptionRef(
  templateId: string,
  el: Element | ComponentPublicInstance | null,
) {
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
  if (verdict === "reject") return "淘汰";
  if (verdict === "review") return "待定";
  return "通过";
}

function screeningScoreStampClass(verdict?: string | null) {
  if (verdict === "reject") {
    return "border-rose-300 text-rose-600 dark:border-rose-500/60 dark:text-rose-300";
  }

  if (verdict === "review") {
    return "border-amber-300 text-amber-600 dark:border-amber-500/60 dark:text-amber-300";
  }

  if (verdict === "pass") {
    return "border-emerald-300 text-emerald-600 dark:border-emerald-500/60 dark:text-emerald-300";
  }

  return "border-border text-muted-foreground/70";
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
  return batchProgress(
    batchAnalysisCompletedFiles(batch),
    batchAnalysableCount(batch),
  );
}

function batchPrimaryStatusLabel(batch: ImportBatchView) {
  if (batchAnalysisRunningFiles(batch) > 0) {
    return "处理中";
  }

  if (
    batchAnalysisTotalFiles(batch) > 0 &&
    batchAnalysisCompletedFiles(batch) >= batchAnalysisTotalFiles(batch)
  ) {
    return "已收口";
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
  if (
    batchAnalysisRunningFiles(batch) > 0 ||
    (batchAnalysisTotalFiles(batch) > 0 &&
      batchAnalysisCompletedFiles(batch) >= batchAnalysisTotalFiles(batch))
  ) {
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
    return batchProgress(
      batchAnalysisCompletedFiles(batch),
      batchAnalysisTotalFiles(batch),
    );
  }

  if (
    !batch.autoScreen &&
    (batch.status === "completed" || batch.status === "partial_success")
  ) {
    return 0;
  }

  return batchScreeningProgress(batch);
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
  if (
    batchAnalysisTotalFiles(batch) > 0 ||
    batchAnalysisCompletedFiles(batch) > 0
  ) {
    return batchAnalysisCompletedFiles(batch);
  }

  const files = screenableFiles(batch.id);
  if (files.length > 0) {
    return files.filter((file) =>
      isScreeningTerminal(screeningResult(file)?.screeningStatus),
    ).length;
  }

  return 0;
}

function batchPendingAnalysisCount(batch: ImportBatchView) {
  if (
    batchAnalysisTotalFiles(batch) > 0 ||
    batchAnalysisPendingFiles(batch) > 0
  ) {
    return batchAnalysisPendingFiles(batch);
  }

  return Math.max(
    batchAnalysableCount(batch) - batchCompletedAnalysisCount(batch),
    0,
  );
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
    return "等待中 / 分析中";
  }
  if (running > 0) {
    return "分析中";
  }
  return "待分析";
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
      return "";
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
    if (batch.status === "partial_success")
      return `导入已结束，失败 ${batch.failedFiles} 个`;
    if (batch.status === "failed") return "批次导入失败";
    if (batch.status === "cancelled") return "批次已取消";
    return importStageLabel(batch.currentStage);
  }

  if (batch.status === "queued") {
    return "等待开始处理";
  }

  if (batch.status === "processing") {
    return batch.currentStage === "ai_screening"
      ? "AI 初筛处理中"
      : "后台持续处理中";
  }

  if (batch.status === "completed") {
    return "";
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

  const running = files.some(
    (file) => screeningResult(file)?.screeningStatus === "running",
  );
  const queued = files.some(
    (file) => screeningResult(file)?.screeningStatus === "queued",
  );
  if (running) {
    return "AI 初筛进行中";
  }
  if (queued) {
    return "AI 初筛等待中";
  }

  const completed = files.filter((file) =>
    isScreeningTerminal(screeningResult(file)?.screeningStatus),
  ).length;
  if (completed === 0) {
    return "待分析";
  }
  if (completed < files.length) {
    return `已分析 ${completed}/${files.length}`;
  }
  return "";
}

function showBatchAutoScreenBadge(batch: ImportBatchView) {
  return batch.autoScreen && batchAnalysisRunningFiles(batch) <= 0;
}

function showBatchStatusText(batch: ImportBatchView) {
  return batchStatusText(batch).trim().length > 0;
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
  return (
    luiStore.customEndpoints.length > 0 &&
    hasAvailableModels.value &&
    hasSelectedModel.value
  );
}

function onAutoScreenChange(value: boolean | string) {
  const nextValue = Boolean(value);
  if (!nextValue) {
    // 用户手动关闭
    setAutoScreenManual(false);
    return;
  }

  // 用户手动打开
  void ensureAutoScreeningReady()
    .then((ready) => {
      if (ready) {
        setAutoScreenManual(true);
      }
    })
    .catch((error) => {
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
  thresholdReviewInput.value = String(
    batch.batchScreeningConfig.reviewThreshold,
  );
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

  if (
    !window.confirm(
      `确认清空批次「${formatImportBatchDisplayName(batch)}」的所有人工改分记录吗？`,
    )
  ) {
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
const selectedBatchScreeningConfig = computed(() =>
  batchScreeningConfigOf(selectedFile.value?.batchId),
);

const currentScreeningFiles = computed(() => {
  const currentBatchId = selectedFile.value?.batchId;
  if (!currentBatchId) return [] as ImportFileTask[];

  return safeBatches.value.reduce<ImportFileTask[]>((files, batch) => {
    if (!expandedBatches.value.has(batch.id)) {
      return files;
    }

    const screenableBatchFiles = sortedBatchFiles(batch.id).filter((file) =>
      Boolean(parseImportTaskResult(file.resultJson)?.parsedResume),
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
  const target =
    direction < 0 ? previousScreeningFile.value : nextScreeningFile.value;
  if (!target) return;
  showScreeningDetail(target);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function refreshSelectedScreeningFile(taskId: string, batchId: string) {
  await importBatches.refresh();
  const nextFile =
    batchFiles.value[batchId]?.find((file) => file.id === taskId) ?? null;
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
  const targetBatchId =
    selectedFile.value?.batchId ??
    Object.entries(batchFiles.value).find(([, files]) =>
      files.some((file) => file.id === taskId),
    )?.[0];

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

async function handleOverrideScreeningScore(payload: {
  taskId: string;
  score: number;
  reason?: string | null;
}) {
  const batchId =
    selectedFile.value?.batchId ??
    Object.entries(batchFiles.value).find(([, files]) =>
      files.some((file) => file.id === payload.taskId),
    )?.[0];
  if (!batchId || scoreActionPending.value) {
    return;
  }

  scoreActionPending.value = true;
  try {
    await updateTaskScreeningScore(
      payload.taskId,
      batchId,
      payload.score,
      payload.reason ?? null,
    );
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
  const batchId =
    selectedFile.value?.batchId ??
    Object.entries(batchFiles.value).find(([, files]) =>
      files.some((file) => file.id === taskId),
    )?.[0];
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

async function executeBatchRerun(
  batchId: string,
  groupId?: string,
  templateId?: string,
) {
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
    await importBatches.rerunFileScreening(
      target.id,
      target.batchId!,
      groupId,
      tid,
    );
    await waitForFileScreeningResult(target.id, target.batchId!);
  }
}
</script>
