<template>
  <div
    class="flex h-screen w-full overflow-hidden bg-background"
    :data-user-phone="userPhone ?? undefined"
  >
    <ResizablePanelGroup
      id="lui-main-split"
      direction="horizontal"
      class="min-h-0 flex-1"
      @layout="onMainSplitLayout"
    >
      <ResizablePanel
        id="lui-left-panel"
        ref="leftPanelRef"
        :collapsible="true"
        :collapsed-size="0"
        :default-size="leftPanelWidth"
        :min-size="22"
        :max-size="42"
        class="border-r bg-background"
      >
        <div class="flex h-full min-h-0 flex-col">
          <div class="flex items-center justify-between border-b px-2 py-2">
            <AppBrandLink to="/candidates" />
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                class="h-8 w-8 shrink-0 rounded-md shadow-none"
                title="新建会话"
                @click="onConversationCreate"
              >
                <Plus class="h-4 w-4" />
              </Button>
              <AppUserActions />
            </div>
          </div>

          <ResizablePanelGroup
            id="lui-left-vertical-split"
            direction="vertical"
            class="min-h-0 flex-1"
            @layout="onLeftVerticalLayout"
          >
            <ResizablePanel
              id="lui-conversation-panel"
              :default-size="leftTopPaneSize"
              :min-size="30"
              class="min-h-0"
            >
              <div class="h-full min-h-0 overflow-hidden">
                <ConversationList
                  :conversations="visibleConversations"
                  :selected-id="store.selectedId"
                  @select="onConversationSelect"
                  @delete="onConversationDelete"
                />
              </div>
            </ResizablePanel>

            <ResizableHandle
              id="lui-left-handle"
              class="h-4 w-full cursor-row-resize bg-transparent after:inset-x-0 after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:translate-x-0 hover:bg-muted/15"
            >
              <slot>
                <div
                  class="h-1.5 w-15 rounded-full bg-border/90 group-hover/handle:bg-primary/75"
                />
              </slot>
            </ResizableHandle>

            <ResizablePanel
              id="lui-workbench-panel"
              :default-size="100 - leftTopPaneSize"
              :min-size="25"
              class="min-h-0 border-t bg-muted/20"
            >
              <div class="flex h-full min-h-0 flex-col p-3">
                <div
                  class="flex h-full min-h-0 flex-col rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm"
                >
                  <div class="mb-3 flex items-center justify-between gap-2">
                    <span class="text-xs font-medium text-muted-foreground"
                      >文件</span
                    >
                  </div>
                  <div
                    class="flex h-full min-h-0 flex-col items-stretch justify-start overflow-hidden"
                  >
                    <FileResources />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>

      <ResizableHandle
        id="lui-main-handle"
        class="w-4 cursor-col-resize bg-transparent hover:bg-muted/15"
      >
        <div
          class="h-15 w-1.5 rounded-full bg-border/90 shadow-md transition-colors group-hover/handle:bg-primary/75"
        />
      </ResizableHandle>

      <ResizablePanel
        id="lui-chat-panel"
        :default-size="100 - leftPanelWidth"
        :min-size="58"
        class="min-h-0"
      >
        <main class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <div class="flex items-center gap-2 border-b pr-2 py-2">
            <div class="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                class="h-8 w-8 shrink-0 rounded-md shadow-none"
                :title="
                  leftPanelRef?.isCollapsed ? '展开会话列表' : '收起会话列表'
                "
                @click="
                  leftPanelRef?.isCollapsed
                    ? leftPanelRef?.expand()
                    : leftPanelRef?.collapse()
                "
              >
                <PanelLeft class="h-4 w-4" />
              </Button>

              <RouterLink to="/candidates">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 shrink-0 rounded-md px-2 text-xs font-medium shadow-none"
                >
                  <ArrowLeft class="h-4 w-4" />
                  <span class="hidden md:inline">返回</span>
                </Button>
              </RouterLink>
            </div>

            <div class="min-w-0 flex-1 px-1">
              <div v-if="store.selectedConversation" class="min-w-0">
                <p class="truncate text-sm font-medium leading-6">
                  {{ formatToolbarTitle(store.selectedConversation.title) }}
                </p>
              </div>

              <span
                v-else-if="interviewScene.currentCandidate.value"
                class="truncate text-sm font-medium"
              >
                当前候选人工作区
              </span>
              <span v-else class="text-sm text-muted-foreground">
                选择或创建一个会话
              </span>
            </div>

            <div class="flex shrink-0 items-center gap-1.5">
              <CandidateSelector
                v-if="showCandidateSelector"
                :model-value="workspaceCandidateId"
                @select="onCandidateSelect"
              />
              <Button
                v-if="showCandidateSelector"
                type="button"
                variant="outline"
                size="sm"
                class="gap-1.5"
                :disabled="!currentSourceResume"
                @click="openSourceDocumentPreview"
              >
                <FileSearch class="h-4 w-4" />
                <span class="hidden md:inline">PDF</span>
              </Button>
              <AgentSelector
                :model-value="store.selectedAgentId"
                :profile="agentSelectorProfile"
                @select="onAgentSelect"
              />
            </div>
          </div>

          <Conversation
            class="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-background via-background to-muted/20"
          >
            <ConversationContent
              class="mx-auto min-h-0 w-full max-w-4xl flex-1 px-4 py-6 sm:px-6"
            >
              <ConversationEmptyState
                v-if="uiMessages.length === 0"
                title="今天想一起推进什么？"
                description="我可以基于你当前输入的内容、已选择的上下文和可用模型，帮你分析问题、整理信息、生成提纲，或继续把这段对话往前推进。"
                class="min-h-[320px]"
              >
                <template #icon>
                  <Bot class="h-12 w-12 opacity-30" />
                </template>

                <div class="mx-auto w-full max-w-xl space-y-5">
                  <div class="space-y-2 text-center">
                    <p class="text-base font-semibold tracking-tight">
                      {{ genericSuggestionTitle }}
                    </p>
                    <p class="text-sm font-medium leading-6 /90">
                      {{ genericSuggestionDescription }}
                    </p>
                  </div>
                  <Suggestions class="w-full">
                    <Suggestion
                      v-for="suggestion in genericStarterSuggestions"
                      :key="suggestion"
                      :suggestion="suggestion"
                      size="default"
                      variant="outline"
                      class="lui-suggestion-card h-auto w-full min-w-0 justify-center whitespace-normal break-words rounded-2xl border-border/80 bg-card/92 px-6 py-6 text-center text-lg font-medium leading-8 text-card-foreground shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-primary/20 hover:bg-card hover:shadow-md"
                      @click="applySuggestion(suggestion)"
                    />
                  </Suggestions>
                </div>
              </ConversationEmptyState>

              <Message
                v-for="message in uiMessages"
                :key="message.key"
                :from="message.from"
              >
                <div class="min-w-0 flex-1 space-y-3">
                  <Sources v-if="message.sources.length">
                    <SourcesTrigger
                      :count="message.sources.length"
                      class="text-xs"
                    />
                    <SourcesContent>
                      <Source
                        v-for="source in message.sources"
                        :key="`${message.key}-${source.href}`"
                        :href="source.href"
                        :title="source.title"
                      />
                    </SourcesContent>
                  </Sources>

                  <Reasoning
                    v-if="message.reasoning"
                    :default-open="message.status === 'streaming'"
                    :is-streaming="message.status === 'streaming'"
                  >
                    <ReasoningTrigger />
                    <div
                      class="mt-2 whitespace-pre-wrap break-words text-xs leading-6"
                    >
                      {{ message.reasoning }}
                    </div>
                  </Reasoning>

                  <MessageContent
                    class="w-full max-w-none space-y-3 group-[.is-user]:max-w-[80%] group-[.is-user]:rounded-2xl group-[.is-user]:border group-[.is-user]:border-border/70 group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]: group-[.is-user]:shadow-sm group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:border-border/70 group-[.is-assistant]:bg-card group-[.is-assistant]:px-4 group-[.is-assistant]:py-3 group-[.is-assistant]:shadow-sm"
                  >
                    <div
                      v-if="
                        message.from === 'assistant' &&
                        message.status === 'streaming' &&
                        !message.primaryContent &&
                        !message.reasoning
                      "
                      class="flex items-center gap-2 text-sm"
                    >
                      <Loader2 class="h-4 w-4 animate-spin" />
                      正在生成
                    </div>

                    <div
                      v-if="message.primaryContent"
                      class="whitespace-pre-wrap break-words text-sm leading-7"
                    >
                      {{ message.primaryContent }}
                    </div>

                    <div v-if="message.tools?.length" class="space-y-2">
                      <div
                        v-for="(tool, index) in message.tools"
                        :key="`${message.key}-tool-${index}`"
                        class="rounded-xl border border-border/70 bg-background/70 px-3 py-2"
                      >
                        <p class="text-xs font-medium">
                          工具调用 {{ index + 1 }}
                        </p>
                        <pre
                          class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed"
                          >{{ stringifyTool(tool) }}</pre
                        >
                      </div>
                    </div>

                    <div
                      v-if="message.status === 'error'"
                      class="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      响应失败，请重试。
                    </div>
                  </MessageContent>
                </div>
              </Message>
            </ConversationContent>

            <ConversationScrollButton />
          </Conversation>

          <TaskQueueIndicator :tasks="store.tasks" />

          <div class="shrink-0 border-t bg-background px-4 pb-1.5 pt-2">
            <div class="mx-auto w-full">
              <PromptInput
                class="w-full rounded-3xl border border-border/70 bg-background/95 p-2 shadow-sm backdrop-blur"
                :accept="acceptedFileTypes"
                :multiple="true"
                :max-files="20"
                global-drop
              >
                <PromptInputHeader
                  v-if="pickedFiles.length"
                  class="mb-2 flex flex-wrap gap-2 px-1 pt-1"
                >
                  <Attachments class="flex flex-wrap gap-2" variant="inline">
                    <Attachment
                      v-for="file in pickedFiles"
                      :key="file.id"
                      :data="file"
                      class="max-w-full"
                      @remove="promptInput.removeFile(file.id)"
                    >
                      <AttachmentPreview />
                      <span class="max-w-44 truncate text-xs">{{
                        file.filename
                      }}</span>
                      <AttachmentRemove />
                    </Attachment>
                  </Attachments>
                </PromptInputHeader>

                <PromptInputBody>
                  <PromptInputTextarea
                    :disabled="
                      chatStatus === 'submitted' || chatStatus === 'streaming'
                    "
                    placeholder="输入消息，输入 / 使用命令"
                    class="min-h-[96px] border-0 bg-transparent px-3 py-3 text-sm caret-foreground shadow-none focus-visible:ring-0"
                  />
                </PromptInputBody>

                <PromptInputFooter
                  class="mt-2 flex items-center justify-between gap-3 px-1 pb-1"
                >
                  <PromptInputTools
                    class="min-w-0 flex-1 flex-wrap items-center gap-2"
                  >
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments
                          label="添加文件或图片"
                        />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>

                    <ModelSelector v-model:open="modelSelectorOpen">
                      <ModelSelectorTrigger as-child>
                        <PromptInputButton :disabled="store.isLoadingMessages">
                          <ModelSelectorLogo
                            v-if="selectedModelLogo"
                            :provider="selectedModelLogo"
                          />
                          <ModelSelectorName>
                            {{ selectedModelLabel }}
                          </ModelSelectorName>
                        </PromptInputButton>
                      </ModelSelectorTrigger>

                      <ModelSelectorContent class="sm:max-w-md">
                        <ModelSelectorInput placeholder="搜索模型或 Provider" />
                        <ModelSelectorList>
                          <ModelSelectorEmpty>暂无可用模型</ModelSelectorEmpty>
                          <ModelSelectorGroup
                            v-for="provider in store.providers"
                            :key="provider.id"
                            :heading="provider.name"
                          >
                            <ModelSelectorItem
                              v-for="model in provider.models"
                              :key="model.id"
                              :value="`${provider.name} ${model.displayName}`"
                              @select="selectModel(model.id)"
                            >
                              <div class="flex min-w-0 items-center gap-2">
                                <ModelSelectorLogo
                                  v-if="getProviderLogo(provider.id)"
                                  :provider="getProviderLogo(provider.id)!"
                                />
                                <div class="min-w-0 flex-1">
                                  <ModelSelectorName>
                                    {{ model.displayName }}
                                  </ModelSelectorName>
                                  <p class="truncate text-xs">
                                    {{ provider.name }}
                                  </p>
                                </div>
                                <Check
                                  v-if="
                                    store.selectedModelId === model.id &&
                                    store.selectedModelProvider === provider.id
                                  "
                                  class="ml-auto h-4 w-4 text-primary"
                                />
                                <div v-else class="ml-auto h-4 w-4" />
                              </div>
                            </ModelSelectorItem>
                          </ModelSelectorGroup>
                        </ModelSelectorList>
                      </ModelSelectorContent>
                    </ModelSelector>

                    <Input
                      v-if="isManualModel"
                      v-model="store.customModelName"
                      type="text"
                      placeholder="输入模型名称（如 MiniMax-M2.7）"
                      class="h-8 max-w-[240px] rounded-full text-xs"
                      :disabled="
                        chatStatus === 'submitted' || chatStatus === 'streaming'
                      "
                    />
                  </PromptInputTools>

                  <PromptInputSubmit
                    :disabled="
                      chatStatus === 'submitted' ||
                      chatStatus === 'streaming' ||
                      !canSubmitPrompt
                    "
                    :status="chatStatus"
                    class="rounded-full"
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>

    <Dialog
      :open="sourceDocumentPreviewOpen"
      content-class="flex h-[80vh] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0"
      @update:open="handleSourceDocumentPreviewOpenChange"
    >
      <template #content>
        <div v-if="currentSourceResume" class="flex min-h-0 flex-1 flex-col">
          <DialogHeader class="shrink-0 border-b px-4 py-3 sm:px-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <DialogTitle class="truncate pr-2 text-sm font-semibold">
                  {{ currentSourceResumeDisplayName }}
                </DialogTitle>
                <DialogDescription class="pt-1 text-xs">
                  {{ formatResumeSize(currentSourceResume.fileSize) }}
                </DialogDescription>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" size="sm" class="gap-1.5" @click="downloadSourceDocument">
                  <Download class="h-4 w-4" />
                  <span class="hidden sm:inline">下载</span>
                </Button>
                <Button type="button" variant="outline" size="icon" class="shrink-0" @click="handleSourceDocumentPreviewOpenChange(false)">
                  <X class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div class="min-h-0 flex-1 overflow-hidden bg-background">
            <iframe
              v-if="sourcePreviewUrl && isSourceDocumentPdf"
              :src="sourcePreviewUrl"
              class="h-full w-full bg-background"
              title="PDF 源文档预览"
            />
            <div
              v-else-if="sourcePreviewUrl && isSourceDocumentImage"
              class="flex h-full items-center justify-center bg-background p-4"
            >
              <img
                :src="sourcePreviewUrl"
                :alt="currentSourceResumeDisplayName"
                class="max-h-full max-w-full rounded-md object-contain"
              />
            </div>
            <div
              v-else
              class="flex h-full items-center justify-center px-6 text-sm text-muted-foreground"
            >
              当前原件暂不支持内嵌阅读，请使用右上角下载按钮查看。
            </div>
          </div>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import type { ChatStatus } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Download,
  FileSearch,
  Loader2,
  PanelLeft,
  Plus,
  X,
} from "lucide-vue-next";
import {
  Attachment,
  Attachments,
  AttachmentPreview,
  AttachmentRemove,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputProvider,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Reasoning,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AgentSelector from "@/components/lui/agent-selector.vue";
import CandidateSelector from "@/components/lui/candidate-selector.vue";
import ConversationList from "@/components/lui/conversation-list.vue";
import FileResources from "@/components/lui/file-resources.vue";
import TaskQueueIndicator from "@/components/lui/task-queue-indicator.vue";
import Input from "@/components/ui/input.vue";
import Button from "@/components/ui/button.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  candidatesApi,
  resolveResumePreviewContentType,
} from "@/api/candidates";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { useAuthStore } from "@/stores/auth";
import { useCandidatesStore } from "@/stores/candidates";
import { useLuiStore } from "@/stores/lui";
import {
  createInterviewConversationPolicy,
  filterInterviewConversations,
  INTERVIEW_AGENT_SELECTOR_PROFILE,
  isInterviewAgent,
} from "@/stores/lui/scenes/interview/policy";
import { useInterviewScene } from "@/stores/lui/scenes/interview/scene";
import type { LuiAgentSelectorProfile } from "@/stores/lui/scenes/types";
import type { CandidateDetailData } from "@ims/shared";

