<template>
  <div
    :class="imsDesign.luiShell"
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
        :class="`border-r ${imsDesign.luiPanel}`"
      >
        <div class="flex h-full min-h-0 flex-col">
          <div :class="`flex h-12 items-center justify-between border-b px-3 ${imsDesign.luiToolbar}`">
            <AppBrandLink to="/candidates" />
            <div class="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                class="h-8 shrink-0 rounded-[6px] bg-[#0062FF] px-3 text-xs font-semibold text-[#FFFFFF] shadow-[0_8px_18px_-12px_#0B6BFF66] hover:bg-[#0057E6]"
                title="新建会话"
                @click="onConversationCreate"
              >
                <Plus class="h-4 w-4" />
                <span class="hidden xl:inline">新建</span>
              </Button>
              <AppUserActions />
            </div>
          </div>

          <div :class="`border-b px-3 py-2 ${imsDesign.luiSubPanel}`">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-semibold text-[#1A1A1A] dark:text-slate-100">会话历史</p>
                <p class="truncate text-[11px] leading-4 text-[#4B5563] dark:text-slate-300">
                  {{ visibleConversations.length }} 个工作台记录
                </p>
              </div>
              <Badge variant="outline" class="h-6 rounded-[6px] bg-[#F8FAFD] px-2 text-[11px] text-[#4B5563] dark:bg-white/8 dark:text-slate-200">
                LUI
              </Badge>
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
              <ConversationList
                data-onboarding="conversation-list"
                class="lui-conversation-list"
                :conversations="visibleConversations"
                :selected-id="store.selectedId"
                @select="onConversationSelect"
                @delete="onConversationDelete"
                @rename="onConversationRename"
              />
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
              :class="`min-h-0 border-t p-3 ${imsDesign.luiSubPanel}`"
            >
              <div
                v-if="artifactPills.length"
                class="mb-3 flex flex-wrap gap-1.5"
              >
                <Badge
                  v-for="artifact in artifactPills"
                  :key="artifact.id"
                  variant="outline"
                  class="h-6 max-w-full rounded-[6px] border-transparent bg-[#F8FAFD] px-2 text-[11px] font-semibold text-[#4B5563] shadow-[0_2px_6px_#00000008] dark:bg-white/8 dark:text-slate-200"
                >
                  <span class="shrink-0 text-[#0062FF]">{{ artifact.stage }}</span>
                  <span class="truncate">{{ artifact.title }}</span>
                </Badge>
              </div>
              <WorkflowArtifacts
                v-if="store.selectedWorkflow"
                :workflow="store.selectedWorkflow"
                :files="store.currentFiles"
                class="lui-workflow-artifacts rounded-[6px] border border-[#E5E7EB] bg-white p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ResizablePanel>

      <ResizableHandle
        id="lui-main-handle"
        class="w-3 cursor-col-resize bg-transparent hover:bg-[#D1D5DB]/60 dark:hover:bg-white/20"
      >
        <div
          class="h-15 w-1 rounded-full bg-[#D1D5DB] shadow-md transition-colors dark:bg-white/30 group-hover/handle:bg-[#0062FF]/75"
        />
      </ResizableHandle>

      <ResizablePanel
        id="lui-chat-panel"
        :default-size="100 - leftPanelWidth"
        :min-size="58"
        class="min-h-0"
      >
        <main class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-background">
          <div :class="`lui-toolbar flex h-12 items-center gap-2 border-b px-3 ${imsDesign.luiToolbar}`">
            <div class="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                :class="`h-8 w-8 shrink-0 ${imsDesign.luiControl}`"
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
                  :class="`h-8 shrink-0 px-2 text-xs font-semibold ${imsDesign.luiControl}`"
                >
                  <ArrowLeft class="h-4 w-4" />
                  <span class="hidden md:inline">返回</span>
                </Button>
              </RouterLink>
            </div>

            <div class="min-w-0 flex-1 px-1">
              <div v-if="store.selectedConversation" class="min-w-0">
                <p class="truncate text-sm font-semibold leading-6 text-[#1A1A1A] dark:text-slate-100">
                  {{ formatToolbarTitle(store.selectedConversation.title) }}
                </p>
              </div>

              <span
                v-else-if="interviewScene.currentCandidate.value"
                class="truncate text-sm font-semibold text-[#1A1A1A] dark:text-slate-100"
              >
                当前候选人工作区
              </span>
              <span v-else class="text-sm text-[#4B5563] dark:text-slate-300">
                选择或创建一个会话
              </span>
            </div>

            <div class="flex shrink-0 items-center gap-1.5">
              <Badge
                variant="outline"
                class="hidden h-8 rounded-[6px] border-transparent bg-[#F8FAFD] px-2.5 text-[11px] font-semibold text-[#4B5563] lg:inline-flex dark:bg-white/8 dark:text-slate-200"
              >
                队列 {{ store.tasks.length }}
              </Badge>
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
                class="h-8 gap-1.5 rounded-[6px] border-transparent bg-[#F8FAFD] px-2.5 text-xs font-semibold text-[#4B5563] shadow-none hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:bg-white/8 dark:text-slate-200 dark:hover:bg-white/14 dark:hover:text-white"
                :disabled="!currentSourceResume"
                @click="openSourceDocumentPreview"
              >
                <FileSearch class="h-4 w-4" />
                <span class="hidden md:inline">PDF</span>
              </Button>
              <div data-onboarding="agent-selector">
                <AgentSelector
                  :model-value="store.selectedAgentId"
                  :profile="agentSelectorProfile"
                  @select="onAgentSelect"
                />
              </div>
            </div>
          </div>

          <Conversation
            class="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <ConversationContent
              class="mx-auto min-h-0 w-full max-w-4xl flex-1 px-4 py-5 sm:px-6"
            >
              <ConversationEmptyState
                v-if="uiMessages.length === 0"
                title="今天想一起推进什么？"
                description="我可以基于你当前输入的内容、已选择的上下文和可用模型，帮你分析问题、整理信息、生成提纲，或继续把这段对话往前推进。"
                class="lui-empty-state min-h-[320px]"
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
                      class="lui-suggestion-card h-auto w-full min-w-0 justify-center whitespace-normal break-words rounded-[6px] border-[#E5E7EB] bg-[#F8FAFD] px-6 py-5 text-center text-base font-semibold leading-7 text-[#1A1A1A] shadow-[0_2px_6px_#00000008] transition-all duration-300 hover:scale-[1.01] hover:border-[#0062FF]/30 hover:bg-[#F9FAFB] hover:shadow-md dark:border-white/10 dark:bg-white/8 dark:text-slate-100 dark:hover:bg-white/14"
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
                    <ReasoningContent
                      :content="message.reasoning"
                      class="text-xs leading-6"
                    />
                  </Reasoning>

                  <MessageContent
                    v-if="shouldRenderMessageContent(message)"
                    class="w-full max-w-none space-y-3 group-[.is-user]:max-w-[80%] group-[.is-user]:rounded-[6px] group-[.is-user]:border group-[.is-user]:border-[#E5E7EB] group-[.is-user]:bg-[#F9FAFB] group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:shadow-[0_2px_6px_#00000008] group-[.is-assistant]:p-0 group-[.is-assistant]:shadow-none dark:group-[.is-user]:border-white/10 dark:group-[.is-user]:bg-white/7"
                  >
                    <div
                      v-if="
                        message.from === 'assistant' &&
                        message.status === 'streaming' &&
                        !message.primaryContent &&
                        !message.reasoning
                      "
                      class="flex items-center gap-2 text-sm text-[#4B5563] dark:text-slate-300"
                    >
                      <Loader2 class="h-4 w-4 animate-spin" />
                      正在生成
                    </div>

                    <MessageResponse
                      v-if="message.primaryContent"
                      :content="message.primaryContent"
                      :is-streaming="message.status === 'streaming'"
                      class="lui-message-response break-words"
                    />

                    <div v-if="message.tools?.length" class="space-y-2">
                      <div
                        v-for="(tool, index) in message.tools"
                        :key="`${message.key}-tool-${index}`"
                        class="rounded-[6px] border border-[#E5E7EB] bg-[#F8FAFD] px-3 py-2 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7"
                      >
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <p class="text-xs font-semibold text-[#1A1A1A] dark:text-slate-100">
                            工具调用 {{ index + 1 }}
                          </p>
                          <Badge
                            variant="outline"
                            class="h-6 rounded-[6px] border-transparent px-2 text-[11px] font-semibold"
                            :class="toolStatusBadgeClass(tool)"
                          >
                            {{ toolStatusLabel(tool) }}
                          </Badge>
                        </div>
                        <pre
                          class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-[#4B5563] dark:text-slate-300"
                          >{{ stringifyTool(tool) }}</pre
                        >
                      </div>
                    </div>

                    <div
                      v-if="message.status === 'error'"
                      class="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      响应失败，请重试。
                    </div>

                    <WorkflowActionCard
                      v-if="shouldRenderWorkflowActionCard(message)"
                      :workflow="store.selectedWorkflow"
                      :files="store.currentFiles"
                      :candidate-detail="currentSourceCandidateDetail"
                      class="lui-workflow-action-card"
                      @updated="refreshSelectedConversationWorkflow"
                    />
                  </MessageContent>
                </div>
              </Message>

              <Message
                v-if="showAssessmentReminder"
                from="assistant"
              >
                <div class="min-w-0 flex-1">
                  <div class="rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div class="space-y-1">
                        <p class="text-sm font-semibold text-foreground">
                          把本轮面试纪要丢到输入框
                        </p>
                        <p class="text-xs leading-5 text-muted-foreground">
                          直接把视频面试记录、候选人回答要点或你记下的纪要粘贴到下方输入框，我会按当前轮次生成评分报告和微信可复制文本；也可以上传文件。
                        </p>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          class="shrink-0"
                          @click="focusPromptInput"
                        >
                          去输入
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          class="shrink-0"
                          @click="openInterviewNotesUpload"
                        >
                          上传纪要
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Message>
            </ConversationContent>

            <template #overlay>
              <ConversationScrollButton />
            </template>

            <template #after>
              <TaskQueueIndicator :tasks="store.tasks" />

              <div :class="`shrink-0 border-t px-4 pb-2 pt-2 ${imsDesign.luiToolbar}`">
                <div class="mx-auto w-full">
                  <div data-onboarding="prompt-input">
                    <PromptInput
                      class="lui-prompt-input w-full rounded-[6px] border border-[#0063ff14] bg-white p-1.5 shadow-none dark:border-white/10 dark:bg-white/8"
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
                        class="min-h-[52px] border-0 bg-transparent px-3 py-2 text-sm caret-[#1A1A1A] shadow-none focus-visible:ring-0 dark:text-slate-100 dark:caret-slate-100 dark:placeholder:text-slate-400"
                        data-lui-prompt-input
                      />
                      </PromptInputBody>

                      <PromptInputFooter
                        class="mt-1 flex items-center justify-between gap-3 px-1 pb-1"
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

                          <div data-onboarding="model-selector">
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
                                      :class="[
                                        'lui-model-selector-item min-h-9 rounded-[6px]',
                                        store.selectedModelId === model.id && store.selectedModelProvider === provider.id
                                          ? 'bg-[#EEF4FF] text-[#1A1A1A]'
                                          : 'text-[#4B5563] hover:bg-[#F9FAFB]',
                                      ]"
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
                          </div>

                          <Input
                            v-if="isManualModel"
                            v-model="store.customModelName"
                            type="text"
                            placeholder="输入模型名称（如 MiniMax-M2.7）"
                            class="h-8 max-w-[240px] rounded-[6px] border-[#E5E7EB] bg-white text-xs"
                            :disabled="
                              chatStatus === 'submitted' || chatStatus === 'streaming'
                            "
                          />
                        </PromptInputTools>

                        <Button
                          v-if="canRetryLastPrompt"
                          type="button"
                          variant="outline"
                          size="sm"
                          class="shrink-0"
                          @click="retryLastPrompt"
                        >
                          重试
                        </Button>

                        <PromptInputSubmit
                          :disabled="
                            chatStatus === 'submitted' ||
                            chatStatus === 'streaming' ||
                            !canSubmitPrompt
                          "
                          :status="chatStatus"
                          class="h-8 w-8 rounded-[6px] bg-[#0062FF] text-[#FFFFFF] hover:bg-[#0057E6]"
                        />
                      </PromptInputFooter>
                    </PromptInput>
                  </div>
                </div>
              </div>
            </template>
          </Conversation>
        </main>
      </ResizablePanel>
    </ResizablePanelGroup>

    <Dialog
      :open="sourceDocumentPreviewOpen"
      content-class="flex h-[80vh] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
      @update:open="handleSourceDocumentPreviewOpenChange"
    >
      <template #content>
        <AppDialogLayout v-if="currentSourceResume" class="min-h-0 flex-1" body-class="overflow-hidden py-0">
          <template #header>
            <DialogHeader>
              <div class="flex items-start justify-between gap-3 pr-8">
                <div class="min-w-0">
                  <DialogTitle class="truncate pr-2 text-sm font-semibold">
                    {{ currentSourceResumeDisplayName }}
                  </DialogTitle>
                  <DialogDescription class="pt-1 text-xs">
                    {{ formatResumeSize(currentSourceResume.fileSize) }}
                  </DialogDescription>
                </div>
                <Button type="button" variant="outline" size="sm" class="gap-1.5" @click="downloadSourceDocument">
                  <Download class="h-4 w-4" />
                  <span class="hidden sm:inline">下载</span>
                </Button>
              </div>
            </DialogHeader>
          </template>

          <div class="h-full min-h-0 overflow-hidden bg-white">
            <div
              v-if="sourcePreviewLoading"
              class="flex h-full items-center justify-center px-6 text-sm text-muted-foreground"
            >
              <Loader2 class="mr-2 h-5 w-5 animate-spin" />
              正在加载原件预览…
            </div>
            <div
              v-else-if="sourcePreviewError"
              class="flex h-full items-center justify-center px-6 text-sm text-destructive"
            >
              {{ sourcePreviewError }}
            </div>
            <iframe
              v-else-if="sourcePreviewObjectUrl && isSourceDocumentPdf"
              :src="sourcePreviewObjectUrl"
              class="h-full w-full bg-background"
              title="PDF 源文档预览"
            />
            <div
              v-else-if="sourcePreviewObjectUrl && isSourceDocumentImage"
              class="flex h-full items-center justify-center bg-background p-4"
            >
              <img
                :src="sourcePreviewObjectUrl"
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
        </AppDialogLayout>
      </template>
    </Dialog>

    <GatewayEndpointDialog
      :open="gatewaySetupDialogOpen"
      title="先配置模型厂商"
      description="发送消息前需要先添加至少一个 AI Gateway 端点。保存后会自动设为默认端点。"
      :preset-providers="presetProviders"
      :model-options="gatewayModelOptions"
      :initial-provider-id="presetProviders[0]?.id ?? ''"
      :initial-model-id="store.selectedModelId || ''"
      :saving="isSavingGatewaySetup"
      :testing="isTestingGatewaySetup"
      save-button-text="保存并继续"
      @update:open="handleGatewaySetupDialogOpenChange"
      @save="saveGatewaySetupFromDialog"
      @test="testGatewaySetupFromDialog"
    />
  </div>
</template>

<script setup lang="ts">
import type { ChatStatus } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Bot,
  Check,
  Download,
  FileSearch,
  Loader2,
  PanelLeft,
  Plus,
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
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
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
  ReasoningContent,
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
import { imsDesign } from "@/components/layout/ims-design";
import AgentSelector from "@/components/lui/agent-selector.vue";
import CandidateSelector from "@/components/lui/candidate-selector.vue";
import ConversationList from "@/components/lui/conversation-list.vue";
import GatewayEndpointDialog from "@/components/lui/gateway-endpoint-dialog.vue";
import WorkflowActionCard from "@/components/lui/workflow-action-card.vue";
import WorkflowArtifacts from "@/components/lui/workflow-artifacts.vue";
import TaskQueueIndicator from "@/components/lui/task-queue-indicator.vue";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogLayout } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  candidatesApi,
  resolveResumePreviewContentType,
} from "@/api/candidates";
import { ApiError } from "@/api/client";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { PRESET_PROVIDER_BASE_URLS, type GatewayEndpoint } from "@/lib/ai-gateway-config";
import { useAuthStore } from "@/stores/auth";
import { useCandidatesStore } from "@/stores/candidates";
import type { Agent, Message as LuiStoreMessage } from "@/stores/lui/types";
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

