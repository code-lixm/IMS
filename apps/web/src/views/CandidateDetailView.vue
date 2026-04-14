<template>
  <AppPageShell>
    <AppPageHeader content-class="flex h-16 items-center gap-3 px-4 sm:px-6">
        <RouterLink to="/candidates">
          <Button variant="ghost" size="sm" class="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft class="h-4 w-4" />
            返回
          </Button>
        </RouterLink>
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
          <Briefcase class="h-4 w-4 text-primary" />
        </div>
        <h1 class="text-base font-semibold tracking-tight truncate">
          {{ store.current?.candidate?.name ?? "候选人详情" }}
        </h1>
        <div class="flex-1" />
        <div class="hidden sm:flex items-center gap-2 shrink-0">
          <Button variant="outline" class="gap-2" @click="$router.push('/import')">
            <Upload class="h-4 w-4" />
            任务
          </Button>
          <AppUserActions />
        </div>
    </AppPageHeader>

      <!-- Loading -->
      <div v-if="store.loading" class="flex items-center justify-center p-6">
        <Card class="w-full max-w-xl p-6">
          <Skeleton class="h-4 w-2/3 rounded-md mb-3" />
          <Skeleton class="h-4 w-full rounded-md mb-3" />
          <Skeleton class="h-4 w-5/6 rounded-md" />
        </Card>
      </div>

      <!-- Not found -->
      <div
        v-else-if="!store.current"
        class="flex items-center justify-center p-10 text-sm text-muted-foreground"
      >
        未找到候选人
      </div>

      <!-- Content -->
      <AppPageContent v-else>
        <!-- Top row: Basic info + AI workspace -->
        <div class="grid gap-4 mb-4 lg:grid-cols-2">
          <!-- Basic info card -->
          <Card class="p-5">
            <div class="flex items-center gap-2 mb-4">
              <User class="h-4 w-4 text-muted-foreground" />
              <h2 class="text-sm font-semibold">基本信息</h2>
            </div>
            <Separator class="mb-4" />
            <dl class="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2.5 text-sm">
              <dt class="text-muted-foreground">姓名</dt>
              <dd class="font-medium">{{ store.current.candidate.name }}</dd>
              <dt class="text-muted-foreground">岗位</dt>
              <dd>{{ store.current.candidate.position ?? "—" }}</dd>
              <dt class="text-muted-foreground">工作年限</dt>
              <dd>{{ store.current.candidate.yearsOfExperience ? `${store.current.candidate.yearsOfExperience} 年` : "—" }}</dd>
              <dt class="text-muted-foreground">手机</dt>
              <dd>{{ store.current.candidate.phone ?? "—" }}</dd>
              <dt class="text-muted-foreground">邮箱</dt>
              <dd>{{ store.current.candidate.email ?? "—" }}</dd>
            </dl>
          </Card>

          <!-- AI workspace card -->
          <Card class="p-5">
            <div class="flex items-center gap-2 mb-4">
              <MessageSquare class="h-4 w-4 text-muted-foreground" />
              <h2 class="text-sm font-semibold">AI 工作台</h2>
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
            <Button class="gap-2" @click="openWorkspace">
              <Send class="h-4 w-4" />
              {{ store.current.workspace ? "打开工作台" : "启动工作台" }}
            </Button>
          </Card>
        </div>

        <!-- Tabs: Resumes + Interviews -->
        <Card class="p-5">
          <Tabs default-value="resumes">
            <TabsList class="mb-4">
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
                  class="flex items-start gap-3 rounded-md border p-3"
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
                  class="flex items-start gap-3 rounded-md border p-3"
                >
                  <Clock class="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">{{ formatInterviewRoundLabel(i.round) }}</p>
                      <Badge variant="secondary" class="text-xs">{{ i.status }}</Badge>
                    </div>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {{ fmtTime(i.scheduledAt) }}
                      <span v-if="i.meetingLink"> · </span>
                      <a
                        v-if="i.meetingLink"
                        :href="i.meetingLink"
                        target="_blank"
                        class="text-primary hover:underline"
                      >
                        会议链接
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </AppPageContent>

      <Dialog
        :open="resumePreviewOpen"
        content-class="max-w-6xl p-5"
        @update:open="handleResumePreviewOpenChange"
      >
        <template #content>
          <DialogHeader v-if="previewResume">
            <DialogTitle class="pr-8 text-sm font-semibold">
              {{ previewResume.fileName }}
            </DialogTitle>
            <DialogDescription class="flex flex-wrap items-center gap-2 pt-1 text-xs">
              <Badge variant="outline">{{ previewModeLabel(previewResume) }}</Badge>
              <Badge v-if="previewResume.ocrConfidence" variant="secondary">
                识别置信度 {{ previewResume.ocrConfidence }}%
              </Badge>
              <span class="text-muted-foreground">{{ formatResumeSize(previewResume.fileSize) }}</span>
            </DialogDescription>
          </DialogHeader>

          <Tabs v-if="previewResume" default-value="original" class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="original">PDF / 原件阅读</TabsTrigger>
                <TabsTrigger value="document">文档版</TabsTrigger>
              </TabsList>

              <Button type="button" variant="outline" class="gap-2" @click="downloadResume(previewResume)">
                <Download class="h-4 w-4" />
                下载原件
              </Button>
            </div>

            <TabsContent value="original">
              <div class="rounded-md border bg-muted/20">
                <div v-if="previewLoading" class="flex h-[70vh] items-center justify-center text-sm text-muted-foreground">
                  正在加载原件预览…
                </div>
                <div v-else-if="previewError" class="flex h-[70vh] items-center justify-center px-6 text-sm text-destructive">
                  {{ previewError }}
                </div>
                <iframe
                  v-else-if="previewObjectUrl && isPdfResume(previewResume)"
                  :src="previewObjectUrl"
                  class="h-[70vh] w-full rounded-md"
                  title="PDF 简历预览"
                />
                <div v-else-if="previewObjectUrl && isImageResume(previewResume)" class="flex h-[70vh] items-center justify-center bg-background p-4">
                  <img :src="previewObjectUrl" :alt="previewResume.fileName" class="max-h-full max-w-full rounded-md object-contain" />
                </div>
                <div v-else class="flex h-[70vh] items-center justify-center px-6 text-sm text-muted-foreground">
                  当前原件暂不支持内嵌阅读，请使用右上角“下载原件”查看。
                </div>
              </div>
            </TabsContent>

            <TabsContent value="document">
              <div class="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <Card class="p-4">
                  <div class="space-y-4 text-sm">
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">候选人</p>
                      <p class="mt-1">{{ previewResume.parsedData?.name ?? currentCandidate?.name ?? "—" }}</p>
                    </div>
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">岗位</p>
                      <p class="mt-1">{{ previewResume.parsedData?.position ?? currentCandidate?.position ?? "—" }}</p>
                    </div>
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">联系方式</p>
                      <p class="mt-1 break-all">{{ previewResume.parsedData?.phone ?? currentCandidate?.phone ?? "—" }}</p>
                      <p class="mt-1 break-all text-muted-foreground">{{ previewResume.parsedData?.email ?? currentCandidate?.email ?? "—" }}</p>
                    </div>
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">工作年限</p>
                      <p class="mt-1">{{ formatExperience(previewResume.parsedData?.yearsOfExperience) }}</p>
                    </div>
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">技能标签</p>
                      <div v-if="previewResume.parsedData?.skills?.length" class="mt-2 flex flex-wrap gap-2">
                        <Badge v-for="skill in previewResume.parsedData.skills" :key="skill" variant="secondary">{{ skill }}</Badge>
                      </div>
                      <p v-else class="mt-1 text-muted-foreground">暂无结构化技能标签</p>
                    </div>
                    <div>
                      <p class="text-xs font-medium text-muted-foreground">教育经历</p>
                      <ul v-if="previewResume.parsedData?.education?.length" class="mt-2 space-y-1 text-muted-foreground">
                        <li v-for="item in previewResume.parsedData.education" :key="item">{{ item }}</li>
                      </ul>
                      <p v-else class="mt-1 text-muted-foreground">暂无教育信息</p>
                    </div>
                  </div>
                </Card>

                <Card class="min-h-0 p-0">
                  <div class="border-b px-4 py-3">
                    <p class="text-sm font-medium">文档文本</p>
                    <p class="mt-1 text-xs text-muted-foreground">展示 OCR / 文本提取后的内容，适合快速浏览与复制。</p>
                  </div>
                  <ScrollArea class="h-[70vh]">
                    <div class="space-y-4 p-4">
                      <section v-if="previewResume.parsedData?.workHistory?.length">
                        <h3 class="text-sm font-medium">工作经历</h3>
                        <ul class="mt-2 space-y-2 text-sm text-muted-foreground">
                          <li v-for="item in previewResume.parsedData.workHistory" :key="item">{{ item }}</li>
                        </ul>
                      </section>

                      <section>
                        <h3 class="text-sm font-medium">提取全文</h3>
                        <pre class="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 text-xs leading-6 text-foreground">{{ resumeDocumentText(previewResume) }}</pre>
                      </section>
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </template>
      </Dialog>
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  Download,
  FileSearch,
  FileText,
  MessageSquare,
  Send,
  Upload,
  User,
} from "lucide-vue-next";
import { candidatesApi, resolveResumePreviewContentType } from "@/api/candidates";
import { useCandidatesStore } from "@/stores/candidates";
import AppUserActions from "@/components/app-user-actions.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import ScrollArea from "@/components/ui/scroll-area.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import Tabs from "@/components/ui/tabs.vue";
import TabsContent from "@/components/ui/tabs-content.vue";
import TabsList from "@/components/ui/tabs-list.vue";
import TabsTrigger from "@/components/ui/tabs-trigger.vue";
import EmptyState from "@/components/ui/empty-state.vue";
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

onMounted(() => store.fetchOne(route.params.id as string));

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

    previewObjectUrl.value = candidatesApi.getResumePreviewUrl(resume.id);
    previewContentType.value = resolveResumePreviewContentType(resume.fileType, resume.fileName);
    previewFileName.value = resume.fileName;
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
