<template>
  <AppPageHeader
    content-class="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-0 px-4 lg:px-6"
  >
    <div class="flex items-center gap-3 shrink-0">
      <AppBrandLink />
      <div class="relative w-full max-w-md">
        <Search
          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          :model-value="search"
          list="candidate-search-suggestions"
          autocomplete="on"
          name="candidate-search"
          class="h-10 pl-10 text-base"
          placeholder="搜索姓名、岗位..."
          @update:model-value="handleSearchUpdate"
          @input="emit('search')"
        />
        <datalist id="candidate-search-suggestions">
          <option
            v-for="suggestion in searchSuggestions"
            :key="suggestion"
            :value="suggestion"
          />
        </datalist>
      </div>
    </div>

    <div class="col-start-3 flex items-center justify-end gap-2 shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger as-child class="md:hidden">
          <Button variant="ghost" size="icon" class="h-9 w-9">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem @click="emit('goto-import')">
            <Download class="mr-2 h-4 w-4" />
            初筛列表
            <Badge
              v-if="(importActivityCount ?? 0) > 0"
              variant="secondary"
              class="ml-auto min-w-5 justify-center rounded-full px-1.5 py-0 text-[11px]"
            >
              {{ importActivityCount }}
            </Badge>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem :disabled="isImporting" @click="emit('import-imr')">
            <Download class="mr-2 h-4 w-4" />
            导入面试信息
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        class="hidden md:flex items-center gap-1 rounded-lg border border-border/60 bg-muted/35 p-1"
      >
        <Button
          variant="secondary"
          size="sm"
          class="gap-2"
          @click="emit('goto-import')"
        >
          <span class="hidden lg:inline">初筛列表</span>
          <Badge
            v-if="(importActivityCount ?? 0) > 0"
            variant="default"
            class="ml-1 min-w-5 justify-center rounded-full px-1.5 py-0 text-[11px]"
          >
            {{ importActivityCount }}
          </Badge>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          class="gap-1.5"
          :disabled="isImporting"
          @click="emit('import-imr')"
        >
          <span class="hidden lg:inline">导入面试信息</span>
        </Button>
      </div>

      <div
        class="hidden h-9 items-center gap-2 border-l border-border/60 pl-3 ml-1 lg:flex"
      >
        <span
          v-if="props.syncEnabled"
          class="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          自动同步中
        </span>
        <Button
          :variant="props.syncError ? 'destructive' : 'outline'"
          size="sm"
          class="gap-1.5 shadow-none"
          :disabled="props.syncLoading || props.resetSyncLoading"
          @click="emit('sync')"
        >
          <RefreshCw
            class="h-4 w-4"
            :class="props.syncLoading ? 'animate-spin' : ''"
          />
          <span class="hidden lg:inline">同步简历</span>
        </Button>
      </div>

      <AppUserActions
        danger-action-label="重新导入"
        :danger-action-disabled="props.syncLoading || props.resetSyncLoading"
        @danger-action="openResetDialog"
      />
    </div>

    <Dialog
      :open="resetDialogOpen"
      content-class="sm:max-w-md"
      @update:open="handleResetDialogOpenChange"
    >
      <template #content>
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-destructive">
            <AlertTriangle class="h-5 w-5" />
            高风险操作：删除全部记录并重新导入
          </DialogTitle>
          <DialogDescription class="pt-2 text-sm leading-6">
            该操作会删除当前所有候选人、面试、简历、AI
            产物、全部会话记录、会话记忆、工作区与分享记录，然后立即从远端重新同步，且不可撤销。
          </DialogDescription>
        </DialogHeader>

        <div
          class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          请确认你已经知晓：当前页面看到的候选人记录会被全部清空，只有远端还能重新同步回来的数据才会恢复；如果远端同步失败，本地会暂时保持为空。
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium">
            请输入 <span class="text-destructive">重新导入</span> 以继续：
          </p>
          <Input
            :model-value="resetConfirmationText"
            placeholder="重新导入"
            :disabled="props.resetSyncLoading"
            @update:model-value="handleResetConfirmationChange"
          />
        </div>

        <DialogFooter class="mt-2 gap-2">
          <Button
            variant="outline"
            :disabled="props.resetSyncLoading"
            @click="resetDialogOpen = false"
          >
            取消
          </Button>
          <Button
            variant="destructive"
            :disabled="!canConfirmReset || props.resetSyncLoading"
            @click="confirmReset"
          >
            {{ props.resetSyncLoading ? "重导入中…" : "确认删除并重新导入" }}
          </Button>
        </DialogFooter>
      </template>
    </Dialog>
  </AppPageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  AlertTriangle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Download,
} from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CandidatePageHeaderProps {
  search: string;
  searchSuggestions: string[];
  isImporting?: boolean;
  importActivityCount?: number;
  syncLoading?: boolean;
  syncError?: string | null;
  syncEnabled?: boolean;
  resetSyncLoading?: boolean;
}

const props = defineProps<CandidatePageHeaderProps>();

const emit = defineEmits<{
  (e: "update:search", value: string): void;
  (e: "search"): void;
  (e: "import"): void;
  (e: "import-imr"): void;
  (e: "goto-import"): void;
  (e: "sync"): void;
  (e: "reset-sync"): void;
}>();

const RESET_CONFIRMATION_TEXT = "重新导入";
const resetDialogOpen = ref(false);
const resetConfirmationText = ref("");
const canConfirmReset = computed(
  () => resetConfirmationText.value.trim() === RESET_CONFIRMATION_TEXT,
);

function handleSearchUpdate(value: string | number) {
  emit("update:search", String(value));
}

function handleResetDialogOpenChange(nextOpen: boolean) {
  resetDialogOpen.value = nextOpen;
  if (!nextOpen) {
    resetConfirmationText.value = "";
  }
}

function handleResetConfirmationChange(value: string | number) {
  resetConfirmationText.value = String(value);
}

function openResetDialog() {
  resetDialogOpen.value = true;
  resetConfirmationText.value = "";
}

function confirmReset() {
  if (!canConfirmReset.value || props.resetSyncLoading) {
    return;
  }

  resetDialogOpen.value = false;
  resetConfirmationText.value = "";
  emit("reset-sync");
}
</script>