interface PresetProvider {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

interface UiMessageItem {
  key: string;
  from: "user" | "assistant" | "system";
  status: "streaming" | "error" | "complete";
  createdAt: number;
  primaryContent: string;
  workflowAction: "confirm-round" | "advance-stage" | "complete-workflow" | null;
  reasoning?: string | null;
  tools?: unknown[] | null;
  sources: SourceItem[];
}

const STALE_STREAMING_MESSAGE_MS = 2 * 60 * 1000;
const STREAMING_LEAVE_WARNING = "AI 正在回复中，离开当前页面可能会让你看不到完整的流式输出。确定要离开吗？";

const acceptedFileTypes = ".png,.jpg,.jpeg,.webp,.imr";
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
const { notifyError, notifySuccess, notifyWarning } = useAppNotifications();

const LUI_LEFT_PANEL_WIDTH_STORAGE_KEY = "lui-left-panel-width";
const LUI_LEFT_TOP_PANE_SIZE_STORAGE_KEY = "lui-left-top-pane-size";

const inputText = ref("");
// const leftSidebarOpen = ref(true);
const leftPanelRef = ref<InstanceType<typeof ResizablePanel> | null>(null);
const modelSelectorOpen = ref(false);
const isSubmittingPrompt = ref(false);
const lastSubmittedPrompt = ref<{ text: string; files: File[]; conversationId: string } | null>(null);
const lastFailedPrompt = ref<{ text: string; files: File[]; conversationId: string } | null>(null);
const gatewaySetupDialogOpen = ref(false);
const isSavingGatewaySetup = ref(false);
const isTestingGatewaySetup = ref(false);
const presetProviders = ref<PresetProvider[]>([]);
const leftPanelWidth = ref(readStoredPanelSize(
  LUI_LEFT_PANEL_WIDTH_STORAGE_KEY,
  31,
  22,
  42,
));
const leftTopPaneSize = ref(readStoredPanelSize(
  LUI_LEFT_TOP_PANE_SIZE_STORAGE_KEY,
  50,
  30,
  75,
));
const isWorkspaceReady = ref(false);
const sourceDocumentPreviewOpen = ref(false);
const sourcePreviewObjectUrl = ref<string | null>(null);
const sourcePreviewLoading = ref(false);
const sourcePreviewError = ref<string | null>(null);
const sourcePreviewRequestToken = ref(0);

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

function openInterviewNotesUpload() {
  promptInput.openFileDialog();
}

function focusPromptInput() {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLTextAreaElement>("[data-lui-prompt-input]");
    if (!input) return;
    input.focus();
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

const userPhone = computed(() => {
  return (route.query.phone as string) || authStore.user?.phone || null;
});

const explicitRouteCandidateId = computed(() => {
  const queryCandidateId = route.query.candidateId;
  return typeof queryCandidateId === "string" && queryCandidateId.trim()
    ? queryCandidateId.trim()
    : null;
});
const explicitRouteConversationId = computed(() => {
  const queryConversationId = route.query.conversationId;
  return typeof queryConversationId === "string" && queryConversationId.trim()
    ? queryConversationId.trim()
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

const showAssessmentReminder = computed(() => {
  const workflow = store.selectedWorkflow;
  if (!workflow || workflow.currentStage !== "S2") {
    return false;
  }
  return !workflow.artifacts.some((artifact) => artifact.stage === "S2");
});
const currentSourceResumeDisplayName = computed(() => {
  return decodeDisplayFileName(currentSourceResume.value?.fileName ?? "源文档");
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
const isInterviewSuggestionContext = computed(() =>
  routeScene.value === "interview" ||
  isInterviewAgent(activeSuggestionAgent.value),
);

const chatStatus = computed<ChatStatus>(() => {
  const lastMessage = uiMessages.value.at(-1);
  if (lastMessage?.status === "streaming") return "streaming";
  if (lastMessage?.status === "error") return "error";
  if (isSubmittingPrompt.value) return "submitted";
  return "ready";
});

const isStreamingResponseActive = computed(() =>
  chatStatus.value === "submitted" || chatStatus.value === "streaming",
);

onBeforeRouteLeave(() => {
  if (!isStreamingResponseActive.value) {
    return true;
  }

  return window.confirm(STREAMING_LEAVE_WARNING);
});

function handleStreamingBeforeUnload(event: BeforeUnloadEvent) {
  if (!isStreamingResponseActive.value) {
    return;
  }

  event.preventDefault();
  event.returnValue = STREAMING_LEAVE_WARNING;
}

const canRetryLastPrompt = computed(() => {
  return Boolean(
    lastFailedPrompt.value
    && store.selectedId
    && lastFailedPrompt.value.conversationId === store.selectedId,
  );
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
  if (isInterviewSuggestionContext.value) {
    return "点击下方快捷入口后会直接开始执行当前候选人的面试初筛，不需要再手动点发送。";
  }

  if (agent) {
    return `以下建议会根据当前智能体「${agent.name}」的职责与技能生成，点击后会直接填入底部输入区。`;
  }

  return "建议会根据当前智能体配置和上下文生成，点击后会直接填入底部输入区。";
});

const genericStarterSuggestions = computed(() =>
  buildGenericSuggestions(
    activeSuggestionAgent.value,
    agentSelectorProfile.value,
    isInterviewSuggestionContext.value,
  ),
);

const uiMessages = computed<UiMessageItem[]>(() => {
  return store.currentMessages.map((message) => ({
    key: message.id,
    from: message.role,
    status: resolveUiMessageStatus(message),
    createdAt: message.createdAt.getTime(),
    primaryContent: sanitizeMessageContent(message.content),
    workflowAction: message.workflowAction ?? null,
    reasoning: message.reasoning,
    tools: message.tools,
    sources: extractSources(message.tools),
  }));
});

const artifactPills = computed(() => {
  return (store.selectedWorkflow?.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    stage: artifact.stage,
    title: artifact.title || artifact.fileName,
  }));
});

const latestAssistantMessageKey = computed(() => {
  for (let index = uiMessages.value.length - 1; index >= 0; index -= 1) {
    const message = uiMessages.value[index];
    if (message.from === "assistant") {
      return message.key;
    }
  }

  return null;
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

const gatewayModelOptions = computed(() =>
  store.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      providerId: provider.id,
      label: `${provider.name} / ${model.displayName || model.name || model.id}`,
    })),
  ),
);

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

  // 模型/厂商校验在发送前统一拦截，并弹出对应配置入口。
  return true;
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

watch(
  () => [sourceDocumentPreviewOpen.value, currentSourceResume.value?.id] as const,
  ([open, resumeId], [, previousResumeId]) => {
    if (!open) {
      return;
    }

    if (!resumeId) {
      sourcePreviewError.value = "当前候选人暂无可预览的简历原件";
      return;
    }

    if (resumeId === previousResumeId && sourcePreviewObjectUrl.value) {
      return;
    }

    const resume = currentSourceResume.value;
    if (resume) {
      void loadSourceDocumentPreview(resume);
    }
  },
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

watch(
  () => chatStatus.value,
  (status) => {
    if (
      status === "error"
      && lastSubmittedPrompt.value
      && store.selectedId === lastSubmittedPrompt.value.conversationId
    ) {
      lastFailedPrompt.value = lastSubmittedPrompt.value;
      return;
    }
    if (status !== "error") {
      lastFailedPrompt.value = null;
    }
  },
);

async function onConversationSelect(id: string) {
  const conversation = store.conversations.find((item) => item.id === id) ?? null;
  await store.selectConversation(id);
  await replaceConversationRoute(conversation);
}

async function onConversationCreate() {
  const conversation = await store.createConversation(
    undefined,
    hasInterviewContext.value
      ? (explicitRouteCandidateId.value ?? undefined)
      : undefined,
    { forceCreate: true },
  );
  await store.selectConversation(conversation.id);
  await replaceConversationRoute(conversation);
}

async function onConversationDelete(id: string) {
  await store.deleteConversation(id);
  const nextConversation = visibleConversations.value[0];
  if (nextConversation && nextConversation.id !== store.selectedId) {
    await store.selectConversation(nextConversation.id);
    await replaceConversationRoute(nextConversation);
  }
}

async function onConversationRename(id: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  try {
    await store.updateConversationTitle(id, trimmed);
  } catch (error) {
    notifyError(error, {
      title: "更新会话名称失败",
      fallbackMessage: "暂时无法更新会话名称",
    });
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
  void loadSourceDocumentPreview(currentSourceResume.value);
}

function handleSourceDocumentPreviewOpenChange(open: boolean) {
  sourceDocumentPreviewOpen.value = open;
  if (!open) {
    cleanupSourceDocumentPreview();
  }
}

async function loadSourceDocumentPreview(resume: CandidateResume) {
  const requestToken = ++sourcePreviewRequestToken.value;
  sourcePreviewLoading.value = true;
  sourcePreviewError.value = null;
  revokeSourcePreviewObjectUrl();

  try {
    const preview = await candidatesApi.loadResumePreviewSource(resume.id);
    if (!sourceDocumentPreviewOpen.value || currentSourceResume.value?.id !== resume.id || requestToken !== sourcePreviewRequestToken.value) {
      URL.revokeObjectURL(preview.objectUrl);
      return;
    }

    sourcePreviewObjectUrl.value = preview.objectUrl;
  } catch (error) {
    if (requestToken !== sourcePreviewRequestToken.value) {
      return;
    }

    sourcePreviewError.value = error instanceof Error ? error.message : "原件预览加载失败";
  } finally {
    if (requestToken === sourcePreviewRequestToken.value) {
      sourcePreviewLoading.value = false;
    }
  }
}

function revokeSourcePreviewObjectUrl() {
  if (!sourcePreviewObjectUrl.value) {
    return;
  }

  if (sourcePreviewObjectUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(sourcePreviewObjectUrl.value);
  }

  sourcePreviewObjectUrl.value = null;
}

function cleanupSourceDocumentPreview() {
  sourcePreviewRequestToken.value += 1;
  revokeSourcePreviewObjectUrl();
  sourcePreviewLoading.value = false;
  sourcePreviewError.value = null;
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

  if (!ensurePromptCanSend(text)) {
    return;
  }

  isSubmittingPrompt.value = true;
  void submitPrompt({ text, files });
}

async function retryLastPrompt() {
  if (!canRetryLastPrompt.value || !lastFailedPrompt.value) {
    return;
  }
  if (chatStatus.value === "submitted" || chatStatus.value === "streaming") {
    return;
  }
  isSubmittingPrompt.value = true;
  await submitPrompt({
    text: lastFailedPrompt.value.text,
    files: lastFailedPrompt.value.files,
  });
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

    lastSubmittedPrompt.value = { text, files, conversationId };
    lastFailedPrompt.value = null;

    for (const file of files) {
      await store.addFileResource(conversationId, file);
    }

    if (!text) {
      return;
    }

    if (shouldGenerateTitleFromFirstMessage) {
      void generateConversationTitle(conversationId, text);
    }

    const sendingPromise = store.sendMessage(conversationId, text);
    isSubmittingPrompt.value = false;
    await sendingPromise;
  } catch (err) {
    isSubmittingPrompt.value = false;
    if (lastSubmittedPrompt.value) {
      lastFailedPrompt.value = lastSubmittedPrompt.value;
    }
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

async function refreshSelectedConversationWorkflow() {
  if (!store.selectedId) {
    return
  }

  await store.loadConversation(store.selectedId)

  if (workspaceCandidateId.value) {
    await candidatesStore.fetchOne(workspaceCandidateId.value).catch(() => {
      return undefined
    })
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
  } catch (_error) {
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

function buildFallbackPresetProviders(): PresetProvider[] {
  return [
    { id: "openai", name: "OpenAI", icon: "OpenAI", baseURL: PRESET_PROVIDER_BASE_URLS.openai ?? "" },
    { id: "anthropic", name: "Anthropic", icon: "Anthropic", baseURL: PRESET_PROVIDER_BASE_URLS.anthropic ?? "" },
    { id: "minimax", name: "MiniMax", icon: "MiniMax", baseURL: PRESET_PROVIDER_BASE_URLS.minimax ?? "" },
    { id: "moonshot", name: "Moonshot", icon: "Moonshot", baseURL: PRESET_PROVIDER_BASE_URLS.moonshot ?? "" },
    { id: "deepseek", name: "DeepSeek", icon: "DeepSeek", baseURL: PRESET_PROVIDER_BASE_URLS.deepseek ?? "" },
    { id: "gemini", name: "Google Gemini", icon: "Gemini", baseURL: PRESET_PROVIDER_BASE_URLS.gemini ?? "" },
    { id: "siliconflow", name: "SiliconFlow", icon: "SiliconFlow", baseURL: PRESET_PROVIDER_BASE_URLS.siliconflow ?? "" },
    { id: "openrouter", name: "OpenRouter", icon: "OpenRouter", baseURL: PRESET_PROVIDER_BASE_URLS.openrouter ?? "" },
    { id: "grok", name: "Grok", icon: "Grok", baseURL: PRESET_PROVIDER_BASE_URLS.grok ?? "" },
  ];
}

async function loadPresetProviders() {
  try {
    const data = await luiApi.listPresetProviders();
    presetProviders.value = data.providers.map((provider) => ({
      ...provider,
      baseURL: PRESET_PROVIDER_BASE_URLS[provider.id] ?? "",
    }));
  } catch (error) {
    reportAppError("lui/load-preset-providers", error, {
      title: "加载预设模型厂商失败",
      fallbackMessage: "将使用内置厂商列表",
    });
    presetProviders.value = buildFallbackPresetProviders();
  }
}

function openGatewaySetupDialog() {
  if (presetProviders.value.length === 0) {
    presetProviders.value = buildFallbackPresetProviders();
  }
  gatewaySetupDialogOpen.value = true;
}

function handleGatewaySetupDialogOpenChange(open: boolean) {
  if (!open && (isSavingGatewaySetup.value || isTestingGatewaySetup.value)) {
    return;
  }
  gatewaySetupDialogOpen.value = open;
}

async function saveGatewaySetupFromDialog(payload: { providerId: string; apiKey: string; modelId: string }) {
  const endpoint = buildGatewayEndpointFromDialogPayload(payload);
  if (!endpoint) {
    return;
  }

  isSavingGatewaySetup.value = true;
  try {
    await store.registerCustomEndpoint(endpoint);

    if (endpoint.modelId) {
      store.selectModel(endpoint.modelId, endpoint.providerId);
    }

    notifySuccess("模型厂商已保存");
    gatewaySetupDialogOpen.value = false;
    if (!store.selectedModelId || !store.selectedModelProvider) {
      modelSelectorOpen.value = true;
    }
  } catch (error) {
    notifyError(
      reportAppError("lui/save-gateway-from-dialog", error, {
        title: "保存模型厂商配置失败",
        fallbackMessage: "请检查 API Key 或稍后重试",
      }),
    );
  } finally {
    isSavingGatewaySetup.value = false;
  }
}

function buildGatewayEndpointFromDialogPayload(payload: { providerId: string; apiKey: string; modelId: string }): GatewayEndpoint | null {
  const provider = presetProviders.value.find((item) => item.id === payload.providerId);
  if (!provider) {
    notifyError("请选择模型厂商");
    return null;
  }

  const apiKey = payload.apiKey.trim();
  const modelId = payload.modelId.trim();
  if (!apiKey) {
    notifyError("请输入 API Key");
    return null;
  }

  const selectedModelOption = modelId
    ? gatewayModelOptions.value.find((item) => item.id === modelId && item.providerId === payload.providerId)
    : null;

  return {
    id: provider.id,
    name: provider.name,
    provider: provider.id,
    baseURL: provider.baseURL,
    providerId: provider.id,
    apiKey,
    ...(modelId ? { modelId } : {}),
    ...(selectedModelOption?.label ? { modelDisplayName: selectedModelOption.label } : {}),
  };
}

async function testGatewaySetupFromDialog(payload: { providerId: string; apiKey: string; modelId: string }) {
  const endpoint = buildGatewayEndpointFromDialogPayload(payload);
  if (!endpoint) {
    return;
  }

  isTestingGatewaySetup.value = true;
  try {
    const result = await store.testCustomEndpoint(endpoint);
    if (result.modelCount > 0) {
      notifySuccess(`连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`);
    } else {
      notifyWarning("连接成功，但当前端点未返回任何模型");
    }
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "测试端点连接失败");
  } finally {
    isTestingGatewaySetup.value = false;
  }
}

function ensurePromptCanSend(text: string) {
  if (text && store.customEndpoints.length === 0) {
    openGatewaySetupDialog();
    notifyError(
      reportAppError("lui/provider-required", new Error("请先配置模型厂商"), {
        title: "无法发送消息",
        fallbackMessage: "请先配置模型厂商后再发送消息",
      }),
    );
    return false;
  }

  if (text && !hasSelectedModel.value) {
    modelSelectorOpen.value = true;
    notifyError(
      reportAppError("lui/model-required", new Error("请先选择模型"), {
        title: "无法发送消息",
        fallbackMessage: "请先选择模型后再发送消息",
      }),
    );
    return false;
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
    return false;
  }

  return true;
}

function applySuggestion(suggestion: string) {
  if (chatStatus.value === "submitted" || chatStatus.value === "streaming") {
    return;
  }

  if (isInterviewSuggestionContext.value) {
    if (!ensurePromptCanSend(suggestion)) {
      return;
    }
    isSubmittingPrompt.value = true;
    void submitPrompt({ text: suggestion, files: [] });
    return;
  }

  promptInput.setTextInput(suggestion);
}

function onMainSplitLayout(sizes: number[]) {
  const leftSize = sizes[0];
  if (typeof leftSize === "number") {
    const nextSize = Number(leftSize.toFixed(2));
    leftPanelWidth.value = nextSize;
    persistPanelSize(LUI_LEFT_PANEL_WIDTH_STORAGE_KEY, nextSize);
  }
}

function onLeftVerticalLayout(sizes: number[]) {
  const topSize = sizes[0];
  if (typeof topSize === "number") {
    const nextSize = Number(topSize.toFixed(2));
    leftTopPaneSize.value = nextSize;
    persistPanelSize(LUI_LEFT_TOP_PANE_SIZE_STORAGE_KEY, nextSize);
  }
}

function readStoredPanelSize(
  storageKey: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsedValue));
}

function persistPanelSize(storageKey: string, value: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, String(value));
}

async function replaceCandidateRoute(candidateId: string | null) {
  const nextQuery = { ...route.query };
  if (candidateId) {
    nextQuery.candidateId = candidateId;
  } else {
    delete nextQuery.candidateId;
  }
  delete nextQuery.conversationId;

  await router.replace({ path: "/lui", query: nextQuery });
}

async function replaceConversationRoute(conversation: { id: string; candidateId: string | null } | null) {
  const nextQuery = { ...route.query };
  if (conversation?.candidateId) {
    nextQuery.candidateId = conversation.candidateId;
  } else {
    delete nextQuery.candidateId;
  }
  if (conversation?.id) {
    nextQuery.conversationId = conversation.id;
  } else {
    delete nextQuery.conversationId;
  }
  await router.replace({ path: "/lui", query: nextQuery });
}

async function recoverFromMissingRouteConversation(candidateId: string | undefined) {
  notifyWarning("指定会话不存在，已为你切换到可用工作区。", {
    title: "会话已失效",
    durationMs: 5000,
  });

  if (candidateId) {
    await interviewScene.ensureWorkspace(candidateId);
    await replaceConversationRoute(store.selectedConversation ?? null);
    return;
  }

  const firstGenericConversation = store.conversations.find(
    (conversation) => conversation.candidateId === null,
  ) ?? null;

  if (firstGenericConversation) {
    await store.selectConversation(firstGenericConversation.id);
    await replaceConversationRoute(firstGenericConversation);
    return;
  }

  await replaceConversationRoute(null);
}

function formatResumeSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeDisplayFileName(fileName: string) {
  try {
    return decodeURIComponent(fileName);
  } catch (_error) {
    return fileName;
  }
}

function buildGenericSuggestions(
  agent: Agent | null,
  profile: LuiAgentSelectorProfile,
  isInterviewContext: boolean,
) {
  if (isInterviewContext) {
    return ["帮我开始进行面试初筛。"];
  }

  const capabilityPool = [
    ...profile.skills,
    ...profile.tools,
    agent?.description ?? "",
    agent?.name ?? "",
  ].filter((item) => item && item.trim().length > 0);

  const suggestions: string[] = [];

  for (const capability of capabilityPool) {
    const normalized = capability.toLowerCase();

    if (
      normalized.includes("简历") ||
      normalized.includes("筛选") ||
      normalized.includes("resume")
    ) {
      suggestions.push("帮我筛选这份简历，指出匹配度、亮点和主要风险点。");
    }

    if (
      normalized.includes("面试") ||
      normalized.includes("interview") ||
      normalized.includes("问题")
    ) {
      suggestions.push("请结合当前候选人情况，给我这一轮的 6 个面试题，并标注重点考察点与每题建议时长，总时长控制在 45 分钟内。");
    }

    if (
      normalized.includes("评估") ||
      normalized.includes("评价") ||
      normalized.includes("assessment")
    ) {
      suggestions.push("我把本轮面试纪要贴给你，请按评估模板直接输出评分报告和微信复制文本。");
    }

    if (
      normalized.includes("梳理") ||
      normalized.includes("整理") ||
      normalized.includes("summary")
    ) {
      suggestions.push("帮我梳理这位候选人的关键信息，整理成亮点、风险和待确认问题三部分。");
    }

    if (
      normalized.includes("提纲") ||
      normalized.includes("计划") ||
      normalized.includes("outline")
    ) {
      suggestions.push("请按当前目标帮我拆成三个下一步，并给出每一步的产出物。");
    }

    if (
      normalized.includes("问答") ||
      normalized.includes("分析") ||
      normalized.includes("general")
    ) {
      suggestions.push("请先分析我当前要处理的问题，再给我一个最省力的推进方案。");
    }
  }

  const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, 3);

  if (uniqueSuggestions.length >= 3) {
    return uniqueSuggestions;
  }

  const fallback = [
    agent
      ? `请按智能体「${agent.name}」的职责，先帮我拆出当前任务的三个下一步。`
      : "请先帮我梳理当前问题，并给出三个可执行的下一步。",
    "请基于当前上下文帮我整理关键信息，并生成一版简洁提纲。",
    "请先判断我现在最值得优先推进的一件事，并说明原因。",
  ];

  for (const item of fallback) {
    if (!uniqueSuggestions.includes(item)) {
      uniqueSuggestions.push(item);
    }
    if (uniqueSuggestions.length === 3) {
      break;
    }
  }

  return uniqueSuggestions;
}

function shouldRenderMessageContent(message: UiMessageItem) {
  if (message.from !== "assistant") {
    return true;
  }

  if (message.primaryContent.trim().length > 0) {
    return true;
  }

  if ((message.reasoning?.trim().length ?? 0) > 0) {
    return message.status !== "streaming";
  }

  if ((message.tools?.length ?? 0) > 0) {
    return true;
  }

  if (message.status === "error") {
    return true;
  }

  return message.status === "streaming" && !message.reasoning;
}

function resolveUiMessageStatus(message: LuiStoreMessage) {
  if (
    message.role === "assistant"
    && message.status === "streaming"
    && message.content.trim().length === 0
    && (message.reasoning?.trim().length ?? 0) === 0
    && (message.tools?.length ?? 0) === 0
    && Date.now() - message.createdAt.getTime() > STALE_STREAMING_MESSAGE_MS
  ) {
    return "error" as const;
  }

  return message.status;
}

function shouldRenderWorkflowActionCard(message: UiMessageItem) {
  if (message.key !== latestAssistantMessageKey.value) {
    return false;
  }

  if (message.status === "streaming") {
    return false;
  }

  const workflow = store.selectedWorkflow;
  if (!workflow) {
    return false;
  }

  const hasAssessmentArtifact = workflow.artifacts.some(
    (artifact) => artifact.stage === "S2",
  );
  if (hasAssessmentArtifact) {
    return true;
  }

  if (workflow.requiresRoundConfirmation) {
    return true;
  }

  const needsAssessmentNotes = workflow.currentStage === "S2" && !hasAssessmentArtifact;
  const canAdvanceByWorkflowState = Boolean(
    !needsAssessmentNotes
    && workflow.currentStage !== "completed"
    && workflow.recommendedNextStage
    && workflow.recommendedNextStage !== workflow.currentStage,
  );
  if (canAdvanceByWorkflowState) {
    return true;
  }

  if (
    workflow.currentStage === "S2"
    && workflow.availableNextStages.length > 0
    && (message.workflowAction === "advance-stage" || message.workflowAction === "complete-workflow")
  ) {
    return true;
  }

  if (message.workflowAction === "confirm-round") {
    return workflow.requiresRoundConfirmation;
  }

  if (message.workflowAction === "advance-stage") {
    return Boolean(
      workflow.recommendedNextStage
      && workflow.recommendedNextStage !== "completed"
      && !workflow.requiresRoundConfirmation,
    );
  }

  if (message.workflowAction === "complete-workflow") {
    return workflow.recommendedNextStage === "completed";
  }

  return false;
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

function toolStatusLabel(tool: unknown) {
  const status = resolveToolStatus(tool);
  switch (status) {
    case "approval-requested":
      return "approval-requested";
    case "output-available":
      return "output-available";
    default:
      return "input-available";
  }
}

function toolStatusBadgeClass(tool: unknown) {
  const status = resolveToolStatus(tool);
  switch (status) {
    case "approval-requested":
      return "bg-amber-50 text-amber-700";
    case "output-available":
      return "bg-[#EEF4FF] text-[#0062FF]";
    default:
      return "bg-[#F3F4F6] text-[#4B5563]";
  }
}

function resolveToolStatus(tool: unknown) {
  if (!tool || typeof tool !== "object") {
    return "input-available" as const;
  }

  const candidate = tool as Record<string, unknown>;
  const rawStatus = [candidate.status, candidate.state, candidate.type]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (rawStatus.includes("approval") || rawStatus.includes("confirm")) {
    return "approval-requested" as const;
  }

  if (
    rawStatus.includes("output")
    || rawStatus.includes("result")
    || rawStatus.includes("complete")
    || candidate.output
    || candidate.result
  ) {
    return "output-available" as const;
  }

  return "input-available" as const;
}

function sanitizeMessageContent(content: string | null | undefined): string {
  if (!content) {
    return "";
  }

  let sanitized = content;
  sanitized = sanitized.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
  sanitized = sanitized.replace(/<function_calls>[\s\S]*$/g, "");
  sanitized = sanitized.replace(/<\/function_calls>/g, "");
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");
  return sanitized.trim();
}

onMounted(async () => {
  window.addEventListener("beforeunload", handleStreamingBeforeUnload);

  await loadPresetProviders();
  const candidateId = explicitRouteCandidateId.value ?? undefined;
  await store.initialize({ skipAutoSelect: true });

  if (explicitRouteConversationId.value) {
    try {
      await store.selectConversation(explicitRouteConversationId.value);
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 404 && error.code !== "NOT_FOUND")) {
        throw error;
      }
    }

    if (store.selectedId !== explicitRouteConversationId.value) {
      await recoverFromMissingRouteConversation(candidateId);
    }
  }

  if (!candidateId) {
    if (!store.selectedId) {
      const firstGenericConversation = store.conversations.find(
        (conversation) => conversation.candidateId === null,
      );
      if (firstGenericConversation) {
        await store.selectConversation(firstGenericConversation.id);
        await replaceConversationRoute(firstGenericConversation);
      }
    }
  }

  isWorkspaceReady.value = true;

  if (!candidateId) {
    return;
  }

  await interviewScene.ensureWorkspace(candidateId);
});

onBeforeUnmount(() => {
  cleanupSourceDocumentPreview();
  window.removeEventListener("beforeunload", handleStreamingBeforeUnload);
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

.lui-toolbar :deep(button),
.lui-prompt-input :deep(button) {
  min-height: 32px;
  border-radius: 6px;
}

.lui-toolbar :deep(button) {
  background: #ffffff;
  color: #4b5563;
  box-shadow: none;
}

.lui-toolbar :deep(button:hover) {
  background: #eef4ff;
  color: #0062ff;
}

.lui-conversation-list :deep(aside) {
  background: #ffffff;
}

.lui-conversation-list :deep(ul) {
  padding: 8px;
}

.lui-conversation-list :deep(.conversation-row-button) {
  min-height: 40px;
  border-radius: 6px;
  color: #4b5563;
}

.lui-conversation-list :deep(.conversation-row-button.bg-accent) {
  background: #eef4ff;
  color: #1a1a1a;
  box-shadow: 0 2px 6px #00000008;
}

.lui-conversation-list :deep(.conversation-row-button:hover) {
  background: #f9fafb;
  color: #1a1a1a;
}

.lui-conversation-list :deep(.conversation-row-button.bg-accent:hover) {
  background: #eef4ff;
}

.lui-conversation-list :deep(.conversation-action-button) {
  min-height: 28px;
  color: #9ca3af;
  box-shadow: none;
}

.lui-empty-state :deep(svg) {
  width: 28px;
  height: 28px;
  color: #4b5563;
}

.lui-empty-state :deep(h2),
.lui-empty-state :deep(h3) {
  color: #1a1a1a;
  font-size: 16px;
  font-weight: 650;
}

.lui-empty-state :deep(p) {
  color: #4b5563;
}

.lui-workflow-action-card:deep(> div) {
  border-radius: 6px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

:global(.dark) .lui-workflow-action-card:deep(> div) {
  border-color: transparent;
  background: transparent;
}

.lui-workflow-action-card :deep(button) {
  border-radius: 6px;
}

.lui-message-response {
  color: #374151;
  font-size: 13px;
  line-height: 1.75;
}

.lui-message-response :deep(p) {
  margin: 0 0 10px;
}

.lui-message-response :deep(p:last-child) {
  margin-bottom: 0;
}

.lui-message-response :deep(code) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid #d7e0ee;
  border-radius: 5px;
  background: #eef3fb;
  padding: 1px 6px;
  color: #27364a;
  font-size: 12px;
  line-height: 1.55;
  white-space: normal;
  word-break: break-all;
}

:global(.dark) .lui-message-response {
  color: rgb(226 232 240 / 0.92);
}

:global(.dark) .lui-message-response :deep(code) {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(15 23 42 / 0.55);
  color: rgb(241 245 249 / 0.95);
}

.lui-workflow-artifacts :deep(article),
.lui-workflow-artifacts :deep(header > div:nth-child(2)) {
  border-color: #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
}

:global(.dark) .lui-workflow-artifacts :deep(article),
:global(.dark) .lui-workflow-artifacts :deep(header > div:nth-child(2)) {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(255 255 255 / 0.07);
}

.lui-workflow-artifacts :deep([class*="rounded-lg"]),
.lui-workflow-artifacts :deep([class*="rounded-xl"]) {
  border-radius: 6px;
}

.lui-prompt-input :deep(textarea) {
  min-height: 52px;
}

.lui-prompt-input :deep(button) {
  background: #f9fafb;
  color: #1a1a1a;
}

.lui-prompt-input :deep(button:hover) {
  background: #eef4ff;
  color: #0062ff;
}

:deep([cmdk-input-wrapper]),
:deep([data-slot="command-input-wrapper"]) {
  height: 32px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
}

:deep([cmdk-input]),
:deep([data-slot="command-input"]) {
  height: 32px;
  color: #1a1a1a;
}

:deep([cmdk-item]),
:deep([data-slot="command-item"]) {
  min-height: 36px;
  border-radius: 6px;
}

:deep([cmdk-item][data-selected="true"]),
:deep([data-slot="command-item"][data-selected="true"]) {
  background: #eef4ff;
  color: #1a1a1a;
}

:deep(.lui-model-selector-item) {
  min-height: 36px;
  border-radius: 6px;
}
</style>
