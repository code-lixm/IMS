<template>
  <div class="flex min-h-screen bg-background">
    <!-- Sidebar -->
    <aside class="flex w-52 shrink-0 flex-col border-r border-border bg-muted/20">
      <div class="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold text-sm">
        <Briefcase class="h-4 w-4 text-muted-foreground" />
        面试管理
      </div>
      <nav class="flex-1 p-2 space-y-0.5">
        <RouterLink
          to="/candidates"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <User class="h-4 w-4" />
          候选人
        </RouterLink>
        <RouterLink
          to="/import"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <Upload class="h-4 w-4" />
          导入任务
        </RouterLink>
        <RouterLink
          to="/settings"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
          active-class="bg-accent font-medium text-accent-foreground"
        >
          <Settings class="h-4 w-4" />
          设置
        </RouterLink>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex flex-1 flex-col min-w-0">
      <!-- Header -->
      <header class="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-muted/10 px-6">
        <h1 class="text-sm font-medium">候选人</h1>
        <div class="flex-1" />
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span class="h-1.5 w-1.5 rounded-full" :class="syncIndicatorClass" />
          {{ syncLabel }}
        </div>
      </header>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-6 space-y-4">
        <!-- Search & Actions -->
        <Card class="p-4">
          <div class="flex gap-3">
            <div class="relative flex-1">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="search"
                class="pl-9"
                placeholder="搜索姓名、岗位、手机、邮箱…"
                @input="debouncedSearch"
              />
            </div>
            <Button @click="showCreate = true" class="gap-2">
              <Plus class="h-4 w-4" />
              新建候选人
            </Button>
            <Button variant="outline" class="gap-2" @click="triggerFileImport">
              <Upload class="h-4 w-4" />
              导入文件
            </Button>
          </div>
        </Card>

        <!-- Table -->
        <Card>
          <!-- Loading skeleton -->
          <div v-if="store.loading" class="p-6 space-y-3">
            <Skeleton v-for="i in 4" :key="i" class="h-4 w-full rounded-md" />
          </div>

          <!-- Empty state -->
          <div v-else-if="!store.list.length" class="py-20 text-center text-sm text-muted-foreground">
            暂无候选人
          </div>

          <!-- Table -->
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>岗位</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead class="w-[200px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="c in store.list" :key="c.id">
                <TableCell>
                  <RouterLink
                    :to="`/candidates/${c.id}`"
                    class="font-medium text-foreground hover:underline"
                  >
                    {{ c.name }}
                  </RouterLink>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ c.position ?? "—" }}
                </TableCell>
                <TableCell>
                  <Badge :variant="c.source === 'local' ? 'secondary' : 'default'">
                    {{ sourceLabel(c.source) }}
                  </Badge>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground">
                  {{ fmtTime(c.updatedAt) }}
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-7 gap-1.5 px-2 text-muted-foreground"
                      @click="openWorkspace(c.id)"
                    >
                      <MessageSquare class="h-3.5 w-3.5" />
                      AI 工作台
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-7 gap-1.5 px-2 text-muted-foreground"
                      @click="exportCandidate(c.id)"
                    >
                      <Download class="h-3.5 w-3.5" />
                      导出
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </main>

    <!-- Create Candidate Dialog -->
    <Dialog v-model:open="showCreate">
      <template #content>
        <DialogHeader>
          <DialogTitle>新建候选人</DialogTitle>
          <DialogDescription>填写基础信息后将自动创建候选人。</DialogDescription>
        </DialogHeader>
        <Separator class="my-4" />
        <div class="space-y-3">
          <div class="space-y-1.5">
            <label class="text-xs text-muted-foreground">姓名</label>
            <Input v-model="createForm.name" placeholder="候选人姓名" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs text-muted-foreground">手机号</label>
              <Input v-model="createForm.phone" placeholder="13800000000" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-muted-foreground">邮箱</label>
              <Input v-model="createForm.email" placeholder="example@company.com" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-xs text-muted-foreground">岗位</label>
              <Input v-model="createForm.position" placeholder="前端工程师" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-muted-foreground">工作年限</label>
              <Input
                v-model.number="createForm.yearsOfExperience"
                type="number"
                placeholder="5"
              />
            </div>
          </div>
        </div>
        <DialogFooter class="mt-6">
          <DialogClose as-child>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button @click="doCreate">创建</Button>
        </DialogFooter>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  Briefcase,
  Download,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Upload,
  User,
} from "lucide-vue-next";
import { opencodeApi } from "@/api/opencode";
import { shareApi } from "@/api/share";
import { syncApi } from "@/api/sync";
import { useCandidatesStore } from "@/stores/candidates";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogClose from "@/components/ui/dialog-close.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import Input from "@/components/ui/input.vue";
import Separator from "@/components/ui/separator.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import Table from "@/components/ui/table.vue";
import TableBody from "@/components/ui/table-body.vue";
import TableCell from "@/components/ui/table-cell.vue";
import TableHead from "@/components/ui/table-head.vue";
import TableHeader from "@/components/ui/table-header.vue";
import TableRow from "@/components/ui/table-row.vue";
import type { CandidateSource } from "@ims/shared";

const store = useCandidatesStore();
const router = useRouter();
const search = ref("");
const showCreate = ref(false);
const syncStatus = ref<{ enabled: boolean }>({ enabled: false });

const createForm = ref({
  name: "",
  phone: "",
  email: "",
  position: "",
  yearsOfExperience: undefined as number | undefined,
});

onMounted(async () => {
  await store.fetchList();
  try {
    syncStatus.value = await syncApi.status();
  } catch {
    // service not ready
  }
});

function sourceLabel(source: CandidateSource) {
  const map: Record<string, string> = { local: "本地", remote: "远程", hybrid: "混合" };
  return map[source] ?? source;
}

const syncIndicatorClass = computed(
  () => (syncStatus.value.enabled ? "bg-green-500" : "bg-muted")
);
const syncLabel = computed(() =>
  syncStatus.value.enabled ? "同步中" : "未同步"
);

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let searchTimer: ReturnType<typeof setTimeout>;
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => store.fetchList({ search: search.value }),
    300
  );
}

async function doCreate() {
  if (!createForm.value.name.trim()) return;
  await store.create(createForm.value);
  showCreate.value = false;
  Object.assign(createForm.value, {
    name: "",
    phone: "",
    email: "",
    position: "",
    yearsOfExperience: undefined,
  });
}

function triggerFileImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.zip";
  input.multiple = true;
  input.onchange = async () => {
    const paths = Array.from(input.files ?? []).map((file) => {
      const fileWithPath = file as File & { path?: string };
      return fileWithPath.path ?? file.name;
    });
    if (!paths.length) return;
    await import("@/api/import").then((m) => m.importApi.create(paths));
    router.push("/import");
  };
  input.click();
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "未知错误";
}

async function openWorkspace(id: string) {
  try {
    const ws = await opencodeApi.workspace(id);
    window.open(ws.url, "_blank");
  } catch (err: unknown) {
    alert("启动工作台失败: " + errorMessage(err));
  }
}

async function exportCandidate(id: string) {
  try {
    const result = await shareApi.export(id);
    alert(`已导出: ${result.filePath}`);
  } catch (err: unknown) {
    alert("导出失败: " + errorMessage(err));
  }
}
</script>
