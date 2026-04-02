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
                  <Tabs
                    v-model="leftWorkbenchTab"
                    class="flex h-full min-h-0 flex-col gap-2 overflow-hidden"
                  >
                    <TabsList
                      class="grid h-9 w-full grid-cols-2 rounded-lg bg-muted p-1"
                    >
                      <TabsTrigger
                        value="listener"
                        class="rounded-md px-2 text-xs"
                        >监听</TabsTrigger
                      >
                      <TabsTrigger value="files" class="rounded-md px-2 text-xs"
                        >文件</TabsTrigger
                      >
                    </TabsList>

                    <TabsContent value="listener" class="mt-0 overflow-hidden">
                      <div
                        class="rounded-xl border border-border/70 bg-card/80 px-4 pb-3 pt-3 shadow-sm"
                      >
                        <section class="flex flex-col gap-2">
                          <div class="flex items-center justify-between gap-2">
                            <span
                              class="text-[11px] font-medium text-muted-foreground"
                              >监听</span
                            >
                            <div class="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                class="h-7 w-7 rounded-sm p-0"
                                title="放大监听输入框"
                                @click="listenerExpanded = true"
                              >
                                <Maximize2 class="h-3.5 w-3.5" />
                              </Button>
                              <Badge
                                :variant="
                                  listenerAvailable ? 'outline' : 'secondary'
                                "
                                class="h-7 rounded-sm px-2 text-[11px]"
                              >
                                {{ listenerStatusText }}
                              </Badge>
                            </div>
                          </div>

                          <div
                            class="h-28 shrink-0 rounded-lg border border-border/70 bg-background/90 p-2 shadow-inner shadow-black/5"
                          >
                            <textarea
                              v-model="listenerTranscript"
                              class="block h-full min-h-full w-full resize-none border-0 bg-transparent p-2 text-sm leading-6 outline-none"
                              placeholder="监听内容会保存在当前会话里。"
                            />
                          </div>

                          <div class="grid grid-cols-2 gap-1.5">
                            <Button
                              type="button"
                              variant="default"
                              class="h-8 justify-center gap-2 shadow-sm"
                              :disabled="!listenerAvailable"
                              @click="toggleLiveListening"
                            >
                              <Mic v-if="!isLiveListening" class="h-4 w-4" />
                              <Square v-else class="h-4 w-4" />
                              {{ isLiveListening ? "停止监听" : "开始监听" }}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              class="h-8 justify-center text-muted-foreground/70 shadow-none hover:bg-transparent"
                              :disabled="!listenerTranscript.trim()"
                              @click="clearListenerTranscript"
                            >
                              清空记录
                            </Button>
                          </div>

                          <div class="grid grid-cols-2 gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              class="h-8 justify-center border-border/60 bg-background font-medium text-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                              :disabled="!listenerTranscript.trim()"
                              @click="appendTranscriptToPrompt"
                            >
                              追加到主输入框
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              class="h-8 justify-center border-border/60 bg-background font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                              :disabled="!listenerTranscript.trim()"
                              @click="replacePromptWithTranscript"
                            >
                              覆盖主输入框
                            </Button>
                          </div>
                        </section>
                      </div>
                    </TabsContent>

                    <Dialog
                      :open="listenerExpanded"
                      content-class="h-[88vh] max-w-[min(92vw,1100px)] overflow-hidden p-0"
                      @update:open="listenerExpanded = $event"
                    >
                      <template #content>
                        <div class="flex h-full min-h-0 flex-col">
                          <div
                            class="flex items-start justify-between border-b px-5 py-4"
                          >
                            <div class="space-y-1">
                              <DialogTitle class="text-base font-semibold">
                                监听输入框
                              </DialogTitle>
                              <DialogDescription>
                                放大编辑当前监听
                                transcript，内容会继续跟随当前会话实时保存。
                              </DialogDescription>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              class="h-8 w-8 rounded-md p-0"
                              title="收起监听输入框"
                              @click="listenerExpanded = false"
                            >
                              <Minimize2 class="h-4 w-4" />
                            </Button>
                          </div>

                          <div
                            class="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4"
                          >
                            <div
                              class="flex items-center justify-between gap-3"
                            >
                              <Badge
                                :variant="
                                  listenerAvailable ? 'outline' : 'secondary'
                                "
                                class="h-8 rounded-sm px-3 text-xs"
                              >
                                {{ listenerStatusText }}
                              </Badge>
                              <p class="text-xs">
                                这里编辑的是同一份监听内容。
                              </p>
                            </div>

                            <div
                              class="min-h-0 flex-1 rounded-xl border border-border/70 bg-background/90 p-3 shadow-inner shadow-black/5"
                            >
                              <textarea
                                v-model="listenerTranscript"
                                class="block h-full min-h-full w-full resize-none border-0 bg-transparent p-2 text-sm leading-7 outline-none"
                                placeholder="监听内容会保存在当前会话里。"
                              />
                            </div>

                            <div class="grid shrink-0 grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant="default"
                                class="h-9 justify-center gap-2 shadow-sm"
                                :disabled="!listenerAvailable"
                                @click="toggleLiveListening"
                              >
                                <Mic v-if="!isLiveListening" class="h-4 w-4" />
                                <Square v-else class="h-4 w-4" />
                                {{ isLiveListening ? "停止监听" : "开始监听" }}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                class="h-9 justify-center text-muted-foreground/70 shadow-none hover:bg-transparent"
                                :disabled="!listenerTranscript.trim()"
                                @click="clearListenerTranscript"
                              >
                                清空记录
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                class="h-9 justify-center border-border/60 bg-background font-medium text-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                                :disabled="!listenerTranscript.trim()"
                                @click="appendTranscriptToPrompt"
                              >
                                追加到主输入框
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                class="h-9 justify-center border-border/60 bg-background font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
                                :disabled="!listenerTranscript.trim()"
                                @click="replacePromptWithTranscript"
                              >
                                覆盖主输入框
                              </Button>
                            </div>
                          </div>
                        </div>
                      </template>
                    </Dialog>

                    <TabsContent
                      value="files"
                      class="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                    >
                      <div
                        class="flex h-full min-h-0 flex-col rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm"
                      >
                        <div
                          class="flex h-full min-h-0 flex-col items-stretch justify-start"
                        >
                          <FileResources />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
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
                  :title="leftPanelRef?.isCollapsed ? '展开会话列表' : '收起会话列表'"
                  @click="leftPanelRef?.isCollapsed ? leftPanelRef?.expand() : leftPanelRef?.collapse()"
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
                v-else-if="currentCandidate"
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
                :model-value="workspaceCandidateId"
                @select="onCandidateSelect"
              />
              <AgentSelector
                :model-value="store.selectedAgentId"
                @select="onAgentSelect"
              />
            </div>
          </div>

          <div v-if="workflow" class="border-b bg-muted/15 p-2">
            <div class="mx-auto flex w-full items-start justify-between gap-4">
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-semibold">
                    面试流程：{{ currentWorkflowStageLabel ?? "流程处理中" }}
                  </span>
                  <Badge
                    :variant="workflowStatusVariant"
                    class="h-6 shrink-0 rounded-sm px-2 text-[11px] font-medium"
                  >
                    {{ workflowStatusLabel }}
                  </Badge>
                </div>
                <div class="text-[11px] leading-5 text-muted-foreground">
                  选择 AI
                  当前所处阶段：初筛看简历、出题准备问题、评估整理判断、完成输出结论。
                </div>
              </div>

              <div class="shrink-0">
                <div
                  class="flex items-center gap-1 rounded-lg border border-border/50 bg-background p-1 shadow-sm"
                >
                  <Button
                    v-for="stage in workflowStageOptions"
                    :key="stage.value"
                    type="button"
                    :variant="
                      workflow?.currentStage === stage.value
                        ? 'default'
                        : 'ghost'
                    "
                    size="sm"
                    class="h-7 rounded-md px-2 text-[11px] font-medium shadow-none"
                    @click="onWorkflowStageSelect(stage.value)"
                  >
                    {{ stage.label }}
                  </Button>
                </div>
              </div>
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
                      {{ suggestionTitle }}
                    </p>
                    <p class="text-sm font-medium leading-6 /90">
                      {{ suggestionDescription }}
                    </p>
                  </div>
                  <Suggestions class="w-full">
                    <Suggestion
                      v-for="(suggestion, index) in starterSuggestions"
                      :key="suggestion"
                      :suggestion="suggestion"
                      size="default"
                      variant="outline"
                      class="lui-suggestion-card h-auto w-full min-w-0 whitespace-normal break-words justify-center rounded-2xl border-border/80 bg-card/92 px-6 py-6 text-center text-lg font-medium leading-8 text-card-foreground shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-primary/20 hover:bg-card hover:shadow-md"
                      :style="{ animationDelay: `${index * 80}ms` }"
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
                      chatStatus === 'submitted' ||
                      chatStatus === 'streaming' ||
                      isLiveListening
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

                    <PromptInputSpeechButton :disabled="isLiveListening" />

                    <ModelSelector v-model:open="modelSelectorOpen">
                      <ModelSelectorTrigger as-child>
                        <PromptInputButton
                          :disabled="store.isLoadingMessages || isLiveListening"
                        >
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
                        chatStatus === 'submitted' ||
                        chatStatus === 'streaming' ||
                        isLiveListening
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
  </div>