interface SourceItem {
  href: string;
  title: string;
}

interface UiMessageItem {
  key: string;
  from: "user" | "assistant" | "system";
  status: "streaming" | "error" | "complete";
  primaryContent: string;
  reasoning?: string | null;
  tools?: unknown[] | null;
  sources: SourceItem[];
}

const acceptedFileTypes = ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr";
const interviewConversationPolicy = createInterviewConversationPolicy();
const GENERIC_AGENT_SELECTOR_PROFILE: LuiAgentSelectorProfile = {
  title: "通用工作区 Agent",
  subtitle: "通用对话助手",
  description: "专注普通对话、分析与资料整理，不自动附带候选人 workflow。",
  skills: ["通用问答", "资料整理", "提纲生成"],
  tools: ["文件读取", "信息总结", "内容改写"],
  entrySkill: "general-chat",
  supportSkills: [],
  skillSectionLabel: "核心能力",
  toolSectionLabel: "可用工具",
  summaryText:
    "当前会话保持通用工作区语义，只继承所选 Agent 的角色、工具和模型配置。",
};

const store = useLuiStore();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const candidatesStore = useCandidatesStore();
const { notifyError } = useAppNotifications();

const inputText = ref("");
// const leftSidebarOpen = ref(true);
const leftPanelRef = ref<InstanceType<typeof ResizablePanel> | null>(null);
const modelSelectorOpen = ref(false);
const isSubmittingPrompt = ref(false);
const leftPanelWidth = ref(31);
const leftTopPaneSize = ref(50);
const isWorkspaceReady = ref(false);
const sourceDocumentPreviewOpen = ref(false);

