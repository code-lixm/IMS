<template>
  <AppPageHeader content-class="grid min-h-16 grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_minmax(360px,560px)_1fr] sm:items-center sm:gap-4 sm:px-6 sm:py-0">
      <div class="flex items-center gap-2 shrink-0 sm:min-w-0">
        <AppBrandLink />
      </div>

      <div class="relative w-full sm:mx-auto sm:w-full sm:max-w-[680px]">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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

      <div class="flex items-center justify-end gap-2 shrink-0 sm:min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger as-child class="sm:hidden">
            <Button variant="ghost" size="icon" class="h-9 w-9">
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuItem @click="emit('create')">
              <Plus class="mr-2 h-4 w-4" />
              新建候选人
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isImporting" @click="emit('import')">
              <Upload class="mr-2 h-4 w-4" />
              导入文件
              <Badge v-if="(importActivityCount ?? 0) > 0" variant="secondary" class="ml-auto min-w-5 justify-center px-1.5 py-0">
                {{ importActivityCount }}
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="emit('goto-import')">
              <FileClock class="mr-2 h-4 w-4" />
              导入任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="default" class="hidden gap-2 sm:flex" @click="emit('create')">
          <Plus class="h-4 w-4" />
          新建
        </Button>
        <div class="relative hidden sm:block">
          <Button variant="outline" class="gap-2" :disabled="isImporting" @click="emit('import')">
            <Upload class="h-4 w-4" />
            导入
          </Button>
          <Badge
            v-if="(importActivityCount ?? 0) > 0"
            variant="default"
            class="absolute -right-2 -top-2 min-w-5 justify-center rounded-full px-1.5 py-0"
          >
            {{ importActivityCount }}
          </Badge>
        </div>

        <div class="hidden h-9 items-center gap-1 border-l border-border pl-3 ml-1 lg:flex">
          <Button variant="secondary" size="sm" class="gap-1.5" @click="emit('goto-import')">
            <FileClock class="h-4 w-4" />
            任务
          </Button>
        </div>

        <div class="hidden h-9 items-center gap-2 border-l border-border pl-3 ml-1 lg:flex">
          <span v-if="props.syncEnabled" class="flex items-center gap-1.5 text-xs text-green-600">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
            自动同步中
          </span>
          <Button
            :variant="props.syncError ? 'destructive' : 'secondary'"
            size="sm"
            class="gap-1.5"
            :disabled="props.syncLoading"
            @click="emit('sync')"
          >
            <RefreshCw class="h-4 w-4" :class="props.syncLoading ? 'animate-spin' : ''" />
            同步
          </Button>
        </div>

        <AppUserActions />
      </div>
  </AppPageHeader>
</template>

<script setup lang="ts">
import { FileClock, MoreHorizontal, Plus, RefreshCw, Search, Upload } from "lucide-vue-next";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import Badge from "@/components/ui/badge.vue";
import Button from "@/components/ui/button.vue";
import DropdownMenu from "@/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue";
import DropdownMenuSeparator from "@/components/ui/dropdown-menu-separator.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue";
import Input from "@/components/ui/input.vue";

interface CandidatePageHeaderProps {
  search: string;
  searchSuggestions: string[];
  isImporting?: boolean;
  importActivityCount?: number;
  syncLoading?: boolean;
  syncError?: string | null;
  syncEnabled?: boolean;
}

const props = defineProps<CandidatePageHeaderProps>();

const emit = defineEmits<{
  (e: "update:search", value: string): void;
  (e: "search"): void;
  (e: "create"): void;
  (e: "import"): void;
  (e: "goto-import"): void;
  (e: "sync"): void;
}>();

function handleSearchUpdate(value: string | number) {
  emit("update:search", String(value));
}
</script>