</template>

<script setup lang="ts">
import type { ChatStatus } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  PanelLeft,
  Plus,
  Square,
} from "lucide-vue-next";
import { luiApi, type WorkflowState } from "@/api/lui";
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
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputProvider,
} from "@/components/ai-elements/prompt-input";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import AgentSelector from "@/components/lui/agent-selector.vue";
import CandidateSelector from "@/components/lui/candidate-selector.vue";
import ConversationList from "@/components/lui/conversation-list.vue";
import FileResources from "@/components/lui/file-resources.vue";
import TaskQueueIndicator from "@/components/lui/task-queue-indicator.vue";
import Input from "@/components/ui/input.vue";
import Button from "@/components/ui/button.vue";
import Badge from "@/components/ui/badge.vue";
import Tabs from "@/components/ui/tabs.vue";
import TabsContent from "@/components/ui/tabs-content.vue";
import TabsList from "@/components/ui/tabs-list.vue";
import TabsTrigger from "@/components/ui/tabs-trigger.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { useAuthStore } from "@/stores/auth";
import { useCandidatesStore } from "@/stores/candidates";
import { useLuiStore } from "@/stores/lui";

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

type ListenerAudioContextCtor = typeof AudioContext;

const acceptedFileTypes = ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr";

const store = useLuiStore();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const candidatesStore = useCandidatesStore();
const { notifyError } = useAppNotifications();