const activeSuggestionAgent = computed(() => {
  return store.selectedAgent ?? store.defaultAgent ?? null;
});

const promptInput = usePromptInputProvider({
  initialInput: inputText.value,
  accept: acceptedFileTypes,
  maxFiles: 20,
  onSubmit: handlePromptSubmit,
  onError: onPromptError,
});

const pickedFiles = computed(() => promptInput.files.value);

const userPhone = computed(() => {
  return (route.query.phone as string) || authStore.user?.phone || null;
});

const explicitRouteCandidateId = computed(() => {
  const queryCandidateId = route.query.candidateId;
  return typeof queryCandidateId === "string" && queryCandidateId.trim()
    ? queryCandidateId.trim()
    : null;
});
const selectedConversationCandidateId = computed(
  () => store.selectedConversation?.candidateId ?? null,
);
const workspaceCandidateId = computed(() => {
  return (
    explicitRouteCandidateId.value ?? selectedConversationCandidateId.value
  );
});
type CandidateResume = CandidateDetailData["resumes"][number];
const interviewScene = useInterviewScene({
  candidateId: computed(() => explicitRouteCandidateId.value),
  store,
  candidatesStore,
  notifyError,
});

const routeScene = computed(() =>
  typeof route.query.scene === "string" && route.query.scene.trim()
    ? route.query.scene.trim()
    : null,
);
const hasInterviewContext = computed(() =>
  Boolean(explicitRouteCandidateId.value),
);
const showCandidateSelector = computed(
  () =>
    routeScene.value === "interview" ||
    isInterviewAgent(activeSuggestionAgent.value),
);
const currentSourceCandidateDetail = computed(() => {
  if (!workspaceCandidateId.value) return null;
  return candidatesStore.current?.candidate.id === workspaceCandidateId.value
    ? candidatesStore.current
    : null;
});
const currentSourceResume = computed<CandidateResume | null>(() => {
  const resumes = currentSourceCandidateDetail.value?.resumes ?? [];
  if (resumes.length === 0) return null;
  return (
    [...resumes].sort((left, right) => right.createdAt - left.createdAt)[0] ??
    null
  );
});
const currentSourceResumeDisplayName = computed(() => {
  return decodeDisplayFileName(currentSourceResume.value?.fileName ?? "源文档");
});
const sourcePreviewUrl = computed(() => {
  return currentSourceResume.value
    ? candidatesApi.getResumePreviewUrl(currentSourceResume.value.id)
    : null;
});
const sourcePreviewContentType = computed(() => {
  return resolveResumePreviewContentType(
    currentSourceResume.value?.fileType,
    currentSourceResume.value?.fileName,
  );
});
const isSourceDocumentPdf = computed(
  () => sourcePreviewContentType.value === "application/pdf",
);
const isSourceDocumentImage = computed(() =>
  Boolean(sourcePreviewContentType.value?.startsWith("image/")),
);
const agentSelectorProfile = computed(() =>
  routeScene.value === "interview" ||
  isInterviewAgent(activeSuggestionAgent.value)
    ? INTERVIEW_AGENT_SELECTOR_PROFILE
    : GENERIC_AGENT_SELECTOR_PROFILE,
);

