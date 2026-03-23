<template>
  <div class="flex items-center gap-2">
    <div
      role="button"
      tabindex="0"
      class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
      @click="toggleTheme"
      @keydown.enter.prevent="toggleTheme"
      @keydown.space.prevent="toggleTheme"
    >
      <div
        :class="isDark ? 'i-lucide-sun-medium' : 'i-lucide-moon-star'"
        class="h-4 w-4"
      />
    </div>

    <DropdownMenu v-model:open="menuOpen">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="relative flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-primary/10 text-sm font-semibold text-primary transition-all hover:scale-[1.02] hover:bg-primary/15 hover:shadow-sm"
        >
          <img
            v-if="userAvatarUrl"
            :src="userAvatarUrl"
            :alt="displayName"
            class="h-8 w-8 rounded-md object-cover"
          />
          <span
            v-else
            class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/5"
          >
            {{ userInitial }}
          </span>
          <span
            class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border border-background"
            :class="
              isAuthenticated ? 'bg-emerald-500' : 'bg-muted-foreground/40'
            "
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-0 w-fit overflow-visible">
        <div class="px-2 py-2">
          <p class="text-sm font-medium">{{ displayName }}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="router.push('/settings')">
          <div class="i-lucide-settings-2 h-4 w-4" />
          系统设置
        </DropdownMenuItem>
        <DropdownMenuItem @click="router.push('/import')">
          <div class="i-lucide-files h-4 w-4" />
          导入任务
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="mt-1 bg-destructive text-destructive-foreground focus:bg-destructive/90 focus:text-destructive-foreground data-[highlighted]:bg-destructive/90 data-[highlighted]:text-destructive-foreground"
          @click="handleLogout"
        >
          <div class="i-lucide-log-out h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useTheme } from "@/composables/use-theme";
import { useAuthStore } from "@/stores/auth";
import DropdownMenu from "@/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue";
import DropdownMenuSeparator from "@/components/ui/dropdown-menu-separator.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue";

const router = useRouter();
const authStore = useAuthStore();
const { isDark, toggleTheme } = useTheme();
const menuOpen = ref(false);

onMounted(() => {
  void authStore.checkStatus();
});

const isAuthenticated = computed(() => authStore.status === "valid");
const displayName = computed(
  () => authStore.user?.name || authStore.user?.email || "未登录",
);
const userInitial = computed(() => {
  const source = displayName.value.trim();
  return source ? source.charAt(source.length - 1).toUpperCase() : "我";
});
const userAvatarUrl = computed<string | null>(() => null);

async function handleLogout() {
  menuOpen.value = false;
  await authStore.logout().catch(() => undefined);
  await router.replace("/login").catch(() => undefined);
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}
</script>