const inputText = ref("");
const workflow = ref<WorkflowState | null>(null);
const leftSidebarOpen = ref(true);
const leftPanelRef = ref<InstanceType<typeof ResizablePanel> | null>(null);
const leftWorkbenchTab = ref("listener");
const listenerExpanded = ref(false);
const modelSelectorOpen = ref(false);
const isSubmittingPrompt = ref(false);
const listenerTranscript = ref("");
const isLiveListening = ref(false);
const listenerAvailable = ref(false);
const listenerError = ref<string | null>(null);
const audioContextRef = ref<AudioContext | null>(null);
const audioStreamRef = ref<MediaStream | null>(null);
const audioSourceNodeRef = ref<MediaStreamAudioSourceNode | null>(null);
const audioProcessorNodeRef = ref<ScriptProcessorNode | null>(null);
const audioSilenceGainNodeRef = ref<GainNode | null>(null);
const listenerSessionIdRef = ref<string | null>(null);
const listenerBaseTranscriptRef = ref("");
const listenerPendingAudioChunksRef = ref<Float32Array[]>([]);
const leftPanelWidth = ref(31);
const leftTopPaneSize = ref(50);
const isWorkspaceReady = ref(false);
const isSyncingCandidateWorkspace = ref(false);

const LISTENER_TRANSCRIPT_PREFIX = "ims:lui:listener-transcript:";
let listenerFlushTimer: number | null = null;
let listenerTranscriptionChain: Promise<void> = Promise.resolve();

