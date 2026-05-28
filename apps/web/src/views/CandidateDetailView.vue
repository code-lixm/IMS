<template>
  <AppPageShell :class="imsDesign.shell">
    <ImsPageBackground />

    <AppPageHeader content-class="relative z-[1] flex h-16 items-center gap-3 px-16">
        <RouterLink to="/candidates">
          <Button variant="ghost" size="sm" class="h-9 gap-1.5 rounded-[6px] bg-[#F9FAFB] px-3 text-[#1A1A1A] hover:bg-[#EEF4FF] dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14">
            <ArrowLeft class="h-4 w-4" />
            返回
          </Button>
        </RouterLink>
        <AppBrandIcon
          container-class="h-8 w-8 rounded-[6px] bg-[#EEF4FF] p-1 dark:bg-white/10"
        />
        <span class="h-5 w-1 rounded-[2px] bg-[#0062FF]" />
        <h1 class="truncate text-[16px] font-semibold tracking-tight text-[#1A1A1A] dark:text-slate-100">
          {{ store.current?.candidate?.name ?? "候选人详情" }}
        </h1>
        <div class="flex-1" />
      <Button
          v-if="store.current"
          variant="outline"
          size="sm"
          class="h-9 shrink-0 gap-2 rounded-[6px] border-[#0063ff14] bg-white dark:border-white/10 dark:bg-card dark:text-slate-100 dark:hover:bg-white/14"
          @click="interviewImportOpen = true"
        >
          <FileUp class="h-4 w-4" />
          导入历史面试数据
        </Button>
        <div class="hidden sm:flex items-center gap-2 shrink-0">
          <AppUserActions />
        </div>
    </AppPageHeader>

      <!-- Loading -->
      <div v-if="store.loading" class="relative z-[1] flex items-center justify-center p-6">
        <Card class="w-full max-w-xl p-6">
          <Skeleton class="h-4 w-2/3 rounded-md mb-3" />
          <Skeleton class="h-4 w-full rounded-md mb-3" />
          <Skeleton class="h-4 w-5/6 rounded-md" />
        </Card>
      </div>

      <!-- Not found / load error -->
      <div
      v-else-if="!store.current"
        class="relative z-[1] flex items-center justify-center p-10"
      >
        <Card class="w-full max-w-xl p-6 text-center dark:border-white/10 dark:bg-card/82">
          <AppBrandIcon
            container-class="mx-auto mb-4 h-12 w-12 rounded-[8px] bg-[#EEF4FF] p-1.5 dark:bg-white/10"
          />
          <h2 class="text-base font-semibold text-[#1A1A1A] dark:text-slate-100">
            {{ detailError ? "候选人详情加载失败" : "未找到候选人" }}
          </h2>
          <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#4B5563] dark:text-slate-300">
            {{ detailError ?? "该候选人可能已被删除，或当前账号没有访问权限。" }}
          </p>
          <div class="mt-5 flex justify-center gap-2">
            <RouterLink to="/candidates">
              <Button variant="outline" size="sm" class="h-9 rounded-[6px] dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14">
                返回列表
              </Button>
            </RouterLink>
            <Button size="sm" class="h-9 rounded-[6px]" @click="loadCandidateDetail">
              重新加载
            </Button>
          </div>
        </Card>
      </div>

      <!-- Content -->
      <AppPageContent v-else :class="imsDesign.detailPageContent">
        <!-- Top row: Basic info + AI workspace -->
        <div :class="imsDesign.detailGrid">
          <!-- Basic info card -->
          <Card :class="`overflow-hidden ${imsDesign.detailSection}`">
            <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex min-w-0 items-start gap-4">
                <Avatar size="base" shape="square" class="h-14 w-14 rounded-[6px] bg-[#EEF4FF] text-[#0062FF] dark:bg-white/10 dark:text-blue-200">
                  <AvatarFallback>{{ candidateInitial(store.current.candidate.name) }}</AvatarFallback>
                </Avatar>
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="truncate text-[24px] font-semibold leading-[1.15] text-[#1A1A1A] dark:text-slate-100">
                      {{ store.current.candidate.name }}
                    </h2>
                    <Badge class="rounded-[6px] border-transparent bg-[#EEF4FF] text-[#0062FF]">
                      {{ candidateStatusLabel(store.current) }}
                    </Badge>
                  </div>
                  <p class="text-sm text-[#4B5563] dark:text-slate-300">
                    {{ store.current.candidate.position ?? "未填写应聘岗位" }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <Badge v-if="store.current.candidate.organizationName" class="rounded-[4px] border-transparent bg-[#EEF4FF] text-[#0062FF]">
                      {{ store.current.candidate.organizationName }}
                    </Badge>
                    <Badge v-if="store.current.candidate.yearsOfExperience" class="rounded-[4px] border-transparent bg-[#F3F4F6] text-[#4B5563]">
                      {{ store.current.candidate.yearsOfExperience }} 年经验
                    </Badge>
                    <Badge v-for="tag in store.current.candidate.tags" :key="tag" class="rounded-[4px] border-transparent bg-[#F3F4F6] text-[#4B5563]">
                      {{ tag }}
                    </Badge>
                    <span v-if="!store.current.candidate.tags.length" class="text-xs text-[#4B5563] dark:text-slate-300">
                      暂无候选人标签
                    </span>
                  </div>
                </div>
              </div>

              <div class="grid shrink-0 grid-cols-2 gap-2 sm:w-[220px]">
                <div class="rounded-[6px] bg-[#EEF4FF] px-3 py-2 dark:bg-white/10">
                  <p class="text-[11px] font-semibold text-[#0062FF]">匹配度</p>
                  <p class="mt-1 text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">{{ matchSummaryLabel(store.current) }}</p>
                </div>
                <div class="rounded-[6px] bg-[#F8FAFC] px-3 py-2 dark:bg-white/7">
                  <p class="text-[11px] font-semibold text-[#4B5563] dark:text-slate-300">当前阶段</p>
                  <p class="mt-1 text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">{{ candidateStageLabel(store.current) }}</p>
                </div>
              </div>
            </div>
            <Separator />
            <div class="grid gap-3 p-5 pt-4 text-sm sm:grid-cols-3">
              <div class="flex min-w-0 items-center gap-2">
                <Phone class="h-4 w-4 shrink-0 text-[#4B5563] dark:text-slate-300" />
                <span class="truncate text-[#1A1A1A] dark:text-slate-100">{{ store.current.candidate.phone ?? "未填写手机" }}</span>
              </div>
              <div class="flex min-w-0 items-center gap-2">
                <Mail class="h-4 w-4 shrink-0 text-[#4B5563] dark:text-slate-300" />
                <span class="truncate text-[#1A1A1A] dark:text-slate-100">{{ store.current.candidate.email ?? "未填写邮箱" }}</span>
              </div>
              <div class="flex min-w-0 items-center gap-2">
                <Building2 class="h-4 w-4 shrink-0 text-[#4B5563] dark:text-slate-300" />
                <span class="truncate text-[#1A1A1A] dark:text-slate-100">{{ store.current.candidate.organizationName ?? "未同步公司" }}</span>
              </div>
            </div>
          </Card>

          <!-- AI workspace card -->
          <Card :class="`${imsDesign.detailSection} p-5`">
            <div class="flex items-center gap-2 mb-4">
              <MessageSquare class="h-4 w-4 text-[#0062FF]" />
              <h2 class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">AI 工作台</h2>
            </div>
            <Separator class="mb-4" />
            <div class="flex items-center gap-2 mb-4">
              <Badge :variant="store.current.workspace ? 'default' : 'outline'">
                {{ store.current.workspace ? "活跃" : "未创建" }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ store.current.workspace ? "工作台已就绪" : "尚未创建工作台" }}
              </span>
            </div>
            <Button class="h-9 gap-2 rounded-[6px] bg-[#0062FF] px-4" @click="openWorkspace">
              <Send class="h-4 w-4" />
              {{ store.current.workspace ? "打开工作台" : "启动工作台" }}
            </Button>
          </Card>
        </div>

        <!-- Tabs: Resumes + Interviews + Decision rail -->
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card :class="`${imsDesign.detailSection} p-5`">
            <Tabs default-value="resumes">
            <TabsList class="mb-4 rounded-[6px] bg-white p-1 dark:bg-card">
              <TabsTrigger value="resumes">
                简历 ({{ store.current.resumes.length }})
              </TabsTrigger>
              <TabsTrigger value="interviews">
                面试记录 ({{ store.current.interviews.length }})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumes">
              <EmptyState
                v-if="!store.current.resumes.length"
                scenario="folder"
                title="暂无简历"
                description="该候选人还没有上传简历"
              />
              <div v-else class="space-y-3">
                <div
                  v-for="r in store.current.resumes"
                  :key="r.id"
                  class="flex items-start gap-3 rounded-[6px] border border-[#0063ff14] bg-[#F8FAFD] p-3 dark:border-white/8 dark:bg-white/5"
                >
                  <FileText class="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium truncate">{{ r.fileName }}</p>
                    <p v-if="r.ocrConfidence" class="text-xs text-muted-foreground mt-0.5">
                      识别置信度: {{ r.ocrConfidence }}%
                    </p>
                    <p v-if="r.parsedData" class="text-xs text-muted-foreground mt-1">
                      已解析 · {{ r.parsedData.skills?.length ?? 0 }} 个技能标签
                    </p>
                  </div>
                  <div class="shrink-0 flex items-center gap-1">
                    <Button size="sm" variant="ghost" class="h-7 gap-1.5" @click="openResumePreview(r)">
                      <FileSearch class="h-3.5 w-3.5" />
                      查看
                    </Button>
                    <Button size="sm" variant="ghost" class="h-7 gap-1.5" @click="downloadResume(r)">
                    <Download class="h-3.5 w-3.5" />
                    下载
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="interviews">
              <EmptyState
                v-if="!store.current.interviews.length"
                scenario="folder"
                title="暂无面试记录"
                description="该候选人还没有面试记录"
              />
              <div v-else class="space-y-3">
                <div
                  v-for="i in store.current.interviews"
                  :key="i.id"
                  class="rounded-[6px] border border-[#0063ff14] bg-[#F8FAFD] p-4 shadow-none odd:bg-[#EEF4FF] dark:border-white/8 dark:bg-white/5 dark:odd:bg-white/8"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0 space-y-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">{{ formatInterviewRoundLabel(i.round) }}</p>
                        <Badge :variant="i.status === 'completed' ? 'default' : i.status === 'cancelled' ? 'secondary' : 'outline'" class="text-xs">
                          {{ interviewStatusLabel(i.status) }}
                        </Badge>
                      </div>
                      <div class="flex flex-wrap items-center gap-4 text-xs text-[#4B5563] dark:text-slate-300">
                        <span class="inline-flex items-center gap-1.5">
                          <Clock class="h-3.5 w-3.5 text-[#0062FF]" />
                          {{ fmtTime(i.scheduledAt) }}
                        </span>
                        <span v-if="i.manualEvaluation" class="inline-flex items-center gap-1.5">
                          <FileSearch class="h-3.5 w-3.5 text-[#0062FF]" />
                          评价 {{ i.manualEvaluation.rating }} 分 · {{ i.manualEvaluation.decision }}
                        </span>
                      </div>
                    </div>
                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        v-if="i.meetingLink"
                        as="a"
                        :href="i.meetingLink"
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        size="sm"
                        class="h-8 gap-1.5 rounded-[6px] bg-white text-[#0062FF] dark:bg-white/8 dark:text-blue-200 dark:hover:bg-white/14"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                        会议链接
                      </Button>
                      <Button
                        v-if="i.manualEvaluation"
                        as="a"
                        :href="`#interview-${i.id}-evaluation`"
                        variant="ghost"
                        size="sm"
                        class="h-8 gap-1.5 rounded-[6px] bg-[#F9FAFB] text-[#0062FF] hover:text-[#0062FF] dark:bg-white/8 dark:text-blue-200 dark:hover:bg-white/14 dark:hover:text-blue-100"
                      >
                        <FileSearch class="h-3.5 w-3.5" />
                        查看评价
                      </Button>
                    </div>
                  </div>
                  <div
                    v-if="i.manualEvaluation"
                    :id="`interview-${i.id}-evaluation`"
                    class="mt-3 rounded-[6px] bg-white px-3 py-2 text-xs leading-5 text-[#4B5563] dark:bg-card dark:text-slate-300"
                  >
                    {{ i.manualEvaluation.comments || "暂无评价备注" }}
                  </div>
                </div>
              </div>
            </TabsContent>
            </Tabs>
          </Card>

          <aside class="space-y-3">
            <Card :class="`${imsDesign.detailItem} p-4`">
              <h2 class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">资料摘要</h2>
              <div class="mt-3 grid gap-2 rounded-[6px] bg-[#F9FAFB] p-3 text-xs leading-5 text-[#4B5563] dark:bg-white/7 dark:text-slate-300">
                <span class="truncate">手机：{{ store.current.candidate.phone ?? "未填写" }}</span>
                <span class="truncate">邮箱：{{ store.current.candidate.email ?? "未填写" }}</span>
                <span class="truncate">组织：{{ store.current.candidate.organizationName ?? "未同步" }}</span>
                <span class="truncate">来源：{{ store.current.candidate.source }}</span>
              </div>
            </Card>

            <Card :class="`${imsDesign.detailItem} p-4`">
              <h2 class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">决策依据</h2>
              <div class="mt-3 space-y-2">
                <div class="rounded-[6px] bg-[#EEF4FF] p-3 dark:bg-primary/18">
                  <p class="text-[11px] font-semibold text-[#0062FF]">推荐状态</p>
                  <p class="mt-1 text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">{{ candidateStatusLabel(store.current) }}</p>
                </div>
                <p class="text-xs leading-5 text-[#4B5563] dark:text-slate-300">
                  {{ decisionSummary }}
                </p>
              </div>
            </Card>

            <Card :class="`${imsDesign.detailItem} p-4`">
              <h2 class="text-sm font-semibold text-[#1A1A1A] dark:text-slate-100">操作记录</h2>
              <ol class="mt-3 space-y-3">
                <li
                  v-for="item in activityTimeline"
                  :key="item"
                  class="flex gap-2 text-xs leading-5 text-[#4B5563] dark:text-slate-300"
                >
                  <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0062FF]" />
                  <span>{{ item }}</span>
                </li>
              </ol>
            </Card>
          </aside>
        </div>
      </AppPageContent>

      <Dialog
        :open="resumePreviewOpen"
        content-class="top-[4vh] max-w-[1440px] max-h-[92vh] -translate-y-0 overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
        @update:open="handleResumePreviewOpenChange"
      >
        <template #content>
          <AppDialogLayout body-class="space-y-4 overflow-hidden py-0">
            <template #header>
              <DialogHeader v-if="previewResume">
                <DialogTitle class="flex items-center gap-3 pr-8 text-[16px] font-semibold text-[#1A1A1A]">
                  <span class="flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#EEF4FF] text-[#0062FF]">
                    {{ candidateInitial(currentCandidate?.name ?? "") }}
                  </span>
                  {{ previewResume.fileName }}
                </DialogTitle>
                <DialogDescription class="flex flex-wrap items-center gap-2 pl-[60px] pt-1 text-xs text-[#667085]">
                  <Badge class="rounded-[6px] border-transparent bg-[#F5F8FF] text-[#0062FF]">{{ previewModeLabel(previewResume) }}</Badge>
                  <Badge v-if="previewResume.ocrConfidence" class="rounded-[6px] border-transparent bg-[#EEF4FF] text-[#0062FF]">
                    识别置信度 {{ previewResume.ocrConfidence }}%
                  </Badge>
                  <span class="text-[#667085]">{{ formatResumeSize(previewResume.fileSize) }}</span>
                </DialogDescription>
              </DialogHeader>
            </template>

          <Tabs v-if="previewResume" default-value="original" class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <TabsList class="rounded-[6px] bg-white p-1 shadow-none dark:bg-card">
                <TabsTrigger value="original">PDF / 原件阅读</TabsTrigger>
                <TabsTrigger value="document">文档版</TabsTrigger>
              </TabsList>

              <Button type="button" variant="outline" :class="`h-9 gap-2 ${imsDesign.luiControl}`" @click="downloadResume(previewResume)">
                <Download class="h-4 w-4" />
                下载原件
              </Button>
            </div>

            <TabsContent value="original">
              <div class="rounded-[6px] border-0 bg-white p-4">
                <div v-if="previewLoading" class="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
                  正在加载原件预览…
                </div>
                <div v-else-if="previewError" class="flex h-[70vh] items-center justify-center px-6 text-sm text-destructive">
                  {{ previewError }}
                </div>
                <iframe
                  v-else-if="previewObjectUrl && isPdfResume(previewResume)"
                  :src="previewObjectUrl"
                  class="h-[70vh] w-full rounded-[6px] bg-white"
                  title="PDF 简历预览"
                />
                <div v-else-if="previewObjectUrl && isImageResume(previewResume)" class="flex h-[70vh] items-center justify-center rounded-[6px] bg-white p-4">
                  <img :src="previewObjectUrl" :alt="previewResume.fileName" class="max-h-full max-w-full rounded-md object-contain" />
                </div>
                <div v-else class="flex h-[70vh] items-center justify-center px-6 text-sm text-muted-foreground">
                  当前原件暂不支持内嵌阅读，请使用右上角“下载原件”查看。
                </div>
              </div>
            </TabsContent>

            <TabsContent value="document">
              <div class="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <Card :class="`${imsDesign.detailItem} p-4`">
                  <div class="space-y-5 text-sm">
                    <div class="flex items-center gap-3">
                      <Avatar shape="square" class="rounded-[6px] bg-[#EEF4FF] text-[#0062FF]">
                        <AvatarFallback>{{ candidateInitial(previewResume.parsedData?.name ?? currentCandidate?.name ?? "") }}</AvatarFallback>
                      </Avatar>
                      <div class="min-w-0">
                        <p class="truncate font-semibold text-[#1A1A1A]">{{ previewResume.parsedData?.name ?? currentCandidate?.name ?? "—" }}</p>
                        <p class="mt-0.5 truncate text-xs text-[#4B5563]">{{ previewResume.parsedData?.position ?? currentCandidate?.position ?? "未填写岗位" }}</p>
                      </div>
                    </div>

                    <div class="grid gap-2 rounded-[6px] bg-[#F9FAFB] p-3 text-xs text-[#4B5563]">
                      <div class="flex min-w-0 items-center gap-2">
                        <Phone class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate">{{ previewResume.parsedData?.phone ?? currentCandidate?.phone ?? "未填写手机" }}</span>
                      </div>
                      <div class="flex min-w-0 items-center gap-2">
                        <Mail class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate">{{ previewResume.parsedData?.email ?? currentCandidate?.email ?? "未填写邮箱" }}</span>
                      </div>
                      <div class="flex min-w-0 items-center gap-2">
                        <Clock class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate">{{ formatExperience(previewResume.parsedData?.yearsOfExperience ?? currentCandidate?.yearsOfExperience) }}</span>
                      </div>
                    </div>

                    <section>
                      <p class="text-xs font-semibold text-[#1A1A1A]">技能标签</p>
                      <div v-if="previewResume.parsedData?.skills?.length" class="mt-2 flex flex-wrap gap-2">
                        <Badge v-for="skill in previewResume.parsedData.skills" :key="skill" variant="secondary">{{ skill }}</Badge>
                      </div>
                      <p v-else class="mt-1 text-xs text-[#4B5563]">暂无结构化技能标签</p>
                    </section>

                    <section>
                      <p class="text-xs font-semibold text-[#1A1A1A]">教育经历</p>
                      <ol v-if="previewResume.parsedData?.education?.length" class="mt-3 space-y-3">
                        <li v-for="item in previewResume.parsedData.education" :key="item" class="flex gap-2 text-xs leading-5 text-[#4B5563]">
                          <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0062FF]" />
                          <span>{{ item }}</span>
                        </li>
                      </ol>
                      <p v-else class="mt-1 text-xs text-[#4B5563]">暂无教育信息</p>
                    </section>
                  </div>
                </Card>

                <Card :class="`min-h-0 p-0 ${imsDesign.detailItem}`">
                  <div class="border-b border-[#0063ff14] px-4 py-3">
                    <p class="text-sm font-semibold text-[#1A1A1A]">文档文本</p>
                    <p class="mt-1 text-xs text-[#667085]">展示 OCR / 文本提取后的内容，适合快速浏览与复制。</p>
                  </div>
                  <ScrollArea class="h-[70vh]">
                    <div class="space-y-4 p-4">
                      <section v-if="previewResume.parsedData?.workHistory?.length">
                        <h3 class="text-sm font-semibold text-[#1A1A1A]">工作经历</h3>
                        <ul class="mt-2 space-y-2 text-sm text-[#4B5563]">
                          <li v-for="item in previewResume.parsedData.workHistory" :key="item">{{ item }}</li>
                        </ul>
                      </section>

                      <section>
                        <h3 class="text-sm font-semibold text-[#1A1A1A]">提取全文</h3>
                        <pre class="mt-2 whitespace-pre-wrap break-words rounded-[6px] bg-[#F9FAFB] p-4 text-xs leading-6 text-[#20242A]">{{ resumeDocumentText(previewResume) }}</pre>
                      </section>
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
          </AppDialogLayout>
        </template>
      </Dialog>

      <InterviewImportDrawer
        v-if="store.current"
        :open="interviewImportOpen"
        :candidate-id="store.current.candidate.id"
        :candidate-name="store.current.candidate.name"
        :existing-interview-count="store.current.interviews.length"
        :next-round-number="nextInterviewImportRoundNumber"
        @submitted="handleInterviewImportSubmitted"
        @update:open="interviewImportOpen = $event"
      />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Building2,
  Clock,
  Download,
  ExternalLink,
  FileSearch,
  FileUp,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Send,
} from "lucide-vue-next";
import { candidatesApi, resolveResumePreviewContentType } from "@/api/candidates";
import { useCandidatesStore } from "@/stores/candidates";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandIcon from "@/components/layout/app-brand-icon.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import InterviewImportDrawer from "@/components/candidates/interview-import-drawer.vue";
import { Avatar } from "@/components/ui/avatar";
import { AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppDialogLayout } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { TabsContent } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import { TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInterviewRoundLabel, type CandidateDetailData } from "@ims/shared";

