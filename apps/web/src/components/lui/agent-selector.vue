<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 max-w-[13rem] gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-none"
      >
        <Bot class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden truncate sm:inline">{{ selectedAgentTitle }}</span>
        <ChevronsUpDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="end" :side-offset="8" class="w-[24rem] p-0">
      <div class="flex items-center justify-between border-b px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold leading-5">智能体列表</p>
          <p class="text-xs text-muted-foreground">
            选择当前会话要使用的 Agent。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-[11px]"
          @click="loadAgents"
        >
          <RefreshCw class="mr-1 h-3 w-3" />
          刷新
        </Button>
      </div>

      <div class="max-h-[18rem] space-y-1 overflow-y-auto px-2 py-2">
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors"
          :class="
            agent.id === selectedAgent?.id
              ? 'bg-primary/10 hover:bg-primary/15'
              : 'hover:bg-muted/60'
          "
          @click="selectAgent(agent)"
        >
          <Bot class="h-4 w-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium">
              {{ agent.displayName || agent.name }}
            </p>
            <p class="truncate text-[10px] text-muted-foreground">
              {{ agent.description || "无描述" }}
            </p>
          </div>
          <div class="flex shrink-0 gap-1">
            <Badge v-if="agent.isDefault" variant="default" class="text-[9px]"
              >默认</Badge
            >
          </div>
        </div>
        <p
          v-if="agents.length === 0 && !isLoading"
          class="py-2 text-center text-xs text-muted-foreground"
        >
          暂无 Agent
        </p>
        <p
          v-if="isLoading"
          class="py-2 text-center text-xs text-muted-foreground"
        >
          加载中...
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Bot, ChevronsUpDown, RefreshCw } from "lucide-vue-next";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import type { LuiAgentSelectorProfile } from "@/stores/lui/scenes/types";
import Button from "@/components/ui/button.vue";
import Badge from "@/components/ui/badge.vue";
import Popover from "@/components/ui/popover.vue";
import PopoverContent from "@/components/ui/popover-content.vue";
import PopoverTrigger from "@/components/ui/popover-trigger.vue";

interface AgentSelectorProps {
  modelValue?: string | null;
  profile?: LuiAgentSelectorProfile | null;
}

interface AgentInfo {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  engine: "builtin" | "deepagents";
  mode: string;
  temperature: number;
  systemPrompt: string | null;
  tools: string[];
  isDefault: boolean;
}

const props = defineProps<AgentSelectorProps>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void;
  (e: "select", agent: AgentInfo | null): void;
}>();

const open = ref(false);
const agents = ref<AgentInfo[]>([]);
const isLoading = ref(false);
const selectedAgent = ref<AgentInfo | null>(null);
const { notifyError } = useAppNotifications();

const selectedAgentTitle = computed(() => {
  return (
    selectedAgent.value?.displayName ||
    selectedAgent.value?.name ||
    "选择 Agent"
  );
});

function toAgentInfo(a: Awaited<ReturnType<typeof luiApi.getAgent>>): AgentInfo {
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    description: a.description,
    engine: a.engine ?? "builtin",
    mode: a.mode,
    temperature: a.temperature,
    systemPrompt: a.systemPrompt,
    tools: a.tools,
    isDefault: a.isDefault,
  };
}

function resolveAgentFromCurrentList(agentId?: string | null) {
  if (agentId) {
    return agents.value.find((agent) => agent.id === agentId) ?? null;
  }

  return agents.value.find((agent) => agent.isDefault) ?? agents.value[0] ?? null;
}

function syncSelectedAgentFromList(agentId?: string | null) {
  selectedAgent.value = resolveAgentFromCurrentList(agentId);
}

watch(
  () => props.modelValue,
  async (newVal) => {
    if (newVal && newVal !== selectedAgent.value?.id) {
      const matched = resolveAgentFromCurrentList(newVal);
      if (matched) {
        selectedAgent.value = matched;
        return;
      }
      await loadAgent(newVal);
    } else if (!newVal) {
      syncSelectedAgentFromList(null);
    }
  },
  { immediate: true },
);

async function loadAgents() {
  isLoading.value = true;
  try {
    const data = await luiApi.listAgents();
    agents.value = data.items.map(toAgentInfo);

    const nextSelected = resolveAgentFromCurrentList(props.modelValue);
    selectedAgent.value = nextSelected;

    if (!props.modelValue && nextSelected) {
      emit("update:modelValue", nextSelected.id);
      emit("select", nextSelected);
    }
    if (!nextSelected) {
      selectedAgent.value = null;
    }
  } catch (err) {
    notifyError(
      reportAppError("agent-selector/load", err, {
        title: "加载 Agent 失败",
        fallbackMessage: "暂时无法获取 Agent 列表",
      }),
    );
    agents.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function loadAgent(id: string) {
  try {
    const data = await luiApi.getAgent(id);
    selectedAgent.value = toAgentInfo(data);
  } catch (_error) {
    syncSelectedAgentFromList(id);
  }
}

// Load agents when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    loadAgents();
  }
});

onMounted(() => {
  void loadAgents();
});

function selectAgent(agent: AgentInfo) {
  selectedAgent.value = agent;
  emit("update:modelValue", agent.id);
  emit("select", agent);
  open.value = false;
}
</script>
