<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <aside class="w-56 bg-card border-r border-border flex flex-col shrink-0">
      <div class="p-4 font-semibold text-sm border-b border-border">📋 面试管理</div>
      <nav class="flex-1 p-2">
        <RouterLink to="/candidates" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">
          👥 候选人
        </RouterLink>
        <RouterLink to="/import" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">
          📥 导入任务
        </RouterLink>
        <RouterLink to="/settings" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent" active-class="bg-primary/10 text-primary font-medium">
          ⚙️ 设置
        </RouterLink>
      </nav>
    </aside>

    <!-- Main -->
    <main class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-border flex items-center px-6 gap-4 shrink-0">
        <h1 class="font-medium text-sm">候选人</h1>
        <div class="flex-1" />
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full" :class="syncIndicatorClass" />
          <span class="text-xs text-muted-foreground">{{ syncLabel }}</span>
        </div>
      </header>

      <div class="flex-1 overflow-auto p-6">
        <!-- Search & Actions -->
        <div class="flex gap-3 mb-4">
          <input
            v-model="search"
            class="flex-1 px-4 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="搜索姓名、岗位、手机、邮箱…"
            @input="debouncedSearch"
          />
          <button @click="showCreate = true" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
            + 新建候选人
          </button>
          <button @click="triggerFileImport" class="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">
            📥 导入文件
          </button>
        </div>

        <!-- Table -->
        <div v-if="store.loading" class="text-center py-20 text-muted-foreground text-sm">加载中…</div>
        <div v-else-if="!store.list.length" class="text-center py-20">
          <p class="text-muted-foreground text-sm">暂无候选人</p>
        </div>
        <div v-else class="border border-border rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">姓名</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">岗位</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">来源</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">更新时间</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="c in store.list" :key="c.id" class="hover:bg-muted/30">
                <td class="px-4 py-3">
                  <RouterLink :to="`/candidates/${c.id}`" class="text-primary hover:underline">{{ c.name }}</RouterLink>
                </td>
                <td class="px-4 py-3 text-muted-foreground">{{ c.position ?? "—" }}</td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded-full text-xs" :class="sourceClass(c.source)">{{ sourceLabel(c.source) }}</span>
                </td>
                <td class="px-4 py-3 text-muted-foreground text-xs">{{ fmtTime(c.updatedAt) }}</td>
                <td class="px-4 py-3">
                  <button @click="openWorkspace(c.id)" class="text-xs text-primary hover:underline mr-3">🤖 AI工作台</button>
                  <button @click="exportCandidate(c.id)" class="text-xs text-muted-foreground hover:underline">📤 导出</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Create Modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showCreate = false">
      <div class="bg-card rounded-xl p-6 w-[480px] max-w-[90vw]">
        <h2 class="text-base font-semibold mb-4">新建候选人</h2>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">姓名 *</label>
            <input v-model="createForm.name" class="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="候选人姓名" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">手机号</label>
            <input v-model="createForm.phone" class="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="13800000000" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">邮箱</label>
            <input v-model="createForm.email" class="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="example@company.com" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">岗位</label>
            <input v-model="createForm.position" class="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="前端工程师" />
          </div>
          <div>
            <label class="text-xs text-muted-foreground mb-1 block">工作年限</label>
            <input v-model.number="createForm.yearsOfExperience" type="number" class="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="5" />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <button @click="showCreate = false" class="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">取消</button>
          <button @click="doCreate" class="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { opencodeApi } from "@/api/opencode";
import { shareApi } from "@/api/share";
import { syncApi } from "@/api/sync";
import { useCandidatesStore } from "@/stores/candidates";
import type { CandidateSource } from "@ims/shared";

const store = useCandidatesStore();
const router = useRouter();
const search = ref("");
const showCreate = ref(false);
const syncStatus = ref<{ enabled: boolean }>({ enabled: false });

const createForm = ref({ name: "", phone: "", email: "", position: "", yearsOfExperience: undefined as number | undefined });

onMounted(async () => {
  await store.fetchList();
  try { syncStatus.value = await syncApi.status(); } catch {}
});

function sourceClass(source: CandidateSource) {
  return source === "local" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700";
}

function sourceLabel(source: CandidateSource) {
  return { local: "本地", remote: "远程", hybrid: "混合" }[source] ?? source;
}

const syncIndicatorClass = computed(() => syncStatus.value.enabled ? "bg-green-500" : "bg-muted");
const syncLabel = computed(() => syncStatus.value.enabled ? "同步中" : "未同步");

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

let searchTimer: ReturnType<typeof setTimeout>;
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => store.fetchList({ search: search.value }), 300);
}

async function doCreate() {
  if (!createForm.value.name.trim()) return;
  await store.create(createForm.value);
  showCreate.value = false;
  Object.assign(createForm.value, { name: "", phone: "", email: "", position: "", yearsOfExperience: undefined });
}

function triggerFileImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.zip";
  input.multiple = true;
  input.onchange = async () => {
    const paths = Array.from(input.files ?? []).map(f => (f as any).path || f.name);
    if (!paths.length) return;
    await import("@/api/import").then(m => m.importApi.create(paths));
    router.push("/import");
  };
  input.click();
}

async function openWorkspace(id: string) {
  try {
    const ws = await opencodeApi.workspace(id);
    window.open(ws.url, "_blank");
  } catch (err: any) {
    alert("启动工作台失败: " + err.message);
  }
}

async function exportCandidate(id: string) {
  try {
    const result = await shareApi.export(id);
    alert(`已导出: ${result.filePath}`);
  } catch (err: any) {
    alert("导出失败: " + err.message);
  }
}
</script>
