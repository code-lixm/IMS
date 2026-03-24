<template>
  <div class="relative">
    <Button
      variant="outline"
      size="sm"
      class="h-8 gap-1.5 text-xs"
      @click="open = !open"
    >
      <Bot class="h-3.5 w-3.5" />
      {{ selectedAgent?.name || "选择 Agent" }}
      <ChevronDown class="h-3 w-3" />
    </Button>

    <Dialog v-model:open="open">
      <template #content>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">选择 Agent</h3>
            <Button variant="outline" size="sm" class="h-7 text-xs" @click="loadAgents">
              <RefreshCw class="h-3 w-3 mr-1" />
              刷新
            </Button>
          </div>

          <ScrollArea class="h-64">
            <div v-if="isLoading" class="flex items-center justify-center py-8">
              <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
            </div>

            <div v-else-if="agents.length === 0" class="py-8 text-center text-sm text-muted-foreground">
              <Bot class="mx-auto mb-2 h-8 w-8 opacity-20" />
              <p>暂无 Agent</p>
              <p class="text-xs">请先创建一个 Agent</p>
            </div>

            <ul v-else class="space-y-1 p-1">
              <li v-for="agent in agents" :key="agent.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  :class="selectedId === agent.id ? 'bg-accent' : ''"
                  @click="selectedId = agent.id"
                >
                  <Bot class="h-4 w-4 shrink-0" />
                  <div class="flex min-w-0 flex-1 flex-col">
                    <div class="flex items-center gap-2">
                      <span class="truncate font-medium">{{ agent.name }}</span>
                      <Badge v-if="agent.isDefault" variant="default" class="text-xs">默认</Badge>
                    </div>
                    <span v-if="agent.description" class="truncate text-xs text-muted-foreground">
                      {{ agent.description }}
                    </span>
                    <div class="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" class="text-xs">
                        {{ agent.mode }}
                      </Badge>
                      <Badge v-if="agent.tools?.length" variant="outline" class="text-xs">
                        {{ agent.tools.length }} tools
                      </Badge>
                    </div>
                  </div>
                  <Check v-if="selectedId === agent.id" class="h-4 w-4 shrink-0" />
                </button>
              </li>
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="open = false">取消</Button>
          <Button :disabled="!selectedId" @click="handleConfirm">确认</Button>
        </DialogFooter>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { Bot, ChevronDown, Check, Loader2, RefreshCw } from "lucide-vue-next"
import { luiApi } from "@/api/lui"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { reportAppError } from "@/lib/errors/normalize"
import Button from "@/components/ui/button.vue"
import Badge from "@/components/ui/badge.vue"
import ScrollArea from "@/components/ui/scroll-area.vue"
import Dialog from "@/components/ui/dialog.vue"
import DialogFooter from "@/components/ui/dialog-footer.vue"

interface AgentSelectorProps {
  modelValue?: string | null
}

interface AgentInfo {
  id: string
  name: string
  description: string | null
  mode: string
  temperature: number
  systemPrompt: string | null
  tools: string[]
  isDefault: boolean
}

const props = defineProps<AgentSelectorProps>()
const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void
  (e: "select", agent: AgentInfo | null): void
}>()

const open = ref(false)
const agents = ref<AgentInfo[]>([])
const selectedId = ref<string | null>(null)
const isLoading = ref(false)
const selectedAgent = ref<AgentInfo | null>(null)
const { notifyError } = useAppNotifications()

watch(() => props.modelValue, async (newVal) => {
  if (newVal && newVal !== selectedAgent.value?.id) {
    await loadAgent(newVal)
  } else if (!newVal) {
    selectedAgent.value = null
  }
}, { immediate: true })

async function loadAgents() {
  isLoading.value = true
  try {
    const data = await luiApi.listAgents()
    agents.value = data.items.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      mode: a.mode,
      temperature: a.temperature,
      systemPrompt: a.systemPrompt,
      tools: a.tools,
      isDefault: a.isDefault,
    }))
    // Set default selection if modelValue not set
    if (!props.modelValue) {
      const defaultAgent = agents.value.find(a => a.isDefault)
      if (defaultAgent) {
        selectedId.value = defaultAgent.id
      }
    }
  } catch (err) {
    notifyError(reportAppError("agent-selector/load", err, {
      title: "加载 Agent 失败",
      fallbackMessage: "暂时无法获取 Agent 列表",
    }))
    agents.value = []
  } finally {
    isLoading.value = false
  }
}

async function loadAgent(id: string) {
  try {
    const data = await luiApi.getAgent(id)
    selectedAgent.value = {
      id: data.id,
      name: data.name,
      description: data.description,
      mode: data.mode,
      temperature: data.temperature,
      systemPrompt: data.systemPrompt,
      tools: data.tools,
      isDefault: data.isDefault,
    }
  } catch (_error) {
    selectedAgent.value = null
  }
}

function handleConfirm() {
  if (selectedId.value) {
    const agent = agents.value.find((a: AgentInfo) => a.id === selectedId.value)
    if (agent) {
      selectedAgent.value = agent
      emit("update:modelValue", agent.id)
      emit("select", agent)
    }
  }
  open.value = false
}

// Load agents when dialog opens
watch(open, (isOpen) => {
  if (isOpen && agents.value.length === 0) {
    loadAgents()
  }
})
</script>