const chatStatus = computed<ChatStatus>(() => {
  const lastMessage = store.currentMessages.at(-1);
  if (lastMessage?.status === "streaming") return "streaming";
  if (lastMessage?.status === "error") return "error";
  if (isSubmittingPrompt.value) return "submitted";
  return "ready";
});

const visibleConversations = computed(() => {
  const candidateId = explicitRouteCandidateId.value;
  if (!candidateId) {
    return store.conversations.filter(
      (conversation) => conversation.candidateId === null,
    );
  }

  return filterInterviewConversations(store.conversations, candidateId);
});

const genericSuggestionTitle = computed(() => {
  const agent = activeSuggestionAgent.value;
  return agent ? `${agent.name} 的建议` : "试试智能体建议";
});

const genericSuggestionDescription = computed(() => {
  const agent = activeSuggestionAgent.value;
  if (agent) {
    return `以下建议会根据当前智能体「${agent.name}」的职责与技能生成，点击后会直接填入底部输入区。`;
  }

  return "建议会根据当前智能体配置和上下文生成，点击后会直接填入底部输入区。";
});

const genericStarterSuggestions = computed(() =>
  buildGenericSuggestions(activeSuggestionAgent.value),
);

const uiMessages = computed<UiMessageItem[]>(() => {
  return store.currentMessages.map((message) => ({
    key: message.id,
    from: message.role,
    status: message.status,
    primaryContent: message.content,
    reasoning: message.reasoning,
    tools: message.tools,
    sources: extractSources(message.tools),
  }));
});

