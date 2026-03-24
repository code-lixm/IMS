<template>
  <AppPageShell>
    <AppPageHeader>
        <AppBrandLink />
        <div class="flex-1" />
        <div class="flex items-center gap-2 shrink-0">
          <Button variant="outline" class="gap-2 hidden sm:flex" @click="$router.push('/candidates')">
            <User class="h-4 w-4" />
            候选人
          </Button>
          <Button variant="outline" class="gap-2 hidden sm:flex" @click="$router.push('/import')">
            <Upload class="h-4 w-4" />
            任务
          </Button>
          <AppUserActions />
        </div>
    </AppPageHeader>

    <AppPageContent class="space-y-4">
        <!-- Account -->
        <Card class="p-5">
          <h2 class="text-sm font-semibold mb-4">账户</h2>
          <Separator class="mb-4" />
          <div v-if="authStore.status === 'valid'" class="flex items-center gap-3">
            <div class="flex items-center gap-2">
              <Badge variant="secondary" class="gap-1.5">
                <CheckCircle class="h-3 w-3" />
                已登录
              </Badge>
              <span class="text-sm">{{ authStore.user?.name }}</span>
            </div>
            <Button variant="outline" size="sm" class="ml-auto gap-1.5" @click="logout">
              <Power class="h-3.5 w-3.5" />
              退出登录
            </Button>
          </div>
          <div v-else class="flex items-center gap-3">
            <Badge variant="outline" class="gap-1.5 text-muted-foreground">
              <XCircle class="h-3 w-3" />
              未登录
            </Badge>
            <Button size="sm" class="ml-auto" @click="$router.push('/login')">登录</Button>
          </div>
        </Card>

        <!-- Sync -->
        <Card class="p-5">
          <h2 class="text-sm font-semibold mb-4">同步</h2>
          <Separator class="mb-4" />
          <div class="flex items-center gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                v-model="syncEnabled"
                class="rounded border-border"
                @change="toggleSync"
              />
              开启自动同步
            </label>
            <span v-if="syncStore.status.enabled" class="flex items-center gap-1 text-xs text-muted-foreground">
              <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
              同步中
            </span>
          </div>
          <div class="text-xs text-muted-foreground mb-3">
            <p v-if="syncStore.status.lastSyncAt">
              上次同步: {{ fmtTime(syncStore.status.lastSyncAt) }}
            </p>
            <p v-else>从未同步</p>
            <p v-if="syncStore.status.lastError" class="text-destructive mt-1">
              {{ syncStore.status.lastError }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="syncStore.loading"
            class="gap-1.5"
            @click="runSyncNow"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="syncStore.loading ? 'animate-spin' : ''" />
            立即同步
          </Button>
        </Card>

        <!-- Theme -->
        <Card class="p-5">
          <h2 class="text-sm font-semibold mb-4">外观</h2>
          <Separator class="mb-4" />

          <div class="space-y-5">
            <!-- 颜色 -->
            <div>
              <p class="text-xs text-muted-foreground mb-1">主题</p>
              <p class="mb-3 text-xs text-muted-foreground/80">使用 shadcn 内置的克制中性色方案，默认黑白极简风格。</p>
              <div class="grid grid-cols-2 gap-2 xl:grid-cols-4">
                <button
                  v-for="c in themeColors"
                  :key="c"
                  :class="[
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors',
                    currentColor === c
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                  ]"
                  @click="setColor(c)"
                >
                  <span
                    class="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
                    :style="{ background: colorDotStyle[c] }"
                  />
                  <span class="flex flex-col items-start leading-none">
                    <span>{{ colorLabel[c] }}</span>
                    <span class="mt-1 text-[11px] opacity-70">{{ colorHint[c] }}</span>
                  </span>
                </button>
              </div>
            </div>

            <!-- 圆角 -->
            <div>
              <p class="text-xs text-muted-foreground mb-3">圆角</p>
              <div class="flex gap-2">
                <button
                  v-for="r in themeRadii"
                  :key="r"
                  :class="[
                    'flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    currentRadius === r
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                  ]"
                  @click="setRadius(r)"
                >
                  {{ r === 0 ? '无' : `${r}rem` }}
                </button>
              </div>
            </div>
          </div>
        </Card>

        <!-- OpenCode -->
        <Card class="p-5">
          <h2 class="text-sm font-semibold mb-4">OpenCode AI 引擎</h2>
          <Separator class="mb-4" />
          <div class="flex items-center gap-3 mb-4">
            <Badge :variant="opencodeStatus.running ? 'default' : 'outline'" class="gap-1.5">
              <component :is="opencodeStatus.running ? Wifi : WifiOff" class="h-3 w-3" />
              {{ opencodeStatus.running ? "运行中" : "未运行" }}
            </Badge>
            <span v-if="opencodeStatus.running" class="text-xs text-muted-foreground">
              {{ opencodeStatus.baseUrl }}
            </span>
          </div>
          <div class="flex gap-2">
            <Button
              v-if="!opencodeStatus.running"
              size="sm"
              class="gap-1.5"
              @click="startOpencode"
            >
              <Power class="h-3.5 w-3.5" />
              启动引擎
            </Button>
            <Button
              v-else
              variant="outline"
              size="sm"
              class="gap-1.5"
              @click="stopOpencode"
            >
              <Power class="h-3.5 w-3.5" />
              停止引擎
            </Button>
          </div>
        </Card>
      </AppPageContent>
  </AppPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  CheckCircle,
  Power,
  RefreshCw,
  Upload,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useSyncStore } from "@/stores/sync";
