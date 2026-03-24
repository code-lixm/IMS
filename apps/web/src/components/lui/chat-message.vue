<template>
  <div class="w-full" :class="message.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
    <div
      class="max-w-[85%] rounded-2xl px-4 py-3 shadow-sm"
      :class="message.role === 'user'
        ? 'bg-blue-500 text-white'
        : message.status === 'error'
          ? 'bg-red-50 text-red-900 border border-red-200'
          : 'bg-gray-100 text-gray-900'"
    >
      <div class="mb-2 flex items-center gap-2 text-xs font-medium opacity-90">
        <User v-if="message.role === 'user'" class="h-4 w-4" />
        <Bot v-else class="h-4 w-4" />
        <span>{{ message.role === 'user' ? '用户' : 'AI' }}</span>
        <span v-if="message.status === 'error'" class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
          错误
        </span>
        <span
          v-else-if="message.status === 'complete'"
          class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700"
        >
          完成
        </span>
        <span
          v-if="message.status === 'streaming'"
          class="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700"
        >
          <Loader2 class="h-3 w-3 animate-spin" />
          生成中
        </span>
      </div>

      <div class="prose prose-sm max-w-none" :class="message.role === 'user' ? 'prose-invert' : ''" v-html="renderMarkdown(displayedContent)" />

      <span v-if="message.status === 'streaming'" class="ml-1 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />

      <div v-if="message.reasoning" class="mt-3 rounded-lg border border-gray-200/70 bg-white/60 p-2 text-sm text-gray-700">
        <button
          type="button"
          class="text-xs font-medium text-gray-600 hover:text-gray-900"
          @click="reasoningOpen = !reasoningOpen"
        >
          {{ reasoningOpen ? '收起思考' : '展开思考' }}
        </button>
        <div v-if="reasoningOpen" class="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs leading-relaxed">
          {{ message.reasoning }}
        </div>
      </div>

      <div v-if="message.tools?.length" class="mt-3 space-y-2">
        <div
          v-for="(tool, index) in message.tools"
          :key="`${message.id}-tool-${index}`"
          class="rounded-lg border border-gray-200 bg-white/70 p-2"
        >
          <p class="text-xs font-semibold text-gray-700">Tool 调用 {{ index + 1 }}</p>
          <pre class="mt-1 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-600">{{ stringifyTool(tool) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Bot, Loader2, User } from "lucide-vue-next"
import { renderSafeMarkdown } from "@/lib/render/render-safe-markdown"

interface ChatMessageData {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  reasoning?: string | null
  tools?: unknown[] | null
  status?: "streaming" | "error" | "complete"
}

interface ChatMessageProps {
  message: ChatMessageData
}

const { message } = defineProps<ChatMessageProps>()

const reasoningOpen = ref(false)
const typedLength = ref(0)

const displayedContent = computed(() => {
  if (message.status !== "streaming") {
    return message.content
  }
  return message.content.slice(0, typedLength.value)
})

const renderMarkdown = renderSafeMarkdown

const stringifyTool = (tool: unknown): string => {
  if (typeof tool === "string") {
    return tool
  }

  try {
    return JSON.stringify(tool, null, 2)
  } catch (_error) {
    return String(tool)
  }
}

watch(
  () => message.reasoning,
  () => {
    reasoningOpen.value = false
  },
  { immediate: true }
)

watch(
  () => message.status,
  (status, _oldStatus, onCleanup) => {
    if (status !== "streaming") {
      typedLength.value = message.content.length
      return
    }

    typedLength.value = 0
    const timer = window.setInterval(() => {
      if (typedLength.value >= message.content.length) {
        window.clearInterval(timer)
        return
      }

      typedLength.value += 1
    }, 12)

    onCleanup(() => window.clearInterval(timer))
  },
  { immediate: true }
)

watch(
  () => message.content,
  (nextContent) => {
    if (message.status !== "streaming") {
      typedLength.value = nextContent.length
      return
    }

    typedLength.value = Math.min(typedLength.value + 8, nextContent.length)
  },
  { immediate: true }
)
</script>