const activeSuggestionAgent = computed(() => {
  return store.selectedAgent ?? store.defaultAgent ?? null;
});

const currentWorkflowStageLabel = computed(() => {
  const labels: Record<NonNullable<WorkflowState["currentStage"]>, string> = {
    S0: "初筛阶段",
    S1: "出题阶段",
    S2: "评估阶段",
    completed: "复盘阶段",
  };

  const stage = workflow.value?.currentStage;
  return stage ? labels[stage] : null;
});

const workflowStatusLabel = computed(() => {
  if (!workflow.value) return "";
  const labels: Record<string, string> = {
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
    error: "异常",
  };
  return labels[workflow.value.status] ?? workflow.value.status;
});

const workflowStatusVariant = computed<
  "default" | "secondary" | "destructive" | "outline"
>(() => {
  if (!workflow.value) return "secondary";
  const variants: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    active: "secondary",
    paused: "secondary",
    completed: "outline",
    error: "destructive",
  };
  return variants[workflow.value.status] ?? "secondary";
});

const workflowStageOptions = [
  { value: "S0", label: "初筛" },
  { value: "S1", label: "出题" },
  { value: "S2", label: "评估" },
  { value: "completed", label: "完成" },
] as const;

const suggestionTitle = computed(() => {
  const agent = activeSuggestionAgent.value;
  const stageLabel = currentWorkflowStageLabel.value;

  if (agent && stageLabel) {
    return `${agent.name} · ${stageLabel}建议`;
  }

  if (agent) {
    return `${agent.name} 的建议`;
  }

  return stageLabel ? `${stageLabel}建议` : "试试智能体建议";
});

const suggestionDescription = computed(() => {
  const agent = activeSuggestionAgent.value;
  const stageLabel = currentWorkflowStageLabel.value;

  if (agent && stageLabel) {
    return `以下建议会优先按照当前流程的${stageLabel}目标生成，并同时遵循智能体「${agent.name}」的角色和技能约束。`;
  }

  if (agent) {
    return `以下建议会根据当前智能体「${agent.name}」的职责与技能生成，点击后会直接填入底部输入区。`;
  }

  if (stageLabel) {
    return `以下建议会围绕当前流程的${stageLabel}目标生成，点击后会直接填入底部输入区。`;
  }

  return "建议会根据当前智能体配置和上下文生成，点击后会直接填入底部输入区。";
});

