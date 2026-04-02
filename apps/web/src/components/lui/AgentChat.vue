<template>
  <div class="agent-chat flex h-full flex-col">
    <!-- Agent 工具栏 -->
    <div class="agent-toolbar border-b p-4">
      <div class="flex items-center gap-4">
        <AgentSelector
          v-model="currentAgentId"
          :agents="allAgents"
          :disabled="isStreaming"
        />
        
        <div class="flex items-center gap-2">
          <Switch
            :checked="isSwarmMode"
            @update:checked="toggleSwarmMode"
            :disabled="isStreaming"
          />
          <Label class="text-sm">多 Agent 协作</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle class="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>启用后，Agent 可根据任务需要自动移交给其他专业 Agent</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <ActiveAgentIndicator
          v-if="activeSwarmAgent"
          :agent="activeSwarmAgent"
        />
      </div>
    </div>
    
    <!-- 消息列表 -->
    <div class="messages-container flex-1 overflow-y-auto p-4">
      <div v-if="messages.length === 0" class="flex h-full items-center justify-center">
        <div class="text-center text-muted-foreground">
          <Bot class="mx-auto mb-4 h-12 w-12 opacity-20" />
          <p class="text-sm">开始与 {{ currentAgent?.name || 'Agent' }} 对话</p>
        </div>
      </div>
      
      <div v-else class="space-y-4">
        <template v-for="(message, index) in messages" :key="index">
          <!-- Handoff 指示器 -->
          <HandoffBanner
            v-if="message.handoffInfo"
            :from="message.handoffInfo.from"
            :to="message.handoffInfo.to"
            :reason="message.handoffInfo.reason"
          />
          
          <!-- 消息内容 -->
          <div
            :class="[
              'flex gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            ]"
          >
            <div
              :class="[
                'max-w-[80%] rounded-lg px-4 py-2',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              ]"
            >
              <!-- reasoning 折叠面板 -->
              <Collapsible
                v-if="message.reasoning"
                v-model:open="reasoningOpenStates[index]"
                class="mb-2"
              >
                <CollapsibleTrigger class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Brain class="h-3 w-3" />
                  <span>思考过程</span>
                  <ChevronDown class="h-3 w-3 transition-transform" :class="{ 'rotate-180': reasoningOpenStates[index] }" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div class="mt-2 p-2 rounded bg-background/50 text-xs text-muted-foreground whitespace-pre-wrap">
                    {{ message.reasoning }}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              
              <div class="text-sm whitespace-pre-wrap">{{ message.content }}</div>
              <div v-if="message.agentId" class="mt-1 text-xs opacity-60">
                {{ getAgentName(message.agentId) }}
              </div>
            </div>
          </div>
        </template>
        
        <!-- 流式内容 -->
        <div v-if="streamingContent || streamingReasoning" class="flex gap-3 justify-start">
          <div class="max-w-[80%] rounded-lg bg-muted px-4 py-2">
            <!-- 流式 reasoning 折叠面板 -->
            <Collapsible
              v-if="streamingReasoning"
              v-model:open="reasoningOpenStates[-1]"
              class="mb-2"
            >
              <CollapsibleTrigger class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                <Brain class="h-3 w-3" />
                <span>思考过程</span>
                <ChevronDown class="h-3 w-3 transition-transform" :class="{ 'rotate-180': reasoningOpenStates[-1] }" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div class="mt-2 p-2 rounded bg-background/50 text-xs text-muted-foreground whitespace-pre-wrap">
                  {{ streamingReasoning }}
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <div class="text-sm whitespace-pre-wrap">{{ streamingContent }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 输入框 -->
    <div class="input-container border-t p-4">
      <div class="flex gap-2">
        <Textarea
          v-model="inputMessage"
          :disabled="isStreaming"
          :placeholder="inputPlaceholder"
          class="min-h-[60px] flex-1 resize-none"
          @keydown.enter.exact.prevent="handleSend"
        />
        <div class="flex flex-col gap-2">
          <Button
            v-if="!isStreaming"
            :disabled="!inputMessage.trim()"
            @click="handleSend"
          >
            <Send class="h-4 w-4" />
          </Button>
          <Button
            v-else
            variant="destructive"
            @click="handleStop"
          >
            <Square class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Bot, HelpCircle, Send, Square, Brain, ChevronDown } from 'lucide-vue-next';
