<template>
  <div :class="cn('flex flex-col items-center justify-center py-12 px-4 text-center', props.class)">
    <!-- 图标 -->
    <div class="mb-4 rounded-full bg-muted p-4">
      <component :is="currentIcon" :class="cn('h-12 w-12 text-muted-foreground', iconClass)" :stroke-width="1.5" />
    </div>

    <!-- 标题 -->
    <h3 class="mb-2 text-lg font-semibold text-foreground">{{ currentTitle }}</h3>

    <!-- 描述 -->
    <p class="mb-6 max-w-sm text-sm text-muted-foreground">{{ currentDescription }}</p>

    <!-- 操作按钮 -->
    <div v-if="showAction" class="flex gap-3">
      <Button v-if="actionText && actionHandler" :variant="actionVariant" @click="actionHandler">
        <component :is="actionIcon" v-if="actionIcon" :class="'h-4 w-4'" :stroke-width="1.5" />
        {{ actionText }}
      </Button>
      <Button v-if="secondaryActionText && secondaryActionHandler" variant="outline" @click="secondaryActionHandler">
        {{ secondaryActionText }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue"
import {
  FileQuestion,
  FolderOpen,
  Inbox,
  Search,
  ServerCrash,
  Users,
  LucideIcon,
} from "lucide-vue-next"
import { cn } from "@/lib/utils"
import Button from "@/components/ui/button.vue"

export type EmptyStateScenario =
  | "candidates" // 候选人列表为空
  | "import" // 导入记录为空
  | "search" // 搜索无结果
  | "folder" // 文件夹为空
  | "server" // 服务器错误
  | "generic" // 通用空状态

interface EmptyStateProps {
  /** 场景类型 */
  scenario?: EmptyStateScenario
  /** 自定义图标组件 */
  icon?: LucideIcon
  /** 自定义图标 class */
  iconClass?: string
  /** 自定义标题 */
  title?: string
  /** 自定义描述 */
  description?: string
  /** 操作按钮文字 */
  actionText?: string
  /** 操作按钮图标 */
  actionIcon?: LucideIcon
  /** 操作按钮 variant */
  actionVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost"
  /** 操作按钮点击事件 */
  actionHandler?: () => void
  /** 次要操作按钮文字 */
  secondaryActionText?: string
  /** 次要操作按钮点击事件 */
  secondaryActionHandler?: () => void
  /** 根元素 class */
  class?: string
}

const props = withDefaults(defineProps<EmptyStateProps>(), {
  scenario: "generic",
  iconClass: "",
  actionVariant: "default",
})

// 场景配置
const scenarioConfig: Record<
  EmptyStateScenario,
  { icon: Component; title: string; description: string }
> = {
  candidates: {
    icon: Users,
    title: "暂无候选人",
    description: "还没有候选人数据，点击下方按钮添加第一位候选人",
  },
  import: {
    icon: FolderOpen,
    title: "暂无导入记录",
    description: "还没有任何导入记录，点击下方按钮开始导入 IMR 文件",
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

const currentIcon = computed(() => props.icon || currentConfig.value.icon)
const currentTitle = computed(() => props.title || currentConfig.value.title)
const currentDescription = computed(() => props.description || currentConfig.value.description)
const showAction = computed(
  () => props.actionText || props.secondaryActionText
)
</script>