const selectedModelData = computed(() => {
  for (const provider of store.providers) {
    const model = provider.models.find(
      (item) => item.id === store.selectedModelId,
    );
    if (!model) continue;
    if (
      store.selectedModelProvider &&
      provider.id !== store.selectedModelProvider
    ) {
      continue;
    }
    return { provider, model };
  }
  return null;
});

const selectedModelLabel = computed(() => {
  const match = selectedModelData.value;
  if (!match) return "选择模型";
  if (isManualModel.value && store.customModelName.trim()) {
    return `${match.provider.name} / ${store.customModelName.trim()}`;
  }
  return match.model.displayName;
});

const selectedModelLogo = computed(() => {
  return selectedModelData.value
    ? getProviderLogo(selectedModelData.value.provider.id)
    : null;
});

const isManualModel = computed(() => {
  const selectedModelId = store.selectedModelId;
  if (!selectedModelId) return false;
  const separatorIndex = selectedModelId.indexOf("::");
  if (separatorIndex < 0) return false;
  return selectedModelId.slice(separatorIndex + 2) === "__manual__";
});

const hasSelectedModel = computed(() => {
  return Boolean(store.selectedModelId && store.selectedModelProvider);
});

const hasReadyManualModelName = computed(() => {
  return !isManualModel.value || store.customModelName.trim().length > 0;
});

