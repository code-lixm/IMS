<template>
  <div class="flex h-screen w-full overflow-hidden bg-background">
    <!-- 左边栏：会话列表 -->
    <div class="w-72 shrink-0 border-r">
      <ConversationList
        :conversations="store.conversations"
        :selected-id="store.selectedId"
        @select="onConversationSelect"
        @create="onConversationCreate"
        @delete="onConversationDelete"
      />
    </div>

    <!-- 中间：对话区域 -->
    <main class="flex flex-1 flex-col overflow-hidden">
      <!-- 头部：候选人选择器 -->
      <div class="flex items-center justify-between border-b px-4 py-2">
        <div class="text-sm text-muted-foreground">
          <span v-if="store.selectedConversation">
            {{ store.selectedConversation.title }}
          </span>
          <span v-else>选择或创建一个会话</span>
        </div>
        <CandidateSelector
          :model-value="store.selectedConversation?.candidateId ?? null"
          @select="onCandidateSelect"
        />
      </div>

      <!-- 消息列表 -->
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="store.currentMessages.length === 0" class="flex h-full items-center justify-center">
          <div class="text-center text-muted-foreground">
            <Bot class="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p class="text-sm">开始一个新对话</p>
            <p class="mt-1 text-xs">输入消息或使用 / 命令</p>
          </div>
        </div>

        <div v-else class="space-y-4">
          <ChatMessage
            v-for="message in store.currentMessages"
            :key="message.id"
            :message="message"
          />
        </div>
      </div>

      <!-- AI Gateway Toolbar -->
      <AIGatewayToolbar
        :selected-agent-id="store.selectedAgentId"
        :providers="store.providers"
        :selected-model-id="store.selectedModelId"
        :authorized-providers="authorizedProviders"
        :temperature="temperature"
        @select-agent="onSelectAgent"
        @create-agent="onCreateAgent"
        @select-model="onSelectModel"
        @authorize="onAuthorizeProvider"
        @update:temperature="onTemperatureChange"
      />

      <!-- 任务队列指示器 -->
      <TaskQueueIndicator :tasks="store.tasks" />

      <!-- 底部输入框 -->
      <div class="border-t p-4">
        <PromptInput
          v-model="inputText"
          placeholder="输入消息，输入 / 使用命令"
          :disabled="store.isLoadingMessages"
          @send="onSend"
          @select-command="onSelectCommand"
          @file-upload="onFileUpload"
        />
      </div>

      <!-- 授权对话框 -->
      <AuthDialog
        v-model="showAuthDialog"
        :provider="authProvider"
        :provider-name="authProviderName"
        @authorize="onAuthConfirm"
      />
    </main>

    <!-- 右边栏：文件资源 -->
    <div class="w-72 shrink-0 border-l p-4">
      <FileResources />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bot } from 'lucide-vue-next'
import { useLuiStore } from '@/stores/lui'
import ConversationList from '@/components/lui/conversation-list.vue'
import ChatMessage from '@/components/lui/chat-message.vue'
import PromptInput from '@/components/lui/prompt-input.vue'
import FileResources from '@/components/lui/file-resources.vue'
import CandidateSelector from '@/components/lui/candidate-selector.vue'
import AIGatewayToolbar from '@/components/lui/ai-gateway-toolbar.vue'
import TaskQueueIndicator from '@/components/lui/task-queue-indicator.vue'
import AuthDialog from '@/components/lui/auth-dialog.vue'

const store = useLuiStore()

const inputText = ref('')
const showAuthDialog = ref(false)
const authProvider = ref('')
const authProviderName = ref('')
const temperature = ref(0.5)

// 计算已授权的 providers
const authorizedProviders = computed(() => {
  return store.providers
    .filter((p: { id: string }) => store.isAuthorized(p.id))
    .map((p: { id: string }) => p.id)
})

async function onConversationSelect(id: string) {
  await store.selectConversation(id)
}

async function onConversationCreate() {
  const conversation = await store.createConversation()
  await store.selectConversation(conversation.id)
}

async function onConversationDelete(id: string) {
  await store.deleteConversation(id)
}

async function onCandidateSelect(candidate: { id: string } | null) {
  if (!store.selectedId) return

  await store.bindConversationCandidate(store.selectedId, candidate?.id ?? null)
}

async function onSend(text: string) {
  if (!text.trim() || store.isLoadingMessages) return
  if (!store.selectedId) {
    // Create a new conversation if none selected
    await store.createConversation()
  }
  inputText.value = ''
  await store.sendMessage(store.selectedId!, text)
}

function onSelectCommand(command: string) {
  // Handle slash commands
  inputText.value = command
}

async function onFileUpload(files: File[]) {
  if (!store.selectedId || files.length === 0) return
  for (const file of files) {
    await store.addFileResource(store.selectedId, file)
  }
}

function onSelectAgent(agentId: string | null) {
  store.selectedAgentId = agentId
}

function onCreateAgent() {
  // TODO: Open agent creation dialog
}

function onSelectModel(modelId: string | null) {
  store.selectedModelId = modelId
}

function onAuthorizeProvider(provider: string) {
  const providerConfig = store.providers.find((p: { id: string; name: string }) => p.id === provider)
  if (providerConfig) {
    authProvider.value = provider
    authProviderName.value = providerConfig.name
    showAuthDialog.value = true
  }
}

async function onAuthConfirm(payload: { provider: string; apiKey: string }) {
  await store.authorize(payload.provider, payload.apiKey)
  showAuthDialog.value = false
}

function onTemperatureChange(value: number) {
  temperature.value = value
}

onMounted(async () => {
  await store.initialize()
})
</script>