const route = useRoute();
const router = useRouter();
const store = useCandidatesStore();
type CandidateResume = CandidateDetailData["resumes"][number];
const currentCandidate = computed(() => store.current?.candidate ?? null);

const resumePreviewOpen = ref(false);
const previewResume = ref<CandidateResume | null>(null);
const previewObjectUrl = ref<string | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const previewContentType = ref<string | null>(null);
const previewFileName = ref<string | null>(null);
const previewRequestToken = ref(0);
const interviewImportOpen = ref(false);
const detailError = ref<string | null>(null);

const nextInterviewImportRoundNumber = computed(() => {
  const rounds = store.current?.interviews ?? [];
  const maxRound = rounds.reduce((currentMaxRound, interview) => {
    return interview.round > currentMaxRound ? interview.round : currentMaxRound;
  }, 0);
  return maxRound + 1;
});

const decisionSummary = computed(() => {
  const current = store.current;
  if (!current) return "暂无候选人资料，等待同步后生成决策依据。";
  const resumeText = current.resumes.length
    ? `已有 ${current.resumes.length} 份简历资料`
    : "暂无简历资料";
  const interviewText = current.interviews.length
    ? `累计 ${current.interviews.length} 条面试记录`
    : "暂无面试记录";
  return `${resumeText}，${interviewText}。建议结合 AI 工作台产物继续补齐筛选、面试题和复盘结论。`;
});

