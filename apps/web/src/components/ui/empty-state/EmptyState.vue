<script setup lang="ts">
import type { Component } from "vue"
import { computed } from "vue"
import type { LucideIcon } from "lucide-vue-next"
import {
  FileQuestion,
  FolderOpen,
  Inbox,
  Search,
  ServerCrash,
  Users,
} from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type EmptyStateScenario =
  | "candidates"
  | "import"
  | "search"
  | "folder"
  | "server"
  | "generic"

interface EmptyStateProps {
  actionHandler?: () => void
  actionIcon?: LucideIcon
  actionText?: string
  actionVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost"
  class?: string
  description?: string
  icon?: LucideIcon
  iconClass?: string
  scenario?: EmptyStateScenario
  secondaryActionHandler?: () => void
  secondaryActionText?: string
  title?: string
}

const props = withDefaults(defineProps<EmptyStateProps>(), {
  actionVariant: "default",
  iconClass: "",
  scenario: "generic",
})

const scenarioConfig: Record<
  EmptyStateScenario,
  { icon: Component; title: string; description: string }
> = {
  candidates: {
    icon: Users,
    title: "暂无候选人",
    description: "还没有候选人数据，可以先做简历初筛，或导入已有的面试人信息",
  },
  import: {
    icon: FolderOpen,
    title: "暂无导入记录",
    description: "还没有任何导入记录，点击下方按钮开始导入面试人信息",
  },
  search: {
    icon: Search,
    title: "未找到结果",
    description: "没有找到匹配的候选人，请尝试调整搜索条件",
  },
  folder: {
    icon: Inbox,
    title: "文件夹为空",
    description: "这个文件夹里没有任何内容",
  },
  server: {
    icon: ServerCrash,
    title: "服务器错误",
    description: "服务器出现问题，请稍后再试",
  },
  generic: {
    icon: FileQuestion,
    title: "暂无内容",
    description: "这里还没有任何内容",
  },
}

const currentConfig = computed(() => scenarioConfig[props.scenario])
const currentDescription = computed(() => props.description || currentConfig.value.description)
const currentIcon = computed(() => props.icon || currentConfig.value.icon)
const currentTitle = computed(() => props.title || currentConfig.value.title)
const showAction = computed(() => props.actionText || props.secondaryActionText)
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center py-12 px-4 text-center', props.class)">
    <div class="mb-4 rounded-full bg-muted p-4">
      <component :is="currentIcon" :class="cn('h-12 w-12 text-muted-foreground', iconClass)" :stroke-width="1.5" />
    </div>

    <h3 class="mb-2 text-lg font-semibold text-foreground">{{ currentTitle }}</h3>
    <p class="mb-6 max-w-sm text-sm text-muted-foreground">{{ currentDescription }}</p>

    <div v-if="showAction" class="flex gap-3">
      <Button v-if="actionText && actionHandler" :variant="actionVariant" @click="actionHandler">
        <component :is="actionIcon" v-if="actionIcon" class="h-4 w-4" :stroke-width="1.5" />
        {{ actionText }}
      </Button>
      <Button v-if="secondaryActionText && secondaryActionHandler" variant="outline" @click="secondaryActionHandler">
        {{ secondaryActionText }}
      </Button>
    </div>
  </div>
</template>