const canSubmitPrompt = computed(() => {
  const hasText = promptInput.textInput.value.trim().length > 0;
  const hasFiles = pickedFiles.value.length > 0;

  if (hasFiles && !hasText) {
    return true;
  }

  if (!hasText) {
    return false;
  }

  return hasSelectedModel.value && hasReadyManualModelName.value;
});

watch(
  workspaceCandidateId,
  async () => {
    const explicitCandidateId = explicitRouteCandidateId.value;
    store.setConversationPolicy(
      explicitCandidateId ? interviewConversationPolicy : null,
    );

    if (
      !isWorkspaceReady.value ||
      interviewScene.isSyncingCandidateWorkspace.value
    ) {
      return;
    }

    if (explicitCandidateId) {
      await interviewScene.ensureWorkspace(explicitCandidateId);
      return;
    }
    interviewScene.reset();
  },
  { immediate: true },
);

watch(inputText, (value) => {
  if (value !== promptInput.textInput.value) {
    promptInput.setTextInput(value);
  }
});

watch(
  () => promptInput.textInput.value,
  (value) => {
    if (value !== inputText.value) {
      inputText.value = value;
    }
  },
);

async function onConversationSelect(id: string) {
  await store.selectConversation(id);
}

async function onConversationCreate() {
  const conversation = await store.createConversation(
    undefined,
    hasInterviewContext.value
      ? (explicitRouteCandidateId.value ?? undefined)
      : undefined,
  );
  await store.selectConversation(conversation.id);
}

async function onConversationDelete(id: string) {
  await store.deleteConversation(id);
  const nextConversation = visibleConversations.value[0];
  if (nextConversation && nextConversation.id !== store.selectedId) {
    await store.selectConversation(nextConversation.id);
  }
}