import { agentHost } from '@/agents/host';
import { useAgentContext } from '@/agents/context-bridge';
import { useAgentStore } from '@/stores/agent';
import type { AgentManifest } from '@/agents/host';
import AgentSelector from './AgentSelector.vue';
import HandoffBanner from './HandoffBanner.vue';
import ActiveAgentIndicator from './ActiveAgentIndicator.vue';
import Button from '@/components/ui/button.vue';
import Textarea from '@/components/ui/textarea.vue';
import Switch from '@/components/ui/switch.vue';
import Label from '@/components/ui/label.vue';
import Tooltip from '@/components/ui/tooltip.vue';
import TooltipProvider from '@/components/ui/tooltip-provider.vue';
import TooltipTrigger from '@/components/ui/tooltip-trigger.vue';
import TooltipContent from '@/components/ui/tooltip-content.vue';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

// ==================== State ====================

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  agentId?: string;
  handoffInfo?: {
    from: string;
    to: string;
    reason: string;
  };
}

const messages = ref<Message[]>([]);
const inputMessage = ref('');
const streamingContent = ref('');
const streamingReasoning = ref('');
const isStreaming = ref(false);
const activeSwarmAgent = ref<AgentManifest | null>(null);

// 用于中断流式响应
const abortController = ref<AbortController | null>(null);

// 管理 reasoning 展开状态
const reasoningOpenStates = ref<Record<number, boolean>>({});

// ==================== Store ====================

const agentStore = useAgentStore();
const currentAgentId = computed({
  get: () => agentStore.currentAgentId,
  set: (value) => agentStore.setCurrentAgent(value),
});
const isSwarmMode = computed(() => agentStore.isSwarmMode);
const allAgents = computed(() => agentStore.allAgents);
const currentAgent = computed(() => agentStore.currentAgent);

// ==================== Computed ====================

const inputPlaceholder = computed(() => {
  if (currentAgent.value) {
    return `给 ${currentAgent.value.name} 发送消息...`;
  }
  return '输入消息...';
});

// ==================== Context ====================

// 自动同步 IMS 状态到 Agent 上下文
const agentContext = useAgentContext();

// ==================== Methods ====================

function getAgentName(agentId: string): string {
  const agent = agentHost.getManifest(agentId);
  return agent?.name || agentId;
}

async function handleSend() {
  if (!inputMessage.value.trim() || isStreaming.value) return;
  
  const userMessage = inputMessage.value;
  inputMessage.value = '';
  
  // 添加用户消息
  messages.value.push({
    role: 'user',
    content: userMessage,
  });
  
  // 开始流式响应
  isStreaming.value = true;
  streamingContent.value = '';
  streamingReasoning.value = '';
  abortController.value = new AbortController();
  
  try {
    if (isSwarmMode.value) {
      await runSwarm(userMessage);
    } else {
      await runSingleAgent(userMessage);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // 用户主动中断
      messages.value.push({
        role: 'assistant',
        content: streamingContent.value + '\n\n[已中断]',
        reasoning: streamingReasoning.value || undefined,
        agentId: currentAgentId.value,
      });
    } else {
      messages.value.push({
        role: 'system',
        content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
      });
    }
  } finally {
    isStreaming.value = false;
    streamingContent.value = '';
    streamingReasoning.value = '';
    abortController.value = null;
    activeSwarmAgent.value = null;
  }
}

async function runSingleAgent(message: string) {
  const stream = agentHost.stream(
    currentAgentId.value,
    message,
    agentContext.value
  );
  
  for await (const chunk of stream) {
    if (abortController.value?.signal.aborted) {
      throw new Error('AbortError');
    }
    streamingContent.value += chunk;
  }
  
  // 完成，保存消息（包含 reasoning）
  messages.value.push({
    role: 'assistant',
    content: streamingContent.value,
    reasoning: streamingReasoning.value || undefined,
    agentId: currentAgentId.value,
  });
}

async function runSwarm(message: string) {
  // 当前简化实现：直接执行单个 Agent
  // TODO: 后续需要实现真正的 Swarm 模式
  console.warn('Swarm mode is not fully implemented yet, falling back to single agent execution');
  await runSingleAgent(message);
}

function handleStop() {
  abortController.value?.abort();
}

function toggleSwarmMode() {
  agentStore.toggleSwarmMode();
}

// ==================== 自动展开流式消息的 reasoning ====================

watch(streamingReasoning, (newVal) => {
  if (newVal && isStreaming.value) {
    // 流式消息自动展开 reasoning，使用 -1 作为流式消息的索引
    reasoningOpenStates.value[-1] = true;
  }
});

// ==================== 监听候选人变化 ====================

// 当切换候选人时，自动添加系统上下文
watch(() => agentContext.value.currentCandidate, (candidate) => {
  if (candidate && messages.value.length > 0) {
    messages.value.push({
      role: 'system',
      content: `已切换到候选人: ${candidate.name}`,
    });
  }
}, { immediate: true });
</script>