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
        <h1 class="font-medium text-sm">设置</h1>
      </header>

      <div class="flex-1 overflow-auto p-6">
        <!-- 账户 -->
        <div class="border border-border rounded-xl p-5 mb-4">
          <h2 class="text-sm font-semibold mb-3">账户</h2>
          <div v-if="authStore.status === 'valid'" class="flex items-center gap-3">
            <span class="text-sm">✅ 已登录: {{ authStore.user?.name }}</span>
            <button @click="logout" class="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-accent">退出登录</button>
          </div>
          <div v-else class="flex items-center gap-3">
            <span class="text-sm text-muted-foreground">未登录</span>
            <button class="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">登录</button>
          </div>
        </div>

        <!-- 同步 -->
        <div class="border border-border rounded-xl p-5 mb-4">
          <h2 class="text-sm font-semibold mb-3">同步</h2>
          <div class="flex items-center gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="syncEnabled" @change="toggleSync" class="rounded" />
              开启自动同步
            </label>
          </div>
          <p class="text-xs text-muted-foreground mb-3">
            {{ syncStore.status.lastSyncAt ? `上次同步: ${fmtTime(syncStore.status.lastSyncAt)}` : "从未同步" }}
            <span v-if="syncStore.status.lastError" class="text-red-500 block mt-1">错误: {{ syncStore.status.lastError }}</span>
          </p>
          <button @click="runSyncNow" :disabled="syncStore.loading" class="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-accent disabled:opacity-50">
            立即同步
          </button>
        </div>

        <!-- OpenCode -->
        <div class="border border-border rounded-xl p-5">
          <h2 class="text-sm font-semibold mb-3">🤖 OpenCode AI 引擎</h2>
          <div class="flex items-center gap-3 mb-3">
            <span class="w-2 h-2 rounded-full" :class="opencodeStatus.running ? 'bg-green-500' : 'bg-muted'" />
            <span class="text-sm">{{ opencodeStatus.running ? `运行中 (${opencodeStatus.baseUrl})` : "未运行" }}</span>
          </div>
          <div class="flex gap-2">
            <button v-if="!opencodeStatus.running" @click="startOpencode" class="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90">启动引擎</button>
            <button v-else @click="stopOpencode" class="px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-accent">停止引擎</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useSyncStore } from "@/stores/sync";
import { opencodeApi } from "@/api/opencode";

const authStore = useAuthStore();
const syncStore = useSyncStore();
const syncEnabled = ref(false);
const opencodeStatus = ref({ running: false, baseUrl: "", host: "", port: 0 });

onMounted(async () => {
  await authStore.checkStatus();
  await syncStore.fetchStatus();
  syncEnabled.value = syncStore.status.enabled;
  try { opencodeStatus.value = await opencodeApi.status(); } catch {}
});

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function logout() {
  await authStore.checkStatus();
}

async function toggleSync() {
  await syncStore.toggle(syncEnabled.value);
}

async function runSyncNow() { await syncStore.runNow(); }

async function startOpencode() {
  opencodeStatus.value = await opencodeApi.start();
}

async function stopOpencode() {
  await opencodeApi.stop();
  opencodeStatus.value.running = false;
}
</script>
