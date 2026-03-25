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
                  <Button size="sm" variant="ghost" class="shrink-0 h-7 gap-1.5">
                    <Download class="h-3.5 w-3.5" />
                    下载
                  </Button>
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
                      <p class="text-sm font-medium">第 {{ i.round }} 轮</p>
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
  </AppPageShell>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Send,
  Upload,
  User,
} from "lucide-vue-next";
import type { WorkspaceData } from "@ims/shared";
import { api } from "@/api/client";
import { useCandidatesStore } from "@/stores/candidates";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import AppUserActions from "@/components/app-user-actions.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import Tabs from "@/components/ui/tabs.vue";
import TabsContent from "@/components/ui/tabs-content.vue";
import TabsList from "@/components/ui/tabs-list.vue";
import TabsTrigger from "@/components/ui/tabs-trigger.vue";
import EmptyState from "@/components/ui/empty-state.vue";

const route = useRoute();
const store = useCandidatesStore();
const { notifyError, notifySuccess } = useAppNotifications();

onMounted(() => store.fetchOne(route.params.id as string));

function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function openWorkspace() {
  const id = route.params.id as string;
  try {
    const ws = await api<WorkspaceData>(`/api/candidates/${id}/workspace`, {
      method: "POST",
    });
    window.open(ws.url, "_blank");
  } catch (err: unknown) {
    notifyError(reportAppError("candidate-detail/open-workspace", err, {
      title: "启动工作台失败",
      fallbackMessage: "暂时无法打开工作台",
    }));
    return;
  }

  notifySuccess("工作台已在新窗口打开", { title: "启动成功" });
}
</script>