const starterSuggestions = computed(() => {
  return buildAgentSuggestions(activeSuggestionAgent.value, {
    candidateName: currentCandidate.value?.name ?? null,
    workflowStage: workflow.value?.currentStage ?? null,
  });
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

const workspaceCandidateId = computed(() => {
  const queryCandidateId = route.query.candidateId;
  return typeof queryCandidateId === "string" && queryCandidateId.trim()
    ? queryCandidateId.trim()
    : (store.selectedConversation?.candidateId ?? null);
});

const currentCandidate = computed(() => {
  const candidateId = workspaceCandidateId.value;
  if (!candidateId) return null;
  return candidatesStore.current?.candidate.id === candidateId
    ? candidatesStore.current.candidate
    : null;
});

const chatStatus = computed<ChatStatus>(() => {
  const lastMessage = store.currentMessages.at(-1);
  if (lastMessage?.status === "streaming") return "streaming";
  if (lastMessage?.status === "error") return "error";
  if (isSubmittingPrompt.value) return "submitted";
  return "ready";
});

const listenerStatusText = computed(() => {
  if (!listenerAvailable.value) return "本地语音不可用";
  if (listenerError.value) return "监听异常";
  return isLiveListening.value ? "监听中" : "待命中";
});

const visibleConversations = computed(() => {
  const candidateId = workspaceCandidateId.value;
  if (!candidateId) return store.conversations;
  return store.conversations.filter(
    (conversation) => conversation.candidateId === candidateId,
  );
});

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
  if (isLiveListening.value) {
    return false;
  }

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

const listenerStorageKey = computed(() => {
  if (store.selectedId) {
    return `${LISTENER_TRANSCRIPT_PREFIX}conversation:${store.selectedId}`;
  }

  if (workspaceCandidateId.value) {
    return `${LISTENER_TRANSCRIPT_PREFIX}candidate:${workspaceCandidateId.value}`;
  }

  return `${LISTENER_TRANSCRIPT_PREFIX}draft`;
});

watch(workspaceCandidateId, async (candidateId) => {
  if (!isWorkspaceReady.value || isSyncingCandidateWorkspace.value) {
    return;
  }

  if (candidateId) {
    await ensureCandidateWorkspace(candidateId);
    return;
  }
  workflow.value = null;
});

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

watch(
  listenerStorageKey,
  (key) => {
    if (typeof window === "undefined") {
      return;
    }

    listenerTranscript.value = window.localStorage.getItem(key) ?? "";
  },
  { immediate: true },
);

watch(listenerTranscript, (value) => {
  if (typeof window === "undefined") {
    return;
  }

  const key = listenerStorageKey.value;
  if (!value.trim()) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
});

onMounted(() => {
  initializeLiveListening();
  window.addEventListener("keydown", handleListenerShortcut);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleListenerShortcut);
  void stopLiveListening();
});

async function loadWorkflow(candidateId: string) {
  try {
    const workflows = await luiApi.listWorkflows(candidateId);
    const activeWorkflow = workflows.items.find(
      (item) => item.status === "active" || item.status === "paused",
    );
    workflow.value = activeWorkflow || null;
  } catch (_err) {
    workflow.value = null;
  }
}

async function onWorkflowStageSelect(stage: WorkflowState["currentStage"]) {
  if (!workflow.value || workflow.value.currentStage === stage) {
    return;
  }

  try {
    workflow.value = await luiApi.updateWorkflow(workflow.value.id, {
      currentStage: stage,
    });
  } catch (err) {
    notifyError(
      reportAppError("workflow/set-stage", err, {
        title: "切换流程阶段失败",
        fallbackMessage: "无法切换到目标流程阶段",
      }),
    );
  }
}

async function onConversationSelect(id: string) {
  if (isLiveListening.value) {
    await stopLiveListening();
  }
  await store.selectConversation(id);
  await syncRouteCandidateId();
}

async function onConversationCreate() {
  if (isLiveListening.value) {
    await stopLiveListening();
  }
  const conversation = await store.createConversation(
    undefined,
    workspaceCandidateId.value ?? undefined,
  );
  await store.selectConversation(conversation.id);
  await syncRouteCandidateId();
}

async function onConversationDelete(id: string) {
  if (isLiveListening.value) {
    await stopLiveListening();
  }
  await store.deleteConversation(id);
  const nextConversation = visibleConversations.value[0];
  if (nextConversation && nextConversation.id !== store.selectedId) {
    await store.selectConversation(nextConversation.id);
  }
  await syncRouteCandidateId();
}

async function onCandidateSelect(candidate: { id: string } | null) {
  const nextCandidateId = candidate?.id ?? null;
  const currentQueryCandidateId = workspaceCandidateId.value;

  if (currentQueryCandidateId === nextCandidateId) {
    return;
  }

  if (isLiveListening.value) {
    await stopLiveListening();
  }

  await replaceCandidateRoute(nextCandidateId);
}

async function ensureCandidateWorkspace(candidateId: string) {
  isSyncingCandidateWorkspace.value = true;

  try {
    if (candidatesStore.current?.candidate.id !== candidateId) {
      await candidatesStore.fetchOne(candidateId).catch(() => {
        // Candidate summary is optional UI context.
      });
    }

    const existingConversation = store.conversations.find(
      (conversation) => conversation.candidateId === candidateId,
    );

    if (existingConversation) {
      if (store.selectedId !== existingConversation.id) {
        await store.selectConversation(existingConversation.id);
      }
    } else {
      const conversation = await store.createConversation(
        undefined,
        candidateId,
      );
      if (store.selectedId !== conversation.id) {
        await store.selectConversation(conversation.id);
      }
    }

    await loadWorkflow(candidateId);
  } finally {
    isSyncingCandidateWorkspace.value = false;
  }
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
        workspaceCandidateId.value ?? undefined,
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

function appendTranscriptToPrompt() {
  const transcript = listenerTranscript.value.trim();
  if (!transcript) return;
  const current = promptInput.textInput.value.trim();
  promptInput.setTextInput(current ? `${current}\n${transcript}` : transcript);
}

function replacePromptWithTranscript() {
  const transcript = listenerTranscript.value.trim();
  if (!transcript) return;
  promptInput.setTextInput(transcript);
}

function clearListenerTranscript() {
  listenerTranscript.value = "";
  listenerBaseTranscriptRef.value = "";

  if (isLiveListening.value) {
    listenerSessionIdRef.value = crypto.randomUUID();
    listenerPendingAudioChunksRef.value = [];
  }
}

function getListenerAudioContextCtor() {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as Window & {
    webkitAudioContext?: ListenerAudioContextCtor;
  };
  return window.AudioContext || audioWindow.webkitAudioContext || null;
}

function mergeListenerTranscript(base: string, transcript: string) {
  const normalizedBase = base.trim();
  const normalizedTranscript = transcript.trim();
  if (!normalizedBase) {
    return normalizedTranscript;
  }
  if (!normalizedTranscript) {
    return normalizedBase;
  }
  return `${normalizedBase}\n${normalizedTranscript}`;
}

function mergeFloat32Chunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function downsampleFloat32Buffer(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
) {
  if (!input.length || inputSampleRate === outputSampleRate) {
    return input;
  }

  if (inputSampleRate < outputSampleRate) {
    return input;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / sampleRateRatio));
  const output = new Float32Array(outputLength);
  let inputOffset = 0;

  for (let index = 0; index < outputLength; index += 1) {
    const nextOffset = Math.min(
      input.length,
      Math.round((index + 1) * sampleRateRatio),
    );
    let sum = 0;
    let count = 0;
    for (let cursor = inputOffset; cursor < nextOffset; cursor += 1) {
      sum += input[cursor] ?? 0;
      count += 1;
    }
    output[index] = count > 0 ? sum / count : 0;
    inputOffset = nextOffset;
  }

  return output;
}

function writeWavString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeWavBlob(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeWavString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeWavString(view, 8, "WAVE");
  writeWavString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let dataOffset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(dataOffset, int16, true);
    dataOffset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function normalizeListenerError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "listener-transcription-failed";
}

async function cleanupLiveListeningResources() {
  if (listenerFlushTimer !== null && typeof window !== "undefined") {
    window.clearInterval(listenerFlushTimer);
    listenerFlushTimer = null;
  }

  const processorNode = audioProcessorNodeRef.value;
  if (processorNode) {
    processorNode.onaudioprocess = null;
    processorNode.disconnect();
    audioProcessorNodeRef.value = null;
  }

  audioSourceNodeRef.value?.disconnect();
  audioSourceNodeRef.value = null;
  audioSilenceGainNodeRef.value?.disconnect();
  audioSilenceGainNodeRef.value = null;

  const stream = audioStreamRef.value;
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    audioStreamRef.value = null;
  }

  const audioContext = audioContextRef.value;
  audioContextRef.value = null;
  if (audioContext) {
    try {
      await audioContext.close();
    } catch {
      // ignore close failures
    }
  }

  listenerPendingAudioChunksRef.value = [];
}