async function onCandidateSelect(candidate: { id: string } | null) {
  const nextCandidateId = candidate?.id ?? null;
  const currentQueryCandidateId = explicitRouteCandidateId.value;

  if (currentQueryCandidateId === nextCandidateId) {
    return;
  }

  await replaceCandidateRoute(nextCandidateId);
}

function openSourceDocumentPreview() {
  if (!currentSourceResume.value) {
    return;
  }

  sourceDocumentPreviewOpen.value = true;
}

function handleSourceDocumentPreviewOpenChange(open: boolean) {
  sourceDocumentPreviewOpen.value = open;
}

async function downloadSourceDocument() {
  if (!currentSourceResume.value) {
    return;
  }

  const { blob, fileName } = await candidatesApi.downloadResume(
    currentSourceResume.value.id,
  );
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName ?? currentSourceResume.value.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function handlePromptSubmit(message: PromptInputMessage) {
  if (chatStatus.value === "submitted" || chatStatus.value === "streaming") {
    return;
  }

  const text = message.text.trim();
  const files = message.files
    .map((item) => ("file" in item ? item.file : undefined))
    .filter((file): file is File => file instanceof File);

  if (!text && files.length === 0) {
    return;
  }

  if (text && !hasSelectedModel.value) {
    notifyError(
      reportAppError("lui/model-required", new Error("请先选择模型"), {
        title: "无法发送消息",
        fallbackMessage: "请先选择模型后再发送消息",
      }),
    );
    return;
  }

  if (text && isManualModel.value && !hasReadyManualModelName.value) {
    notifyError(
      reportAppError(
        "lui/manual-model-required",
        new Error("请先输入模型名称"),
        {
          title: "无法发送消息",
          fallbackMessage: "请先输入手动模型名称后再发送消息",
        },
      ),
    );
    return;
  }

  isSubmittingPrompt.value = true;
  void submitPrompt({ text, files });
}

async function submitPrompt(input: { text: string; files: File[] }) {
  const { text, files } = input;
  const isNewConversation = !store.selectedId;
  const shouldGenerateTitleFromFirstMessage =
    isNewConversation || store.currentMessages.length === 0;
  let conversationId = store.selectedId;

  try {
    if (!conversationId) {
      const conversation = await store.createConversation(
        undefined,
        hasInterviewContext.value
          ? (explicitRouteCandidateId.value ?? undefined)
          : undefined,
      );
      conversationId = conversation.id;
    }

    for (const file of files) {
      await store.addFileResource(conversationId, file);
    }

    if (!text) {
      return;
    }

    const sendingPromise = store.sendMessage(conversationId, text);
    isSubmittingPrompt.value = false;
    await sendingPromise;

    if (shouldGenerateTitleFromFirstMessage) {
      void generateConversationTitle(conversationId, text);
    }
  } catch (err) {
    isSubmittingPrompt.value = false;
    notifyError(
      reportAppError("lui/submit-prompt", err, {
        title: "发送消息失败",
        fallbackMessage: "消息发送失败，请稍后重试",
      }),
    );
  } finally {
    if (chatStatus.value !== "streaming") {
      isSubmittingPrompt.value = false;
    }
  }
}

async function generateConversationTitle(
  conversationId: string,
  firstMessage: string,
) {
  try {
    const conversation = store.conversations.find(
      (item) => item.id === conversationId,
    );
    if (
      !conversation ||
      (conversation.title &&
        !shouldReplaceConversationTitle(conversation.title))
    ) {
      return;
    }

    await store.updateConversationTitle?.(
      conversationId,
      extractConversationTitle(firstMessage),
    );
  } catch (_err) {
    // 标题生成是非阻塞增强能力，失败时静默跳过。
  }
}

function shouldReplaceConversationTitle(title: string) {
  const normalized = title.trim();
  if (!normalized) {
    return true;
  }

  return /^(?:新会话|new(?:[\s-]+conversation)?)(?:\s*\d+)?$/i.test(normalized);
}

function extractConversationTitle(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "新会话";
  }

  const firstLine = normalized.split(/\n+/)[0]?.trim() ?? normalized;
  const punctuationIndex = firstLine.search(/[。！？!?]/);
  const firstSentence =
    punctuationIndex >= 0
      ? firstLine.slice(0, punctuationIndex + 1)
      : firstLine;
  const compact = firstSentence.trim();

  return compact.length <= 28 ? compact : `${compact.slice(0, 28).trimEnd()}…`;
}

