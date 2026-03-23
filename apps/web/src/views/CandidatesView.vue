<template>
  <div class="min-h-screen bg-background">
    <!-- Top Bar -->
    <header class="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="grid min-h-16 grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_minmax(360px,560px)_1fr] sm:items-center sm:gap-4 sm:px-6 sm:py-0">
        <!-- Logo & Title -->
        <div class="flex items-center gap-2 shrink-0 sm:min-w-0">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase class="h-4 w-4 text-primary" />
          </div>
          <h1 class="text-lg font-semibold tracking-tight hidden sm:block">IMS</h1>
        </div>

        <!-- Search -->
        <div class="relative w-full sm:mx-auto sm:w-full sm:max-w-[680px]">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="search"
            list="candidate-search-suggestions"
            autocomplete="on"
            name="candidate-search"
            class="h-10 pl-10 text-base"
            placeholder="搜索姓名、岗位..."
            @input="debouncedSearch"
          />
          <datalist id="candidate-search-suggestions">
            <option
              v-for="suggestion in searchSuggestions"
              :key="suggestion"
              :value="suggestion"
            />
          </datalist>
        </div>

        <!-- Actions - Right aligned -->
        <div class="flex items-center justify-end gap-2 shrink-0 sm:min-w-0">
          <!-- Mobile Menu -->
          <DropdownMenu>
            <DropdownMenuTrigger as-child class="sm:hidden">
              <Button variant="ghost" size="icon" class="h-9 w-9">
                <MoreHorizontal class="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem @click="showCreate = true">
                <Plus class="h-4 w-4 mr-2" />
                新建候选人
              </DropdownMenuItem>
              <DropdownMenuItem @click="triggerFileImport">
                <Upload class="h-4 w-4 mr-2" />
                导入文件
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="router.push('/import')">
                <FileClock class="h-4 w-4 mr-2" />
                导入任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <!-- Desktop Actions -->
          <Button @click="showCreate = true" class="gap-2 hidden sm:flex">
            <Plus class="h-4 w-4" />
            新建
          </Button>
          <Button variant="outline" class="gap-2 hidden sm:flex" @click="triggerFileImport">
            <Upload class="h-4 w-4" />
            导入
          </Button>

          <!-- Desktop Nav -->
          <div class="hidden lg:flex items-center gap-1 border-l border-border pl-3 ml-1 h-9">
            <Button variant="ghost" size="sm" class="gap-1.5" @click="router.push('/import')">
              <FileClock class="h-4 w-4" />
              任务
            </Button>
          </div>

          <AppUserActions />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="p-4 sm:p-6">
      <!-- Loading State -->
      <div v-if="store.loading" class="space-y-3">
        <Card v-for="i in 4" :key="i" class="p-4">
          <div class="flex items-center gap-4">
            <Skeleton class="h-10 w-10 rounded-full" />
            <div class="space-y-2 flex-1">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-3 w-48" />
            </div>
          </div>
        </Card>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="!store.list.length"
        scenario="candidates"
        :action-text="'新建候选人'"
        :action-icon="Plus"
        :action-handler="() => showCreate = true"
        :secondary-action-text="'导入文件'"
        :secondary-action-handler="triggerFileImport"
      />

      <!-- Candidate Cards -->
      <div v-else class="space-y-3">
        <Card
          v-for="c in store.list"
          :key="c.id"
          class="group relative overflow-hidden transition-colors hover:bg-accent/50 cursor-pointer"
          @click="router.push(`/candidates/${c.id}`)"
        >
          <div class="flex items-center gap-4 p-4">
            <!-- Avatar -->
            <div class="shrink-0">
              <div class="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                {{ c.name.charAt(0) }}
              </div>
            </div>

            <!-- Info -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-medium text-foreground truncate">{{ c.name }}</h3>
                <Badge :variant="c.source === 'local' ? 'secondary' : 'default'" class="text-[10px] px-1.5 py-0 h-4">
                  {{ sourceLabel(c.source) }}
                </Badge>
              </div>
              <p class="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                {{ c.position || '暂无岗位信息' }}
                <span v-if="c.yearsOfExperience" class="text-muted-foreground/60">· {{ c.yearsOfExperience }}年经验</span>
              </p>
            </div>

            <!-- Actions -->
            <div class="shrink-0 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                class="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                @click.stop="openWorkspace(c.id)"
              >
                <MessageSquare class="h-4 w-4 sm:mr-1.5" />
                <span class="hidden sm:inline">AI工作台</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                @click.stop="exportCandidate(c.id)"
              >
                <Download class="h-4 w-4 sm:mr-1.5" />
                <span class="hidden sm:inline">导出</span>
              </Button>
            </div>
          </div>
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
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  Briefcase,
  Download,
  FileClock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import { opencodeApi } from "@/api/opencode";
import { shareApi } from "@/api/share";
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
import DropdownMenu from "@/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue";
import DropdownMenuSeparator from "@/components/ui/dropdown-menu-separator.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue";
import Input from "@/components/ui/input.vue";
import Separator from "@/components/ui/separator.vue";
import Skeleton from "@/components/ui/skeleton.vue";
import EmptyState from "@/components/ui/empty-state.vue";
import type { CandidateSource } from "@ims/shared";

const store = useCandidatesStore();
const router = useRouter();
const search = ref("");
const showCreate = ref(false);

const searchSuggestions = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const values = store.list.flatMap((candidate) => [
    candidate.name,
    candidate.position,
    candidate.email,
    candidate.phone,
  ]);

  return Array.from(
    new Set(
      values.filter((value): value is string => {
        if (!value) return false;
        if (!keyword) return true;
        return value.toLowerCase().includes(keyword);
      }),
    ),
  ).slice(0, 8);
});

const createForm = ref({
  name: "",
  phone: "",
  email: "",
  position: "",
  yearsOfExperience: undefined as number | undefined,
});

onMounted(async () => {
  await store.fetchList();
});

function sourceLabel(source: CandidateSource) {
  const map: Record<string, string> = { local: "本地", remote: "远程", hybrid: "混合" };
  return map[source] ?? source;
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
