<template>
  <AppPageHeader
    content-class="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-4 px-4 lg:px-6"
  >
    <div class="flex items-center gap-3 shrink-0">
      <AppBrandLink />
    </div>

    <div class="relative w-full max-w-[420px]">
      <Search
        class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        :model-value="search"
        list="candidate-search-suggestions"
        autocomplete="on"
        name="candidate-search"
        class="h-9 rounded-md border-0 bg-[#F8FAFD] pl-9 pr-3 text-[13px] text-[#1A1A1A] shadow-none placeholder:text-[#4B5563] dark:bg-white/6 dark:text-slate-100 dark:placeholder:text-slate-400"
        placeholder="搜索姓名、岗位或面试官"
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

    <div class="col-start-3 flex items-center justify-end gap-2 shrink-0">
      <div class="hidden items-center gap-1 rounded-[8px] border border-[#E0E9F3] bg-white px-1 py-1 dark:border-white/10 dark:bg-white/6 lg:flex">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold text-[#4B5563] hover:bg-[#F3F6FB] hover:text-[#1A1A1A] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          @click="emit('goto-import')"
        >
          <span>AI 初筛</span>
          <Badge
            v-if="(importActivityCount ?? 0) > 0"
            variant="secondary"
            class="min-w-5 justify-center rounded-full px-1.5 py-0 text-[11px]"
          >
            {{ importActivityCount }}
          </Badge>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-8 rounded-[6px] px-3 text-[13px] font-semibold text-[#4B5563] hover:bg-[#F3F6FB] hover:text-[#1A1A1A] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
          :disabled="isImporting"
          @click="emit('open-interview-import')"
        >
          导入数据
        </Button>

        <Button
          variant="default"
          size="sm"
          class="relative h-8 gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold shadow-none disabled:opacity-60"
          :disabled="props.syncLoading || props.resetSyncLoading"
          data-sync-status-marker
          @click="emit('sync')"
        >
          <RefreshCw
            class="h-4 w-4"
            :class="props.syncLoading ? 'animate-spin' : ''"
          />
          <span>同步</span>
          <span
            v-if="props.syncError"
            class="pointer-events-none absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#E7000B] ring-2 ring-white dark:ring-slate-800"
            aria-label="同步异常"
          />
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
      content-class="sm:max-w-md max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
      @update:open="handleResetDialogOpenChange"
    >
      <template #content>
        <AppDialogLayout body-class="space-y-4">
          <template #header>
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
          </template>

          <Alert
            variant="destructive"
            class="rounded-[6px] border-0 bg-red-50 text-red-700 dark:bg-red-500/14 dark:text-red-200 [&>svg]:text-red-700 dark:[&>svg]:text-red-200"
          >
            <AlertTriangle class="h-4 w-4" />
            <AlertTitle class="text-[13px] font-semibold">危险操作</AlertTitle>
            <AlertDescription class="text-[12px] leading-5">
              请确认你已经知晓：当前页面看到的候选人记录会被全部清空，只有远端还能重新同步回来的数据才会恢复；如果远端同步失败，本地会暂时保持为空。
            </AlertDescription>
          </Alert>

          <div class="space-y-2 rounded-[6px] bg-white p-4 dark:bg-white/7">
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

          <template #footer>
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
          </template>
        </AppDialogLayout>
      </template>
    </Dialog>
  </AppPageHeader>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertTriangle, RefreshCw, Search } from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { AppDialogLayout } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
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
  (e: "open-interview-import"): void;
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
