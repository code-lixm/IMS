<template>
  <div class="min-h-screen flex">
    <aside class="w-56 bg-card border-r border-border flex flex-col shrink-0">
      <div class="p-4 font-semibold text-sm border-b border-border">📋 面试管理</div>
      <nav class="flex-1 p-2">
        <RouterLink to="/candidates" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">👥 候选人</RouterLink>
        <RouterLink to="/import" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">📥 导入任务</RouterLink>
        <RouterLink to="/settings" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">⚙️ 设置</RouterLink>
      </nav>
    </aside>

    <main class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-border flex items-center px-6 gap-4 shrink-0">
        <RouterLink to="/candidates" class="text-sm text-muted-foreground hover:text-foreground">← 返回</RouterLink>
        <h1 class="font-medium text-sm">{{ store.current?.candidate?.name ?? "候选人详情" }}</h1>
        <div class="flex-1" />
      </header>

      <div v-if="store.loading" class="flex-1 flex items-center justify-center text-muted-foreground text-sm">加载中…</div>
      <div v-else-if="!store.current" class="flex-1 flex items-center justify-center text-muted-foreground text-sm">未找到候选人</div>
      <div v-else class="flex-1 overflow-auto p-6">
        <div class="grid grid-cols-2 gap-4">
          <!-- 基本信息 -->
          <div class="border border-border rounded-xl p-5">
            <h2 class="text-sm font-semibold mb-3">基本信息</h2>
            <dl class="space-y-2 text-sm">
              <div class="grid grid-cols-[80px_1fr] gap-2">
                <dt class="text-muted-foreground">姓名</dt><dd>{{ store.current.candidate.name }}</dd>
                <dt class="text-muted-foreground">岗位</dt><dd>{{ store.current.candidate.position ?? "—" }}</dd>
                <dt class="text-muted-foreground">工作年限</dt><dd>{{ store.current.candidate.yearsOfExperience ? `${store.current.candidate.yearsOfExperience}年` : "—" }}</dd>
                <dt class="text-muted-foreground">手机</dt><dd>{{ store.current.candidate.phone ?? "—" }}</dd>
                <dt class="text-muted-foreground">邮箱</dt><dd>{{ store.current.candidate.email ?? "—" }}</dd>
              </div>
            </dl>
          </div>

          <!-- AI 工作台 -->
          <div class="border border-border rounded-xl p-5">
            <h2 class="text-sm font-semibold mb-3">🤖 AI 工作台</h2>
            <template v-if="store.current.workspace">
              <p class="text-sm text-muted-foreground mb-3">状态: <span class="text-green-600">活跃</span></p>
            </template>
            <template v-else>
              <p class="text-sm text-muted-foreground mb-3">尚未创建工作台</p>
            </template>
            <button @click="openWorkspace" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
              {{ store.current.workspace ? "打开工作台" : "启动工作台" }}
            </button>
          </div>

          <!-- 简历 -->
          <div class="border border-border rounded-xl p-5">
            <h2 class="text-sm font-semibold mb-3">📄 简历 ({{ store.current.resumes.length }})</h2>
            <div v-if="!store.current.resumes.length" class="text-sm text-muted-foreground">暂无简历</div>
            <div v-for="r in store.current.resumes" :key="r.id" class="mb-3 last:mb-0">
              <p class="text-sm font-medium">{{ r.fileName }}</p>
              <p class="text-xs text-muted-foreground">{{ r.ocrConfidence ? `识别置信度: ${r.ocrConfidence}%` : "" }}</p>
            </div>
          </div>

          <!-- 面试记录 -->
          <div class="border border-border rounded-xl p-5">
            <h2 class="text-sm font-semibold mb-3">📅 面试记录 ({{ store.current.interviews.length }})</h2>
            <div v-if="!store.current.interviews.length" class="text-sm text-muted-foreground">暂无面试记录</div>
            <div v-for="i in store.current.interviews" :key="i.id" class="mb-3 last:mb-0">
              <p class="text-sm font-medium">第 {{ i.round }} 轮</p>
              <p class="text-xs text-muted-foreground">{{ fmtTime(i.scheduledAt) }} · {{ i.status }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import { useCandidatesStore } from "@/stores/candidates";
import { opencodeApi } from "@/api/opencode";

const route = useRoute();
const store = useCandidatesStore();

onMounted(() => store.fetchOne(route.params.id as string));

function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function openWorkspace() {
  const id = route.params.id as string;
  try {
    const ws = await opencodeApi.workspace(id);
    window.open(ws.url, "_blank");
  } catch (err: any) {
    alert("启动工作台失败: " + err.message);
  }
}
</script>