const activityTimeline = computed(() => {
  const current = store.current;
  if (!current) return ["等待候选人数据加载"];
  const items = [
    current.resumes.length
      ? `已归档 ${current.resumes.length} 份简历资料`
      : "简历资料待上传或同步",
    current.interviews.length
      ? `已记录 ${current.interviews.length} 轮面试信息`
      : "面试记录待补充",
    current.workspace
      ? "AI 工作台已创建，可继续分析"
      : "AI 工作台待启动",
  ];
  return items;
});

function candidateInitial(name: string) {
  const trimmedName = name.trim();
  return trimmedName ? trimmedName.slice(0, 1).toUpperCase() : "—";
}

function candidateStatusLabel(current: CandidateDetailData) {
  if (current.interviews.some(interview => interview.status === "completed")) return "已面试";
  if (current.interviews.some(interview => interview.status === "scheduled")) return "待面试";
  if (current.workspace) return "AI 跟进中";
  return "待初筛";
}

function candidateStageLabel(current: CandidateDetailData) {
  if (current.interviews.some(interview => interview.status === "completed")) return "面试复盘";
  if (current.interviews.some(interview => interview.status === "scheduled")) return "面试安排";
  if (current.resumes.some(resume => resume.parsedData)) return "简历已解析";
  if (current.resumes.length) return "简历待解析";
  return "资料收集";
}