function formatToolbarTitle(input: string) {
  return extractConversationTitle(input)
    .replace(/[。！？!?.,，；;：:]+$/g, "")
    .trim();
}

function onPromptError(payload: { code: string; message: string }) {
  notifyError(
    reportAppError("lui/prompt-input", new Error(payload.message), {
      title: "输入区操作失败",
      fallbackMessage: payload.message,
    }),
  );
}

function applySuggestion(suggestion: string) {
  promptInput.setTextInput(suggestion);
}

function onMainSplitLayout(sizes: number[]) {
  const leftSize = sizes[0];
  if (typeof leftSize === "number") {
    leftPanelWidth.value = Number(leftSize.toFixed(2));
  }
}

function onLeftVerticalLayout(sizes: number[]) {
  const topSize = sizes[0];
  if (typeof topSize === "number") {
    leftTopPaneSize.value = Number(topSize.toFixed(2));
  }
}

async function replaceCandidateRoute(candidateId: string | null) {
  const nextQuery = { ...route.query };
  if (candidateId) {
    nextQuery.candidateId = candidateId;
  } else {
    delete nextQuery.candidateId;
  }

  await router.replace({ path: "/lui", query: nextQuery });
}

function formatResumeSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeDisplayFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function buildGenericSuggestions(
  agent: {
    name: string;
    tools: string[];
  } | null,
) {
  const toolLabel = agent?.tools?.slice(0, 2).join("、");

  return [
    agent
      ? `请按智能体「${agent.name}」的职责，先帮我拆出当前任务的三个下一步。`
      : "请先帮我梳理当前问题，并给出三个可执行的下一步。",
    toolLabel
      ? `请结合 ${toolLabel} 这些能力，帮我整理当前资料并给出一版行动提纲。`
      : "请基于当前上下文帮我整理关键信息，并生成一版简洁提纲。",
    "请先判断我现在最值得优先推进的一件事，并说明原因。",
  ];
}

async function onSelectModel(modelId: string) {
  const model = store.getModelById(modelId);
  store.selectedModelId = modelId;
  store.selectedModelProvider = model?.provider ?? null;
  store.customModelName = "";
  if (!store.selectedId) {
    return;
  }
  await store.updateConversationAiConfig({
    modelProvider: model?.provider ?? null,
    modelId,
  });
}

function selectModel(modelId: string) {
  void onSelectModel(modelId);
  modelSelectorOpen.value = false;
}

async function onAgentSelect(
  agent: {
    id: string;
  } | null,
) {
  const agentId = agent?.id ?? null;
  store.selectedAgentId = agentId;

  if (!store.selectedId) {
    return;
  }

  await store.updateConversationAiConfig({
    agentId,
  });
}

function getProviderLogo(providerId: string): string | null {
  if (!providerId || providerId.includes(":")) {
    return null;
  }
  return providerId;
}

function extractSources(tools: unknown[] | null | undefined): SourceItem[] {
  const urls = new Map<string, SourceItem>();

  for (const tool of tools ?? []) {
    if (!tool || typeof tool !== "object") {
      continue;
    }

    const candidate = tool as Record<string, unknown>;
    const href = [candidate.url, candidate.href, candidate.sourceUrl].find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );

    if (!href) {
      continue;
    }

    const title =
      [candidate.title, candidate.name, candidate.label].find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ) ?? href;

    if (!urls.has(href)) {
      urls.set(href, { href, title });
    }
  }

  return Array.from(urls.values());
}

function stringifyTool(tool: unknown): string {
  if (typeof tool === "string") {
    return tool;
  }

  try {
    return JSON.stringify(tool, null, 2);
  } catch (_err) {
    return String(tool);
  }
}

onMounted(async () => {
  const candidateId = explicitRouteCandidateId.value ?? undefined;
  await store.initialize({ skipAutoSelect: true });

  if (!candidateId) {
    const firstGenericConversation = store.conversations.find(
      (conversation) => conversation.candidateId === null,
    );
    if (firstGenericConversation) {
      await store.selectConversation(firstGenericConversation.id);
    }
  }

  isWorkspaceReady.value = true;

  if (!candidateId) {
    return;
  }

  await interviewScene.ensureWorkspace(candidateId);
});
</script>

<style scoped>
@keyframes luiSuggestionFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.lui-suggestion-card {
  animation: luiSuggestionFadeUp 0.5s ease-out both;
}
</style>
