<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 max-w-[13rem] gap-1.5 rounded-md px-2.5 text-xs font-medium shadow-none"
        :class="selectedAgent ? 'text-foreground hover:bg-muted/60' : 'text-muted-foreground hover:bg-muted/60'"
      >
        <Bot class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden truncate sm:inline">{{ selectedAgentTitle }}</span>
        <ChevronsUpDown class="h-3.5 w-3.5 shrink-0 opacity-60" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="end" :side-offset="8" class="w-[24rem] p-0">
      <div class="border-b bg-muted/20 px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bot class="h-4 w-4" />
              </div>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold leading-5">{{ selectedAgentProfile.title }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ selectedAgentProfile.subtitle }}</p>
              </div>
            </div>
            <p class="text-xs leading-5 text-muted-foreground">
              {{ selectedAgentProfile.description }}
            </p>
          </div>
          <Button variant="ghost" size="sm" class="h-7 px-2 text-[11px]" @click="loadAgents">
            <RefreshCw class="mr-1 h-3 w-3" />
            刷新
          </Button>
        </div>

        <div class="mt-3 grid gap-2">
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">工作流技能</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <Badge v-for="skill in selectedAgentProfile.skills" :key="skill" variant="secondary" class="text-[11px]">
                {{ skill }}
              </Badge>
            </div>
          </div>
          <div>
            <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">可用工具</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <Badge v-for="tool in selectedAgentProfile.tools" :key="tool" variant="outline" class="text-[11px]">
                {{ tool }}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-3 px-4 py-3">
        <div class="rounded-lg border border-border/60 bg-background px-3 py-3">
          <div class="flex items-center gap-2">
            <Badge variant="secondary" class="text-[10px]">{{ currentEngineLabel }}</Badge>
            <Badge variant="outline" class="text-[10px]">{{ currentModeLabel }}</Badge>
            <Badge v-if="selectedAgent?.isDefault" variant="default" class="text-[10px]">默认入口</Badge>
          </div>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">
            当前会话将通过这位面试专家统一调度技能链与工具能力，不再暴露底层运行实例。
          </p>
        </div>

        <div class="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-3">
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">当前接入方式</p>
          <div class="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p>入口技能：{{ currentEntrySkill }}</p>
            <p>内部辅助：{{ currentSupportSkills }}</p>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { Bot, ChevronsUpDown, RefreshCw } from "lucide-vue-next"
import { luiApi } from "@/api/lui"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { reportAppError } from "@/lib/errors/normalize"
import Button from "@/components/ui/button.vue"
import Badge from "@/components/ui/badge.vue"
import Popover from "@/components/ui/popover.vue"
import PopoverContent from "@/components/ui/popover-content.vue"
import PopoverTrigger from "@/components/ui/popover-trigger.vue"

interface AgentSelectorProps {
  modelValue?: string | null
}

interface AgentInfo {
  id: string
  name: string
  description: string | null
  engine: "builtin" | "deepagents"
  mode: string
  temperature: number
  systemPrompt: string | null
  tools: string[]
  isDefault: boolean
}

interface AgentProfileView {
  title: string
  subtitle: string
  description: string
  skills: string[]
  tools: string[]
  entrySkill: string
  supportSkills: string[]
}

const INTERVIEW_AGENT_PROFILE: AgentProfileView = {
  title: "面试专家",
  subtitle: "智能面试助手",
  description: "帮你筛选简历、设计面试题、评估候选人",
  skills: ["简历分析", "题目设计", "综合评估"],
  tools: ["读取简历", "生成题目", "输出报告"],
  entrySkill: "interview-orchestrator",
  supportSkills: [],
}

const MODE_LABELS: Record<string, string> = {
  all: "全模式",
  chat: "对话",
  ask: "问答",
  workflow: "工作流",
}

const TOOL_LABELS: Record<string, string> = {
  ensureWorkspace: "建立工作区",
  resolveRound: "轮次解析",
  buildWechatCopyText: "微信摘要",
  scanPdf: "PDF 扫描",
  batchScreenResumes: "批量筛选",
  writeMarkdown: "写入 Markdown",
  sanitizeInterviewNotes: "整理纪要",
}

const TEST_AGENT_PATTERN = /(validation|gate|smoke|test)/i
const CJK_TEXT_PATTERN = /[\u4e00-\u9fff]/

const props = defineProps<AgentSelectorProps>()
// Emit definitions reserved for future use
// const _emit = defineEmits<{
//   (e: "update:modelValue", value: string | null): void
//   (e: "select", agent: AgentInfo | null): void
// }>()

const open = ref(false)
const agents = ref<AgentInfo[]>([])
const isLoading = ref(false)
const selectedAgent = ref<AgentInfo | null>(null)
const { notifyError } = useAppNotifications()

const selectedAgentTitle = computed(() => {
  return INTERVIEW_AGENT_PROFILE.title
})

const selectedAgentProfile = computed<AgentProfileView>(() => {
  if (!selectedAgent.value) {
    return INTERVIEW_AGENT_PROFILE
  }

  return {
    title: INTERVIEW_AGENT_PROFILE.title,
    subtitle: INTERVIEW_AGENT_PROFILE.subtitle,
    description: getAgentSummary(selectedAgent.value),
    skills: INTERVIEW_AGENT_PROFILE.skills,
    tools: getAgentToolLabels(selectedAgent.value),
    entrySkill: INTERVIEW_AGENT_PROFILE.entrySkill,
    supportSkills: INTERVIEW_AGENT_PROFILE.supportSkills,
  }
})

const currentEngineLabel = computed(() => formatEngineLabel(selectedAgent.value?.engine ?? 'builtin'))
const currentModeLabel = computed(() => formatModeLabel(selectedAgent.value?.mode ?? 'workflow'))
const currentEntrySkill = computed(() => selectedAgentProfile.value.entrySkill)
const currentSupportSkills = computed(() => selectedAgentProfile.value.supportSkills.join(' / '))

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
      engine: a.engine ?? 'builtin',
      mode: a.mode,
      temperature: a.temperature,
      systemPrompt: a.systemPrompt,
      tools: a.tools,
      isDefault: a.isDefault,
    }))
    if (!selectedAgent.value) {
      const defaultAgent = agents.value.find(a => a.isDefault) ?? agents.value[0] ?? null
      if (defaultAgent) {
        selectedAgent.value = defaultAgent
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
      engine: data.engine ?? 'builtin',
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

// Load agents when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    loadAgents()
  }
})

function formatModeLabel(mode: string) {
  return MODE_LABELS[mode] ?? mode
}

function formatEngineLabel(engine: AgentInfo["engine"]) {
  return engine === 'deepagents' ? 'Deepagents 引擎' : '内置引擎'
}



function getAgentSummary(agent: AgentInfo) {
  const description = agent.description?.trim()
  if (description && CJK_TEXT_PATTERN.test(description) && !TEST_AGENT_PATTERN.test(description)) {
    return description
  }

  return INTERVIEW_AGENT_PROFILE.description
}

function getAgentToolLabels(agent: AgentInfo) {
  if (!agent.tools.length) {
    return INTERVIEW_AGENT_PROFILE.tools
  }

  return agent.tools.map((tool) => TOOL_LABELS[tool] ?? tool)
}
</script>