function matchSummaryLabel(current: CandidateDetailData) {
  const screeningArtifact = current.artifactsSummary.find(artifact => artifact.type === "screening");
  if (screeningArtifact) return `初筛 v${screeningArtifact.currentVersion}`;
  if (current.resumes.some(resume => resume.parsedData?.skills.length)) return "待评分";
  return "待生成";
}

function interviewStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "已安排",
    completed: "已完成",
    cancelled: "已取消",
    no_show: "未到场",
  };
  return labels[status] ?? status;
}

async function loadCandidateDetail() {
  const candidateId = route.params.id;
  if (typeof candidateId !== "string" || !candidateId.trim()) {
    detailError.value = "候选人链接缺少有效 ID。";
    return;
  }

  detailError.value = null;
  try {
    await store.fetchOne(candidateId);
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : "候选人详情加载失败，请稍后重试。";
  }
}

onMounted(() => {
  void loadCandidateDetail();
});

watch(
  () => route.params.id,
  () => {
    void loadCandidateDetail();
  },
);

onBeforeUnmount(() => {
  revokePreviewObjectUrl();
});

function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openWorkspace() {
  const id = route.params.id as string;
  // Navigate to LUI with candidateId pre-selected
  void router.push({
    path: "/lui",
    query: { candidateId: id },
  });
}