async function queueListenerTranscription(
  audioBlob: Blob | undefined,
  finalize: boolean,
) {
  const sessionId = listenerSessionIdRef.value;
  if (!sessionId) {
    return;
  }

  listenerTranscriptionChain = listenerTranscriptionChain
    .then(async () => {
      const result = await luiApi.transcribeListenerAudio({
        sessionId,
        audioFile: audioBlob,
        isFinal: finalize,
        sampleRate: 16000,
      });
      listenerTranscript.value = mergeListenerTranscript(
        listenerBaseTranscriptRef.value,
        result.transcript,
      );
    })
    .catch(async (error) => {
      listenerError.value = normalizeListenerError(error);
      isLiveListening.value = false;
      await cleanupLiveListeningResources();
    });

  await listenerTranscriptionChain;
}

async function flushListenerAudio(finalize: boolean) {
  const pendingChunks = listenerPendingAudioChunksRef.value;
  listenerPendingAudioChunksRef.value = [];

  if (!pendingChunks.length && !finalize) {
    return;
  }

  const inputSampleRate = audioContextRef.value?.sampleRate ?? 16000;
  const mergedAudio = pendingChunks.length
    ? mergeFloat32Chunks(pendingChunks)
    : new Float32Array();
  const resampledAudio = mergedAudio.length
    ? downsampleFloat32Buffer(mergedAudio, inputSampleRate, 16000)
    : new Float32Array();
  const audioBlob = resampledAudio.length
    ? encodeWavBlob(resampledAudio, 16000)
    : undefined;

  await queueListenerTranscription(audioBlob, finalize);
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

async function syncRouteCandidateId() {
  const candidateId = store.selectedConversation?.candidateId ?? null;
  if (workspaceCandidateId.value === candidateId) {
    return;
  }
  await replaceCandidateRoute(candidateId);
}

function initializeLiveListening() {
  listenerAvailable.value = Boolean(
    typeof window !== "undefined" &&
    getListenerAudioContextCtor() &&
    navigator.mediaDevices?.getUserMedia,
  );
}

async function startLiveListening() {
  const AudioContextCtor = getListenerAudioContextCtor();
  if (!AudioContextCtor || !navigator.mediaDevices?.getUserMedia) {
    listenerAvailable.value = false;
    return;
  }

  try {
    listenerError.value = null;
    listenerBaseTranscriptRef.value = listenerTranscript.value.trim();
    listenerSessionIdRef.value = crypto.randomUUID();
    listenerPendingAudioChunksRef.value = [];
    listenerTranscriptionChain = Promise.resolve();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const audioContext = new AudioContextCtor();
    await audioContext.resume();
    const audioSource = audioContext.createMediaStreamSource(stream);
    const audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    const silenceGain = audioContext.createGain();
    silenceGain.gain.value = 0;

    audioProcessor.onaudioprocess = (event) => {
      const channelData = event.inputBuffer.getChannelData(0);
      listenerPendingAudioChunksRef.value.push(new Float32Array(channelData));
    };

    audioSource.connect(audioProcessor);
    audioProcessor.connect(silenceGain);
    silenceGain.connect(audioContext.destination);

    audioContextRef.value = audioContext;
    audioStreamRef.value = stream;
    audioSourceNodeRef.value = audioSource;
    audioProcessorNodeRef.value = audioProcessor;
    audioSilenceGainNodeRef.value = silenceGain;
    listenerAvailable.value = true;
    isLiveListening.value = true;

    if (typeof window !== "undefined") {
      listenerFlushTimer = window.setInterval(() => {
        void flushListenerAudio(false);
      }, 1800);
    }
  } catch (error) {
    listenerError.value = normalizeListenerError(error);
    isLiveListening.value = false;
    await cleanupLiveListeningResources();
  }
}

async function stopLiveListening() {
  if (!isLiveListening.value && !listenerSessionIdRef.value) {
    return;
  }

  if (isLiveListening.value) {
    isLiveListening.value = false;
  }

  if (listenerFlushTimer !== null && typeof window !== "undefined") {
    window.clearInterval(listenerFlushTimer);
    listenerFlushTimer = null;
  }

  try {
    await flushListenerAudio(true);
  } finally {
    listenerSessionIdRef.value = null;
    await cleanupLiveListeningResources();
  }
}

async function toggleLiveListening() {
  if (isLiveListening.value) {
    await stopLiveListening();
    return;
  }

  listenerError.value = null;
  await startLiveListening();
}

function handleListenerShortcut(event: KeyboardEvent) {
  if (!(event.altKey && event.shiftKey && event.code === "KeyL")) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    event.preventDefault();
  } else {
    event.preventDefault();
  }

  void toggleLiveListening();
}