import { opencodeApi } from "@/api/opencode";
import { useTheme } from "@/composables/use-theme";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import Card from "@/components/ui/card.vue";
import Separator from "@/components/ui/separator.vue";

const authStore = useAuthStore();
const syncStore = useSyncStore();
const { color: currentColor, radius: currentRadius, setColor, setRadius, AVAILABLE_COLORS: themeColors, AVAILABLE_RADII: themeRadii } = useTheme();
const syncEnabled = ref(false);
const opencodeStatus = ref({ running: false, baseUrl: "", host: "", port: 0 });

const colorLabel: Record<string, string> = {
  neutral: "黑白",
  zinc: "锌灰",
  stone: "暖灰",
  slate: "板岩",
};

const colorHint: Record<string, string> = {
  neutral: "极简黑白",
  zinc: "冷调灰黑",
  stone: "暖调米灰",
  slate: "蓝灰中性",
};

const colorDotStyle: Record<string, string> = {
  neutral: "linear-gradient(135deg, hsl(0 0% 9%) 0%, hsl(0 0% 85%) 100%)",
  zinc: "linear-gradient(135deg, hsl(240 5.9% 10%) 0%, hsl(240 5% 55%) 100%)",
  stone: "linear-gradient(135deg, hsl(24 9.8% 10%) 0%, hsl(30 18% 70%) 100%)",
  slate: "linear-gradient(135deg, hsl(222.2 47.4% 11.2%) 0%, hsl(214 30% 55%) 100%)",
};

onMounted(async () => {
  await authStore.checkStatus();
  await syncStore.fetchStatus();
  syncEnabled.value = syncStore.status.enabled;
  try {
    opencodeStatus.value = await opencodeApi.status();
  } catch (_error) {
    // service not ready
  }
});

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function logout() {
  await authStore.logout();
}

async function toggleSync() {
  await syncStore.toggle(syncEnabled.value);
}

async function runSyncNow() {
  await syncStore.runNow();
}

async function startOpencode() {
  opencodeStatus.value = await opencodeApi.start();
}

async function stopOpencode() {
  await opencodeApi.stop();
  opencodeStatus.value.running = false;
}
</script>