function handleInterviewImportSubmitted() {
  interviewImportOpen.value = false;
  void loadCandidateDetail();
}

async function downloadResume(resume: CandidateResume) {
  const { blob, fileName } = await candidatesApi.downloadResume(resume.id);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName ?? resume.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function openResumePreview(resume: CandidateResume) {
  const requestToken = ++previewRequestToken.value;
  resumePreviewOpen.value = true;
  previewResume.value = resume;
  previewLoading.value = true;
  previewError.value = null;
  previewContentType.value = null;
  previewFileName.value = null;
  revokePreviewObjectUrl();

  try {
    if (requestToken !== previewRequestToken.value || previewResume.value?.id !== resume.id || !resumePreviewOpen.value) {
      return;
    }

    const preview = await candidatesApi.loadResumePreviewSource(resume.id);
    if (requestToken !== previewRequestToken.value || previewResume.value?.id !== resume.id || !resumePreviewOpen.value) {
      URL.revokeObjectURL(preview.objectUrl);
      return;
    }

    previewObjectUrl.value = preview.objectUrl;
    previewContentType.value = preview.contentType
      ?? resolveResumePreviewContentType(resume.fileType, resume.fileName);
    previewFileName.value = preview.fileName ?? resume.fileName;
  } catch (error) {
    if (requestToken !== previewRequestToken.value) return;
    previewError.value = error instanceof Error ? error.message : "原件预览加载失败";
  } finally {
    if (requestToken === previewRequestToken.value) {
      previewLoading.value = false;
    }
  }
}

function handleResumePreviewOpenChange(open: boolean) {
  resumePreviewOpen.value = open;
  if (!open) {
    previewRequestToken.value += 1;
    previewResume.value = null;
    previewError.value = null;
    previewLoading.value = false;
    previewContentType.value = null;
    previewFileName.value = null;
    revokePreviewObjectUrl();
  }
}

function previewModeLabel(resume: CandidateResume) {
  if (isPdfResume(resume)) return "PDF";
  if (isImageResume(resume)) return "图片原件";
  return `${resolveResumeExtension(resume).toUpperCase()} 原件`;
}

function isPdfResume(resume: CandidateResume) {
  return previewContentType.value === "application/pdf" || resolveResumeExtension(resume) === "pdf";
}

function isImageResume(resume: CandidateResume) {
  return previewContentType.value?.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(resolveResumeExtension(resume));
}

function resumeDocumentText(resume: CandidateResume) {
  return resume.extractedText?.trim()
    || resume.parsedData?.rawText?.trim()
    || "暂无可展示的提取文本";
}

function formatExperience(years: number | null | undefined) {
  if (!years) return "—";
  return `${years} 年`;
}

function formatResumeSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function revokePreviewObjectUrl() {
  if (!previewObjectUrl.value) return;

  if (previewObjectUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(previewObjectUrl.value);
  }

  previewObjectUrl.value = null;
}

function resolveResumeExtension(resume: CandidateResume) {
  const previewName = previewFileName.value?.trim();
  const candidateName = previewName || resume.fileName;
  const dotIndex = candidateName.lastIndexOf(".");
  if (dotIndex >= 0 && dotIndex < candidateName.length - 1) {
    return candidateName.slice(dotIndex + 1).toLowerCase();
  }

  return resume.fileType.toLowerCase();
}
</script>