function uniqueSuggestions(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function formatSuggestionSubject(candidateName: string | null) {
  return candidateName ? `围绕候选人「${candidateName}」` : "基于当前上下文";
}

function buildStageSuggestions(
  stage: WorkflowState["currentStage"] | null,
  context: { candidateName: string | null },
) {
  const subject = formatSuggestionSubject(context.candidateName);

  if (stage === "S0") {
    return [
      `请${subject}先完成一版初筛结论，并明确给出通过、待定或淘汰建议。`,
      `请${subject}梳理最关键的能力亮点、风险点和需要进一步核验的信息。`,
      `请${subject}输出一份适合进入面试前讨论的结构化初筛摘要。`,
    ];
  }

  if (stage === "S1") {
    return [
      `请${subject}按照当前轮次先生成一套结构化面试题，并说明每题想验证什么。`,
      `请${subject}区分基础题、追问题和风险验证题，形成一份可直接使用的出题清单。`,
      `请${subject}结合前序结论，指出本轮面试最需要重点追问的三个方向。`,
    ];
  }

  if (stage === "S2") {
    return [
      `请${subject}先输出一版面试评估结论，分别说明优势、不足和建议结论。`,
      `请${subject}把当前面试记录整理成一份适合同步给面试官团队的评估摘要。`,
      `请${subject}明确给出录用建议、风险等级以及下一步动作。`,
    ];
  }

  if (stage === "completed") {
    return [
      `请${subject}复盘整个流程，整理出最终结论和可存档摘要。`,
      `请${subject}把已生成材料压缩成一份适合汇报的最终总结。`,
      `请${subject}指出当前流程已经完成的部分、遗留问题和建议 follow-up。`,
    ];
  }

  return [
    `请${subject}先给出当前最值得优先推进的第一步。`,
    `请${subject}做一次结构化分析，并告诉我接下来该怎么推进。`,
    `请${subject}把当前问题拆成三个最值得先处理的小步骤。`,
  ];
}

function buildToolAwareSuggestion(
  agent: { tools: string[]; name: string } | null,
  stage: WorkflowState["currentStage"] | null,
  context: { candidateName: string | null },
) {
  if (!agent?.tools?.length) {
    return null;
  }

  const subject = formatSuggestionSubject(context.candidateName);
  const toolsLabel = agent.tools.slice(0, 3).join("、");

  if (stage === "S0") {
    return `请${subject}优先使用 ${toolsLabel} 这些能力完成当前初筛判断，并把结果整理成结论。`;
  }

  if (stage === "S1") {
    return `请${subject}在当前出题阶段优先利用 ${toolsLabel} 相关能力，生成一份可直接使用的题纲。`;
  }

  if (stage === "S2") {
    return `请${subject}结合 ${toolsLabel} 这些能力完成评估总结，并明确给出最终建议。`;
  }

  return `请${subject}按照智能体「${agent.name}」可用的 ${toolsLabel} 能力，给我一个最合适的下一步。`;
}

function buildAgentSuggestions(
  agent: {
    name: string;
    description: string;
    systemPrompt: string;
    tools: string[];
  } | null,
  context: { candidateName: string | null; workflowStage: string | null },
) {
  const workflowStage =
    context.workflowStage === "S0" ||
    context.workflowStage === "S1" ||
    context.workflowStage === "S2" ||
    context.workflowStage === "completed"
      ? context.workflowStage
      : null;

  const stageSuggestions = buildStageSuggestions(workflowStage, {
    candidateName: context.candidateName,
  });

  const toolAwareSuggestion = buildToolAwareSuggestion(agent, workflowStage, {
    candidateName: context.candidateName,
  });

  const agentScopedSuggestion = agent
    ? `${formatSuggestionSubject(context.candidateName)}，请严格按照智能体「${agent.name}」的职责和技能边界来推进当前任务。`
    : null;

  return uniqueSuggestions([
    ...(toolAwareSuggestion ? [toolAwareSuggestion] : []),
    ...stageSuggestions,
    ...(agentScopedSuggestion ? [agentScopedSuggestion] : []),
  ]).slice(0, 3);
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
  const candidateId = workspaceCandidateId.value ?? undefined;
  await store.initialize({ skipAutoSelect: !!candidateId });
  isWorkspaceReady.value = true;

  if (!candidateId) {
    return;
  }

  await ensureCandidateWorkspace(candidateId);
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
