<template>
  <AppPageShell :class="imsDesign.shell">
    <ImsPageBackground />
    <AppPageHeader>
      <AppBrandLink />
      <div class="flex-1" />
      <div class="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          class="gap-2 hidden sm:flex"
          @click="$router.push('/import')"
        >
          <Download class="h-4 w-4" />
          导入任务
        </Button>
        <AppUserActions />
      </div>
    </AppPageHeader>

    <AppPageContent class="relative z-[1] bg-transparent px-4 py-4 lg:px-16">
      <div class="mx-auto grid max-w-[1240px] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside class="h-fit rounded-[16px] border border-[#E0E9F3] bg-[#F8FAFD] p-3 shadow-[0_18px_26px_-20px_#0F172A40] dark:border-white/10 dark:bg-card dark:shadow-none">
          <div class="mb-3 rounded-[12px] bg-[#EDF4FC]/80 px-3 py-3 dark:bg-white/6">
            <div class="flex items-center gap-2">
              <span class="h-[7px] w-[7px] rounded-full bg-[#2563EB]/70" />
              <p class="text-[14px] font-semibold text-[#1A1A1A] dark:text-slate-100">设置与用户菜单</p>
            </div>
            <p class="mt-1 text-[12px] leading-5 text-[#4B5563] dark:text-slate-300">账号、数据、AI 与规则集中维护。</p>
          </div>
          <nav class="space-y-1">
            <a
              v-for="item in settingsNavItems"
              :key="item.id"
              :href="`#${item.id}`"
              class="flex h-8 items-center gap-2 rounded-[6px] px-2.5 text-[12px] font-medium text-[#4B5563] transition-colors hover:bg-[#EEF4FF] hover:text-[#1A1A1A] dark:text-slate-300 dark:hover:bg-white/6 dark:hover:text-slate-100"
            >
              <component :is="item.icon" class="h-4 w-4" />
              {{ item.label }}
            </a>
          </nav>
        </aside>

        <div class="space-y-4">
      <!-- Account -->
      <Card id="account-permission" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">账号与权限</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100">账户状态</h2>
          </div>
          <Badge variant="outline" class="rounded-[6px]">Baobao</Badge>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />
        <div
          v-if="authStore.status === 'valid'"
          class="flex items-center gap-3"
        >
          <div class="flex items-center gap-2">
            <Badge variant="secondary" class="gap-1.5">
              <CheckCircle class="h-3 w-3" />
              已登录
            </Badge>
            <span class="text-sm">{{ authStore.user?.name }}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="ml-auto gap-1.5"
            @click="logout"
          >
            <Power class="h-3.5 w-3.5" />
            退出登录
          </Button>
        </div>
        <div v-else class="flex items-center gap-3">
          <Badge variant="outline" class="gap-1.5 text-muted-foreground">
            <XCircle class="h-3 w-3" />
            未登录
          </Badge>
          <Button size="sm" class="ml-auto" @click="$router.push('/login')"
            >登录</Button
          >
        </div>
      </Card>

      <!-- Sync -->
      <Card id="data-maintenance" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">数据维护</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100">同步与运行数据</h2>
          </div>
          <Badge :variant="syncStore.status.enabled ? 'default' : 'outline'" class="rounded-[6px]">
            {{ syncStore.status.enabled ? '自动同步' : '手动同步' }}
          </Badge>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />
        <div class="flex items-center gap-3 mb-3">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              v-model="syncEnabled"
              class="rounded border-border"
              @change="toggleSync"
            />
            开启自动同步
          </label>
          <span
            v-if="syncStore.status.enabled"
            class="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-green-500" />
            同步中
          </span>
        </div>
        <div class="text-xs text-muted-foreground mb-3">
          <p v-if="syncStore.status.lastSyncAt">
            上次同步: {{ fmtTime(syncStore.status.lastSyncAt) }}
          </p>
          <p v-else>从未同步</p>
          <p v-if="syncStore.status.lastError" class="text-destructive mt-1">
            {{ syncStore.status.lastError }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          :disabled="syncStore.loading"
          class="gap-1.5"
          @click="runSyncNow"
        >
          <RefreshCw
            class="h-3.5 w-3.5"
            :class="syncStore.loading ? 'animate-spin' : ''"
          />
          立即同步
        </Button>
      </Card>

      <!-- App Update -->
      <Card v-if="isDesktopRuntime" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7">
        <h2 class="text-sm font-semibold mb-4">应用更新</h2>
        <Separator class="mb-4" />
        <div class="space-y-3">
          <p class="text-xs text-muted-foreground">
            不会自动打断当前工作，你可以手动检查并决定是否安装更新。
          </p>
          <p v-if="updateError" class="text-xs text-destructive">
            {{ updateError }}
          </p>
          <p v-else-if="updateStatus" class="text-xs text-muted-foreground">
            <template v-if="updateStatus.available">
              检测到新版本：{{ updateStatus.version ?? "未知版本" }}
            </template>
            <template v-else> 当前已是最新版本 </template>
            <span class="ml-2">
              {{ fmtTime(updateStatus.checkedAt) }}
            </span>
          </p>
          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="checkingUpdate || installingUpdate"
              class="gap-1.5"
              @click="checkAppUpdate"
            >
              <Loader2
                v-if="checkingUpdate"
                class="h-3.5 w-3.5 animate-spin"
              />
              <RefreshCw v-else class="h-3.5 w-3.5" />
              检查更新
            </Button>
            <Button
              v-if="updateStatus?.available && !updateStatus.installed"
              size="sm"
              :disabled="checkingUpdate || installingUpdate"
              class="gap-1.5"
              @click="installAppUpdate"
            >
              <Loader2
                v-if="installingUpdate"
                class="h-3.5 w-3.5 animate-spin"
              />
              <Upload v-else class="h-3.5 w-3.5" />
              安装更新
            </Button>
            <Button
              v-if="updateStatus?.installed"
              variant="secondary"
              size="sm"
              class="gap-1.5"
              @click="restartDesktopApp"
            >
              <Power class="h-3.5 w-3.5" />
              立即重启
            </Button>
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5"
              @click="showWhatsNew"
            >
              <FileText class="h-3.5 w-3.5" />
              查看更新日志
            </Button>
          </div>
        </div>
      </Card>

      <!-- Theme -->
      <Card class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7">
        <h2 class="text-sm font-semibold mb-4">外观</h2>
        <Separator class="mb-4" />

        <div class="space-y-5">
          <!-- 颜色 -->
          <div>
            <p class="text-xs text-muted-foreground mb-1">主题</p>
            <p class="mb-3 text-xs text-muted-foreground/80">
              使用 design.pen 提取的 IMS 蓝白玻璃主题，统一覆盖 shadcn 默认色板。
            </p>
            <div class="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <button
                v-for="c in themeColors"
                :key="c"
                :class="[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors',
                  currentColor === c
                    ? 'border-[#0062FF] bg-[#EEF4FF] text-[#0062FF] shadow-sm dark:border-primary/40 dark:bg-primary/20 dark:text-slate-100'
                    : 'border-[#0063ff14] bg-white/75 text-[#1A1A1A] hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:border-white/10 dark:bg-white/7 dark:text-slate-200 dark:hover:bg-white/12 dark:hover:text-white',
                ]"
                @click="setColor(c)"
              >
                <span
                  class="h-4 w-4 shrink-0 rounded-full border border-[#0063ff26] shadow-sm"
                  :style="{ background: colorDotStyle[c] }"
                />
                <span class="flex flex-col items-start leading-none">
                  <span>{{ colorLabel[c] }}</span>
                  <span class="mt-1 text-[11px] opacity-70">{{
                    colorHint[c]
                  }}</span>
                </span>
              </button>
            </div>
          </div>

          <!-- 圆角 -->
          <div>
            <p class="text-xs text-muted-foreground mb-3">圆角</p>
            <div class="flex gap-2">
              <button
                v-for="r in themeRadii"
                :key="r"
                :class="[
                  'flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  currentRadius === r
                    ? 'border-[#0062FF] bg-[#EEF4FF] text-[#0062FF] shadow-sm dark:border-primary/40 dark:bg-primary/20 dark:text-slate-100'
                    : 'border-[#0063ff14] bg-white/75 text-[#1A1A1A] hover:bg-[#EEF4FF] hover:text-[#0062FF] dark:border-white/10 dark:bg-white/7 dark:text-slate-200 dark:hover:bg-white/12 dark:hover:text-white',
                ]"
                @click="setRadius(r)"
              >
                {{ r === 0 ? "无" : `${r}rem` }}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card id="gateway-agent" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7" data-onboarding="gateway-endpoints">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">导入与日志</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100">AI Gateway 自定义端点</h2>
          </div>
          <Badge variant="default" class="rounded-[6px]">{{ luiStore.customEndpoints.length }} 个端点</Badge>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />

        <div class="space-y-4">
          <p class="text-xs text-muted-foreground">
            添加自定义端点后，会在 LUI 模型选择器中显示为可选模型。
          </p>

          <div
            class="flex items-center justify-between gap-3 rounded-md border border-dashed p-3"
          >
            <div>
              <p class="text-sm font-medium">管理自定义端点</p>
              <p class="text-xs text-muted-foreground">
                支持新增、编辑、测试连接与删除。
              </p>
            </div>
            <Button
              size="sm"
              class="gap-1.5"
              @click="openCreateGatewayEndpointDialog"
            >
              <Plus class="h-3.5 w-3.5" />
              添加端点
            </Button>
          </div>

          <GatewayEndpointDialog
            :open="isGatewayEndpointDialogOpen"
            :title="gatewayEndpointDialogTitle"
            description="保存后会同步到本地服务，并在 LUI 模型选择器中可用。"
            :preset-providers="presetProviders"
            :model-options="gatewayModelOptions"
            :initial-provider-id="gatewayEndpointForm.providerId"
            :initial-api-key="gatewayEndpointForm.apiKey"
            :initial-model-id="gatewayEndpointForm.modelId"
            :initial-is-default="editingGatewayEndpointId !== null && luiStore.defaultEndpointId === editingGatewayEndpointId"
            :saving="isSavingGatewayEndpoint"
            :testing="isTestingGatewayEndpoint"
            :test-status="gatewayDialogTestStatus"
            :test-message="gatewayDialogTestMessage"
            :disable-provider-selection="editingGatewayEndpointId !== null"
            :save-button-text="editingGatewayEndpointId ? '保存修改' : '添加端点'"
            @update:open="handleGatewayEndpointDialogOpenChange"
            @save="saveGatewayEndpoint"
            @test="testGatewayEndpointFromDialog"
          />

          <div
            v-if="luiStore.customEndpoints.length === 0"
            class="rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#4B5563] dark:border-white/10 dark:bg-white/6 dark:text-slate-300"
          >
            暂无自定义端点
          </div>

          <div v-else class="space-y-2">
            <div
              class="flex items-center justify-between gap-3 rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#4B5563] dark:border-white/10 dark:bg-white/6 dark:text-slate-300"
            >
              <span>
                {{
                  luiStore.defaultEndpointId
                    ? `当前默认端点：${luiStore.defaultEndpointId}`
                    : "当前未设置默认端点，将回退到首个可用端点"
                }}
              </span>
              <Button
                v-if="luiStore.defaultEndpointId"
                variant="ghost"
                size="sm"
                @click="clearDefaultGatewayEndpoint"
              >
                清除默认
              </Button>
            </div>
            <div
              v-for="endpoint in luiStore.customEndpoints"
              :key="endpoint.id"
              class="flex items-center justify-between gap-3 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] p-3 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{{ endpoint.name }}</p>
                  <Badge
                    v-if="luiStore.defaultEndpointId === endpoint.id"
                    variant="secondary"
                    >默认</Badge
                  >
                  <span
                    class="rounded-[6px] px-2 py-0.5 text-[11px] font-semibold"
                    :class="endpointTestClass(endpointTestStatuses[endpoint.id])"
                  >
                    {{ formatEndpointTestLabel(endpointTestStatuses[endpoint.id]) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground break-all">
                  <template v-if="endpoint.providerId">
                    {{ endpoint.providerId }} · 预设提供商
                  </template>
                  <template v-else>
                    {{ endpoint.id }} · {{ endpoint.provider }} ·
                    {{ endpoint.baseURL }}
                  </template>
                </p>
                <p class="text-xs text-muted-foreground break-all">
                  默认模型：{{ endpoint.modelDisplayName || endpoint.modelId || "未指定" }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 px-2"
                  :disabled="luiStore.defaultEndpointId === endpoint.id"
                  @click="setDefaultGatewayEndpoint(endpoint.id)"
                >
                  {{
                    luiStore.defaultEndpointId === endpoint.id
                      ? "已默认"
                      : "设为默认"
                  }}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  title="编辑"
                  @click="openEditGatewayEndpointDialog(endpoint)"
                >
                  <Pencil class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :title="
                    testingEndpointId === endpoint.id ? '测试中' : '测试连接'
                  "
                  :disabled="testingEndpointId === endpoint.id"
                  @click="testGatewayEndpoint(endpoint)"
                >
                  <Loader2
                    v-if="testingEndpointId === endpoint.id"
                    class="h-4 w-4 animate-spin"
                  />
                  <FlaskConical v-else class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive"
                  title="删除"
                  @click="removeGatewayEndpoint(endpoint.id)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008] dark:border-white/10 dark:bg-white/7" data-onboarding="agent-management">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">Agent 状态</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A] dark:text-slate-100">Agent 管理</h2>
          </div>
          <Badge variant="outline" class="rounded-[6px]">{{ luiStore.agents.length }} 个 Agent</Badge>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />

        <div class="space-y-4">
          <p class="text-xs text-muted-foreground">
            管理 LUI
            可选智能体。系统内置默认面试智能体支持编辑修改，但仍不可删除。
          </p>

          <div
            class="flex items-center justify-between gap-3 rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-3 dark:border-white/10 dark:bg-white/6"
          >
            <div>
              <p class="text-sm font-medium">管理智能体</p>
              <p class="text-xs text-muted-foreground">
                支持新增、编辑、设为默认；系统内置面试智能体仍不可删除。
              </p>
            </div>
            <Button size="sm" class="gap-1.5" @click="openCreateAgentDialog">
              <Plus class="h-3.5 w-3.5" />
              添加 Agent
            </Button>
          </div>

          <Dialog
            :open="isAgentDialogOpen"
            content-class="max-w-2xl max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#132237] dark:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
            @update:open="handleAgentDialogOpenChange"
          >
            <template #content>
              <AppDialogLayout body-class="space-y-4">
                <template #header>
                  <DialogHeader>
                    <DialogTitle>{{ agentDialogTitle }}</DialogTitle>
                    <DialogDescription>
                      {{
                        editingAgentId
                          ? "更新智能体引擎、模式、工具和提示词。"
                          : "创建一个新的 LUI 智能体。"
                      }}
                    </DialogDescription>
                  </DialogHeader>
                </template>

                <div class="space-y-4">
                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">名称</label>
                  <Input
                    v-model="agentForm.name"
                    :disabled="agentFormReadonly"
                    class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]"
                    placeholder="例如：面试流程协调员"
                  />
                  <p class="text-xs text-muted-foreground">
                    重命名仅影响显示名称，不影响历史会话关联。
                  </p>
                </div>

                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">描述</label>
                  <Input
                    v-model="agentForm.description"
                    :disabled="agentFormReadonly"
                    class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]"
                    placeholder="说明该智能体负责什么任务"
                  />
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label class="text-xs text-muted-foreground"
                      >执行引擎</label
                    >
                    <select
                      v-model="agentForm.engine"
                      class="h-[34px] w-full rounded-[6px] border-0 bg-[#FFFFFF] px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                      :disabled="agentFormReadonly"
                    >
                      <option value="builtin">builtin</option>
                      <option value="deepagents">deepagents</option>
                    </select>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs text-muted-foreground">模式</label>
                    <select
                      v-model="agentForm.mode"
                      class="h-[34px] w-full rounded-[6px] border-0 bg-[#FFFFFF] px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                      :disabled="agentFormReadonly"
                    >
                      <option
                        v-for="mode in AGENT_MODE_OPTIONS"
                        :key="mode"
                        :value="mode"
                      >
                        {{ mode }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">场景亲和</label>
                  <select
                    v-model="agentForm.sceneAffinity"
                    class="h-[34px] w-full rounded-[6px] border-0 bg-[#FFFFFF] px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                    :disabled="agentFormReadonly"
                  >
                    <option value="general">general</option>
                    <option value="interview">interview</option>
                  </select>
                </div>

                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">温度</label>
                  <Input
                    v-model="agentForm.temperature"
                    type="number"
                    :disabled="agentFormReadonly"
                    class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]"
                    min="0"
                    max="2"
                    step="0.1"
                  />
                </div>

                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground"
                    >系统提示词</label
                  >
                  <Textarea
                    v-model="agentForm.systemPrompt"
                    :disabled="agentFormReadonly"
                    class="min-h-[120px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]"
                    placeholder="定义这个智能体的职责、边界与输出要求"
                  />
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="text-xs text-muted-foreground"
                      >可用工具</label
                    >
                    <span class="text-xs text-muted-foreground"
                      >已选 {{ agentForm.tools.length }} 个</span
                    >
                  </div>
                  <div class="grid grid-cols-2 gap-2 rounded-[6px] border-0 bg-[#F1F5FB] p-3">
                    <label
                      v-for="toolName in AGENT_TOOL_OPTIONS"
                      :key="toolName"
                      class="flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="agentForm.tools.includes(toolName)"
                        :disabled="agentFormReadonly"
                        class="rounded border-border"
                        @change="
                          toggleAgentTool(
                            toolName,
                            ($event.target as HTMLInputElement).checked,
                          )
                        "
                      />
                      <span>{{ toolName }}</span>
                    </label>
                  </div>
                </div>

                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    v-model="agentForm.isDefault"
                    type="checkbox"
                    :disabled="agentFormReadonly"
                    class="rounded border-border"
                  />
                  设为默认智能体
                </label>
                </div>

                <template #footer>
                  <Button
                    variant="secondary"
                    :disabled="isSavingAgent"
                    @click="closeAgentDialog"
                  >
                    取消
                  </Button>
                  <Button :disabled="isSavingAgent || agentFormReadonly" @click="saveAgent">
                    <Loader2
                      v-if="isSavingAgent"
                      class="mr-2 h-3.5 w-3.5 animate-spin"
                    />
                    {{ editingAgentId ? "保存修改" : "创建智能体" }}
                  </Button>
                </template>
              </AppDialogLayout>
            </template>
          </Dialog>

          <div
            v-if="luiStore.agents.length === 0"
            class="rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#4B5563]"
          >
            暂无 Agent
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="agent in luiStore.agents"
              :key="agent.id"
              class="flex items-center justify-between gap-3 rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] p-3 shadow-[0_2px_6px_#00000008]"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-sm font-medium">{{ agent.displayName }}</p>
                  <Badge v-if="agent.isDefault" variant="secondary">默认</Badge>
                  <Badge variant="secondary">{{
                    agent.sourceType === "builtin"
                      ? "内置"
                      : agent.sourceType === "custom"
                        ? "自定义"
                        : "导入"
                  }}</Badge>
                  <Badge variant="outline">{{ agent.sceneAffinity }}</Badge>
                  <Badge variant="outline">{{ agent.engine }}</Badge>
                  <Badge variant="outline">{{ agent.mode }}</Badge>
                </div>
                <p
                  v-if="agent.description"
                  class="text-xs text-muted-foreground break-all"
                >
                  {{ agent.description }}
                </p>
                <p class="text-xs text-muted-foreground">
                  工具：{{
                    agent.tools.length > 0 ? agent.tools.join("、") : "无"
                  }}
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-8 px-2"
                  :disabled="agent.isDefault"
                  @click="setDefaultAgent(agent.id)"
                >
                  {{ agent.isDefault ? "已默认" : "设为默认" }}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :disabled="!agent.isMutable"
                  :title="agent.isMutable ? '编辑' : '当前智能体不可编辑'"
                  @click="openEditAgentDialog(agent)"
                >
                  <Pencil class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive"
                  :disabled="agent.sourceType === 'builtin' || !agent.isMutable"
                  :title="
                    agent.sourceType === 'builtin'
                      ? '系统内置面试智能体不可删除'
                      : agent.isMutable
                        ? '删除'
                        : '当前智能体不可删除'
                  "
                  @click="removeAgent(agent.id)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <Card id="email-config" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008]">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">独立功能组</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A]">邮件配置</h2>
          </div>
          <Badge :variant="defaultEmailConfig ? 'default' : 'outline'" class="rounded-[6px]">
            {{ defaultEmailConfig ? '已配置 SMTP' : '未配置' }}
          </Badge>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />

        <div class="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div class="grid gap-3 md:grid-cols-2">
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">SMTP Host</label>
              <Input v-model="emailConfigForm.smtpHost" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="smtp.example.com" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">SMTP Port</label>
              <Input v-model="emailConfigForm.smtpPort" type="number" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="465" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">SMTP User</label>
              <Input v-model="emailConfigForm.smtpUser" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="邮箱账号" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">SMTP Pass</label>
              <Input v-model="emailConfigForm.smtpPass" type="password" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="授权码或密码" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">From Name</label>
              <Input v-model="emailConfigForm.fromName" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="IMS" />
            </div>
            <div class="space-y-1.5">
              <label class="text-xs text-[#4B5563]">From Email</label>
              <Input v-model="emailConfigForm.fromEmail" type="email" class="h-[34px] rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF]" placeholder="noreply@example.com" />
            </div>
          </div>

          <div class="flex flex-col justify-between gap-3 rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div class="space-y-2">
              <p class="text-[13px] font-semibold text-[#1A1A1A]">默认发件身份</p>
              <p class="break-all text-[12px] leading-5 text-[#4B5563]">
                {{ defaultEmailConfig ? `${defaultEmailConfig.fromName} <${defaultEmailConfig.fromEmail}>` : '保存后用于邮件发送与模板通知。' }}
              </p>
              <label class="flex items-center gap-2 text-[12px] text-[#4B5563]">
                <input v-model="emailConfigForm.isDefault" type="checkbox" class="rounded border-border" />
                设为默认配置
              </label>
            </div>
            <Button class="h-9 rounded-[6px] bg-[#0062FF] px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-12px_#0B6BFF66] hover:bg-[#0057E5]" :disabled="loadingEmailConfig || isSavingEmailConfig" @click="saveEmailConfig">
              <Loader2 v-if="isSavingEmailConfig" class="mr-1.5 h-4 w-4 animate-spin" />
              {{ editingEmailConfigId ? '保存邮件配置' : '创建邮件配置' }}
            </Button>
          </div>
        </div>
      </Card>

      <Card id="screening-rules" class="rounded-[6px] border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_2px_6px_#00000008]">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div>
            <p class="text-[12px] font-semibold text-[#0062FF]">独立功能组</p>
            <h2 class="text-[16px] font-semibold text-[#1A1A1A]">筛选规则</h2>
          </div>
          <Button variant="outline" size="sm" class="h-8 rounded-[6px] px-3 text-[12px] font-semibold" @click="$router.push('/screening/template-groups')">
            管理规则
          </Button>
        </div>
        <Separator class="mb-4 bg-[#E5E7EB]" />

        <div v-if="loadingScreeningRules" class="rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-4 text-xs text-[#4B5563]">
          正在加载筛选规则...
        </div>
        <div v-else-if="screeningRuleGroups.length === 0" class="rounded-[6px] border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-4 text-xs text-[#4B5563]">
          暂无筛选规则分组，可前往分组管理创建 pass/review 阈值与默认模板。
        </div>
        <div v-else class="grid gap-3 md:grid-cols-2">
          <div
            v-for="group in screeningRuleGroups"
            :key="group.id"
            class="rounded-[6px] border border-[#E5E7EB] bg-[#FFFFFF] p-3 shadow-[0_2px_6px_#00000008]"
          >
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-[14px] font-semibold text-[#1A1A1A]">{{ group.name }}</p>
                <p class="mt-1 line-clamp-2 text-[12px] leading-5 text-[#4B5563]">
                  {{ group.description || '未填写规则说明' }}
                </p>
              </div>
              <Badge :variant="group.learningEnabled ? 'default' : 'outline'" class="shrink-0 rounded-[6px]">
                {{ group.learningEnabled ? '学习开启' : '学习关闭' }}
              </Badge>
            </div>
            <div class="grid grid-cols-3 gap-2 text-[12px]">
              <div class="rounded-[6px] bg-[#EEF4FF] px-3 py-2 text-[#0062FF]">
                <p class="font-semibold">通过</p>
                <p>{{ group.passThreshold }}</p>
              </div>
              <div class="rounded-[6px] bg-[#F9FAFB] px-3 py-2 text-[#4B5563]">
                <p class="font-semibold">复核</p>
                <p>{{ group.reviewThreshold }}</p>
              </div>
              <div class="rounded-[6px] bg-[#F9FAFB] px-3 py-2 text-[#4B5563]">
                <p class="font-semibold">模板</p>
                <p>{{ group.templateCount }}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
        </div>
      </div>
    </AppPageContent>

    <BaobaoLoginDialog
      v-model:open="baobaoLoginDialogOpen"
      @authenticated="handleBaobaoAuthenticated"
    />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from "vue";
import {
  CheckCircle,
  Database,
  Download,
  FileText,
  FlaskConical,
  Mail,
  Pencil,
  Power,
  Plus,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useLuiStore } from "@/stores/lui";
import { isBaobaoAuthExpiredError, useSyncStore } from "@/stores/sync";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { useTheme } from "@/composables/use-theme";
import { useWhatsNew } from "@/composables/use-whats-new";
import AppUserActions from "@/components/app-user-actions.vue";
import AppBrandLink from "@/components/layout/app-brand-link.vue";
import BaobaoLoginDialog from "@/components/auth/baobao-login-dialog.vue";
import GatewayEndpointDialog from "@/components/lui/gateway-endpoint-dialog.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import ImsPageBackground from "@/components/layout/ims-page-background.vue";
import { imsDesign } from "@/components/layout/ims-design";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppDialogLayout } from "@/components/ui/dialog";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GatewayEndpoint } from "@/lib/ai-gateway-config";
import { emailApi } from "@/api/email";
import { luiApi } from "@/api/lui";
import { screeningTemplatesApi } from "@/api/screening-templates";
import type { Agent as LuiAgent } from "@/stores/lui";
import type { EmailConfig, ScreeningTemplateGroupListItem } from "@ims/shared";

interface PresetProvider {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

interface DesktopUpdateStatus {
  available: boolean;
  version: string | null;
  date: string | null;
  notes: string | null;
  checkedAt: number;
  installed: boolean;
}

const PRESET_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  minimax: "https://api.minimax.chat/v1",
  moonshot: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  siliconflow: "https://api.siliconflow.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  grok: "https://api.x.ai/v1",
};

const authStore = useAuthStore();
const luiStore = useLuiStore();
const syncStore = useSyncStore();
const { notifyError, notifySuccess, notifyWarning } = useAppNotifications();
const {
  color: currentColor,
  radius: currentRadius,
  setColor,
  setRadius,
  AVAILABLE_COLORS: themeColors,
  AVAILABLE_RADII: themeRadii,
} = useTheme();
const { showWhatsNew } = useWhatsNew();
const syncEnabled = ref(false);
const baobaoLoginDialogOpen = ref(false);
const pendingBaobaoAction = ref<"run-sync" | "toggle-sync" | null>(null);
const pendingToggleEnabled = ref<boolean | null>(null);
const isGatewayEndpointDialogOpen = ref(false);
const editingGatewayEndpointId = ref<string | null>(null);
const testingEndpointId = ref<string | null>(null);
const isTestingGatewayEndpoint = ref(false);
const isSavingGatewayEndpoint = ref(false);
const gatewayDialogTestStatus = ref<"idle" | "testing" | "success" | "failure">("idle");
const gatewayDialogTestMessage = ref("尚未测试当前端点");
const endpointTestStatuses = ref<Record<string, "testing" | "success" | "failure">>({});
const presetProviders = ref<PresetProvider[]>([]);
const isAgentDialogOpen = ref(false);
const editingAgentId = ref<string | null>(null);
const isSavingAgent = ref(false);
const emailConfigs = ref<EmailConfig[]>([]);
const loadingEmailConfig = ref(false);
const isSavingEmailConfig = ref(false);
const editingEmailConfigId = ref<string | null>(null);
const screeningRuleGroups = ref<ScreeningTemplateGroupListItem[]>([]);
const loadingScreeningRules = ref(false);
const isDesktopRuntime = ref(false);
const checkingUpdate = ref(false);
const installingUpdate = ref(false);
const updateStatus = ref<DesktopUpdateStatus | null>(null);
const updateError = ref<string | null>(null);
const gatewayEndpointForm = reactive({
  providerId: "",
  apiKey: "",
  modelId: "",
});
const emailConfigForm = reactive({
  smtpHost: "",
  smtpPort: 465,
  smtpUser: "",
  smtpPass: "",
  fromName: "IMS",
  fromEmail: "",
  isDefault: true,
});
const gatewayModelOptions = computed(() => {
  return luiStore.providers.flatMap((provider) =>
    provider.models.map((model) => ({
      id: model.id,
      providerId: provider.id,
      label: `${provider.name} / ${model.displayName || model.name || model.id}`,
    }))
  );
});
const AGENT_ENGINE_OPTIONS = ["builtin", "deepagents"] as const;
const AGENT_MODE_OPTIONS = ["chat", "ask", "all", "workflow"] as const;
const AGENT_TOOL_OPTIONS = [
  'scan_resume',
  'screen_resumes',
  'sanitize_interview_notes',
  'generate_wechat_summary',
] as const;
const agentForm = reactive({
  name: "",
  description: "",
  engine: AGENT_ENGINE_OPTIONS[0] as (typeof AGENT_ENGINE_OPTIONS)[number],
  mode: AGENT_MODE_OPTIONS[0] as (typeof AGENT_MODE_OPTIONS)[number],
  temperature: 0.5,
  systemPrompt: "",
  tools: [] as string[],
  isDefault: false,
  sceneAffinity: "general" as "general" | "interview",
});
const gatewayEndpointDialogTitle = computed(() =>
  editingGatewayEndpointId.value ? "编辑自定义端点" : "添加自定义端点",
);
const agentDialogTitle = computed(() =>
  editingAgentId.value ? "编辑智能体" : "创建智能体",
);
const agentFormReadonly = computed(() => {
  if (!editingAgentId.value) {
    return false;
  }
  return !luiStore.agents.find((agent) => agent.id === editingAgentId.value)?.isMutable;
});

const defaultEmailConfig = computed(() => {
  return emailConfigs.value.find((config) => config.isDefault) ?? emailConfigs.value[0] ?? null;
});

const settingsNavItems = [
  { id: "account-permission", label: "账号与权限", icon: Shield },
  { id: "data-maintenance", label: "数据维护", icon: Database },
  { id: "gateway-agent", label: "导入与日志", icon: FileText },
  { id: "email-config", label: "邮件配置", icon: Mail },
  { id: "screening-rules", label: "筛选规则", icon: SlidersHorizontal },
] as const;

const colorLabel: Record<string, string> = {
  neutral: "IMS 标准",
  zinc: "蓝白玻璃",
  stone: "浅雾背景",
  slate: "钴蓝强调",
};

const colorHint: Record<string, string> = {
  neutral: "#F7FAFF",
  zinc: "#F8FAFF",
  stone: "#EEF4FF",
  slate: "#0062FF",
};

const colorDotStyle: Record<string, string> = {
  neutral: "linear-gradient(135deg, #F7FAFF 0%, #EEF4FF 55%, #0062FF 100%)",
  zinc: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFF 55%, #93C5FD 100%)",
  stone: "linear-gradient(135deg, #F9FAFB 0%, #EEF4FF 65%, #0063FF26 100%)",
  slate:
    "linear-gradient(135deg, #EEF4FF 0%, #0062FF 70%, #0047BA 100%)",
};

onMounted(async () => {
  isDesktopRuntime.value = typeof window !== "undefined"
    && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";

  await authStore.checkStatus();
  await syncStore.fetchStatus();
  syncEnabled.value = syncStore.status.enabled;

  // 加载预设提供商列表
  try {
    const data = await luiApi.listPresetProviders();
    presetProviders.value = data.providers.map((provider) => ({
      ...provider,
      baseURL: PRESET_PROVIDER_BASE_URLS[provider.id] ?? "",
    }));
  } catch (_error) {
    // 如果 API 不可用，使用硬编码的预设列表
    presetProviders.value = [
      {
        id: "openai",
        name: "OpenAI",
        icon: "OpenAI",
        baseURL: "https://api.openai.com/v1",
      },
      {
        id: "anthropic",
        name: "Anthropic",
        icon: "Anthropic",
        baseURL: "https://api.anthropic.com/v1",
      },
      {
        id: "minimax",
        name: "MiniMax",
        icon: "MiniMax",
        baseURL: "https://api.minimax.chat/v1",
      },
      {
        id: "moonshot",
        name: "Moonshot",
        icon: "Moonshot",
        baseURL: "https://api.moonshot.cn/v1",
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        icon: "DeepSeek",
        baseURL: "https://api.deepseek.com/v1",
      },
      {
        id: "gemini",
        name: "Google Gemini",
        icon: "Gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
      },
      {
        id: "siliconflow",
        name: "SiliconFlow",
        icon: "SiliconFlow",
        baseURL: "https://api.siliconflow.cn/v1",
      },
      {
        id: "openrouter",
        name: "OpenRouter",
        icon: "OpenRouter",
        baseURL: "https://openrouter.ai/api/v1",
      },
      {
        id: "grok",
        name: "Grok",
        icon: "Grok",
        baseURL: "https://api.x.ai/v1",
      },
    ];
  }

  await luiStore.loadAgents();
  await luiStore.loadModels();
  await Promise.all([
    loadEmailConfigs(),
    loadScreeningRules(),
  ]);
});

function getTauriInvoker() {
  const tauriWindow = window as Window & {
    __TAURI_INTERNALS__?: {
      invoke: <T = unknown>(
        cmd: string,
        args?: Record<string, unknown>,
      ) => Promise<T>;
    };
  };

  return tauriWindow.__TAURI_INTERNALS__?.invoke ?? null;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function logout() {
  await authStore.logout();
}

async function toggleSync() {
  try {
    await syncStore.toggle(syncEnabled.value);
  } catch (error: unknown) {
    if (isBaobaoAuthExpiredError(error)) {
      pendingBaobaoAction.value = "toggle-sync";
      pendingToggleEnabled.value = syncEnabled.value;
      baobaoLoginDialogOpen.value = true;
      return;
    }

    notifyError(error instanceof Error ? `同步设置失败：${error.message}` : "同步设置失败");
  } finally {
    syncEnabled.value = syncStore.status.enabled;
  }
}

async function runSyncNow() {
  try {
    await syncStore.runNow();
  } catch (error: unknown) {
    if (isBaobaoAuthExpiredError(error)) {
      pendingBaobaoAction.value = "run-sync";
      baobaoLoginDialogOpen.value = true;
      return;
    }

    notifyError(error instanceof Error ? `同步失败：${error.message}` : "同步失败");
  }
}

async function handleBaobaoAuthenticated() {
  const action = pendingBaobaoAction.value;
  const targetEnabled = pendingToggleEnabled.value;
  pendingBaobaoAction.value = null;
  pendingToggleEnabled.value = null;

  await authStore.checkStatus({ force: true });

  if (action === "run-sync") {
    await runSyncNow();
    return;
  }

  if (action === "toggle-sync" && targetEnabled !== null) {
    syncEnabled.value = targetEnabled;
    await toggleSync();
  }
}

async function checkAppUpdate() {
  const invoke = getTauriInvoker();
  if (!invoke) {
    notifyWarning("当前环境不支持桌面更新检测");
    return;
  }

  checkingUpdate.value = true;
  updateError.value = null;
  try {
    const result = await invoke<DesktopUpdateStatus>("check_for_app_update");
    updateStatus.value = result;
    if (result.available) {
      notifySuccess(`检测到新版本 ${result.version ?? ""}`.trim());
    } else {
      notifySuccess("当前已是最新版本");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "检测更新失败";
    updateError.value = message;
    notifyError(message);
  } finally {
    checkingUpdate.value = false;
  }
}

async function installAppUpdate() {
  const invoke = getTauriInvoker();
  if (!invoke) {
    notifyWarning("当前环境不支持桌面更新安装");
    return;
  }

  installingUpdate.value = true;
  updateError.value = null;
  try {
    const result = await invoke<DesktopUpdateStatus>("install_app_update");
    updateStatus.value = result;
    if (!result.available) {
      notifySuccess("当前已是最新版本");
      return;
    }
    notifySuccess("更新已安装完成，请重启应用生效");
  } catch (error) {
    const message = error instanceof Error ? error.message : "安装更新失败";
    updateError.value = message;
    notifyError(message);
  } finally {
    installingUpdate.value = false;
  }
}

async function restartDesktopApp() {
  const invoke = getTauriInvoker();
  if (!invoke) {
    return;
  }
  try {
    await invoke("restart_desktop_app");
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "重启应用失败");
  }
}

function resetGatewayEndpointForm() {
  gatewayEndpointForm.providerId = "";
  gatewayEndpointForm.apiKey = "";
  gatewayEndpointForm.modelId = "";
  gatewayDialogTestStatus.value = "idle";
  gatewayDialogTestMessage.value = "尚未测试当前端点";
}

function fillEmailConfigForm(config: EmailConfig | null) {
  editingEmailConfigId.value = config?.id ?? null;
  emailConfigForm.smtpHost = config?.smtpHost ?? "";
  emailConfigForm.smtpPort = config?.smtpPort ?? 465;
  emailConfigForm.smtpUser = config?.smtpUser ?? "";
  emailConfigForm.smtpPass = config?.smtpPass ?? "";
  emailConfigForm.fromName = config?.fromName ?? "IMS";
  emailConfigForm.fromEmail = config?.fromEmail ?? "";
  emailConfigForm.isDefault = config?.isDefault ?? true;
}

async function loadEmailConfigs() {
  loadingEmailConfig.value = true;
  try {
    const data = await emailApi.listConfigs(authStore.user?.id);
    emailConfigs.value = data.items;
    fillEmailConfigForm(defaultEmailConfig.value);
  } catch (error) {
    emailConfigs.value = [];
    fillEmailConfigForm(null);
    notifyError(error instanceof Error ? error.message : "加载邮件配置失败");
  } finally {
    loadingEmailConfig.value = false;
  }
}

async function saveEmailConfig() {
  if (!emailConfigForm.smtpHost.trim()) {
    notifyWarning("请输入 SMTP Host");
    return;
  }
  if (!emailConfigForm.fromEmail.trim()) {
    notifyWarning("请输入发件邮箱");
    return;
  }

  isSavingEmailConfig.value = true;
  try {
    const payload = {
      userId: authStore.user?.id,
      smtpHost: emailConfigForm.smtpHost.trim(),
      smtpPort: Number(emailConfigForm.smtpPort),
      smtpUser: emailConfigForm.smtpUser.trim(),
      smtpPass: emailConfigForm.smtpPass,
      fromName: emailConfigForm.fromName.trim() || "IMS",
      fromEmail: emailConfigForm.fromEmail.trim(),
      isDefault: emailConfigForm.isDefault,
    };

    if (editingEmailConfigId.value) {
      await emailApi.updateConfig(editingEmailConfigId.value, payload);
      notifySuccess("已更新邮件配置");
    } else {
      await emailApi.createConfig(payload);
      notifySuccess("已保存邮件配置");
    }
    await loadEmailConfigs();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "保存邮件配置失败");
  } finally {
    isSavingEmailConfig.value = false;
  }
}

async function loadScreeningRules() {
  loadingScreeningRules.value = true;
  try {
    const data = await screeningTemplatesApi.listGroups();
    screeningRuleGroups.value = data.items;
  } catch (error) {
    screeningRuleGroups.value = [];
    notifyError(error instanceof Error ? error.message : "加载筛选规则失败");
  } finally {
    loadingScreeningRules.value = false;
  }
}

function formatEndpointTestLabel(status: "testing" | "success" | "failure" | undefined) {
  if (status === "testing") {
    return "测试中";
  }
  if (status === "success") {
    return "连接正常";
  }
  if (status === "failure") {
    return "连接失败";
  }
  return "未测试";
}

function endpointTestClass(status: "testing" | "success" | "failure" | undefined) {
  if (status === "testing") {
    return "bg-[#EEF4FF] text-[#0062FF]";
  }
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "failure") {
    return "bg-red-50 text-red-700";
  }
  return "bg-[#F3F4F6] text-[#4B5563]";
}

function buildGatewayEndpointFromValues(payload?: { providerId: string; apiKey: string; modelId: string; isDefault?: boolean }): GatewayEndpoint {
  const providerId = payload?.providerId?.trim() || gatewayEndpointForm.providerId;
  const apiKey = payload?.apiKey?.trim() || gatewayEndpointForm.apiKey.trim();
  const modelId = payload?.modelId?.trim() || gatewayEndpointForm.modelId.trim();
  const provider = presetProviders.value.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error("请选择提供商");
  }

  const modelDisplayName = modelId
    ? gatewayModelOptions.value.find((item) => item.id === modelId && item.providerId === providerId)?.label
    : "";

  return {
    id: provider.id,
    name: provider.name,
    provider: provider.id,
    baseURL: provider.baseURL,
    providerId: provider.id,
    ...(apiKey
      ? { apiKey }
      : {}),
    ...(modelId
      ? { modelId }
      : {}),
    ...(modelDisplayName
      ? { modelDisplayName }
      : {}),
  };
}

function validateGatewayEndpoint(
  endpoint: GatewayEndpoint,
  requireApiKey = false,
) {
  // 检查是否选择了提供商
  if (!endpoint.providerId && (!endpoint.id || !endpoint.provider)) {
    notifyWarning("请选择提供商");
    return false;
  }

  // API Key 是必填项（用于测试或保存时）
  if (requireApiKey && !endpoint.apiKey) {
    notifyWarning("请输入 API Key");
    return false;
  }

  return true;
}

function openCreateGatewayEndpointDialog() {
  editingGatewayEndpointId.value = null;
  resetGatewayEndpointForm();
  isGatewayEndpointDialogOpen.value = true;
}

function openEditGatewayEndpointDialog(endpoint: GatewayEndpoint) {
  editingGatewayEndpointId.value = endpoint.id;
  // 支持 providerId 简化配置模式
  // 优先使用 providerId，如果不存在则使用 provider
  const providerId = endpoint.providerId || endpoint.provider;
  if (providerId) {
    gatewayEndpointForm.providerId = providerId;
  }
  gatewayEndpointForm.apiKey = endpoint.apiKey ?? "";
  gatewayEndpointForm.modelId = endpoint.modelId ?? "";
  isGatewayEndpointDialogOpen.value = true;
}

function closeGatewayEndpointDialog() {
  isGatewayEndpointDialogOpen.value = false;
  editingGatewayEndpointId.value = null;
  resetGatewayEndpointForm();
}

function resetAgentForm() {
  agentForm.name = "";
  agentForm.description = "";
  agentForm.engine = AGENT_ENGINE_OPTIONS[0];
  agentForm.mode = AGENT_MODE_OPTIONS[0];
  agentForm.temperature = 0.5;
  agentForm.systemPrompt = "";
  agentForm.tools = [];
  agentForm.isDefault = false;
  agentForm.sceneAffinity = "general";
}

function fillAgentForm(agent: LuiAgent) {
  agentForm.name = agent.displayName;
  agentForm.description = agent.description;
  agentForm.engine = agent.engine;
  agentForm.mode = agent.mode;
  agentForm.temperature = agent.temperature;
  agentForm.systemPrompt = agent.systemPrompt;
  agentForm.tools = [...agent.tools];
  agentForm.isDefault = agent.isDefault;
  agentForm.sceneAffinity = agent.sceneAffinity;
}

function openCreateAgentDialog() {
  editingAgentId.value = null;
  resetAgentForm();
  isAgentDialogOpen.value = true;
}

function openEditAgentDialog(agent: LuiAgent) {
  editingAgentId.value = agent.id;
  fillAgentForm(agent);
  isAgentDialogOpen.value = true;
}

function closeAgentDialog() {
  isAgentDialogOpen.value = false;
  editingAgentId.value = null;
  resetAgentForm();
}

function handleAgentDialogOpenChange(open: boolean) {
  if (!open && isSavingAgent.value) {
    return;
  }
  isAgentDialogOpen.value = open;
  if (!open) {
    closeAgentDialog();
  }
}

function toggleAgentTool(toolName: string, checked: boolean) {
  if (checked) {
    if (!agentForm.tools.includes(toolName)) {
      agentForm.tools = [...agentForm.tools, toolName];
    }
    return;
  }

  agentForm.tools = agentForm.tools.filter((name) => name !== toolName);
}

async function saveAgent() {
  if (!agentForm.name.trim()) {
    notifyWarning("请输入智能体名称");
    return;
  }

  isSavingAgent.value = true;

  try {
    if (editingAgentId.value) {
      await luiStore.updateAgent(editingAgentId.value, {
        name: agentForm.name.trim(),
        description: agentForm.description.trim(),
        engine: agentForm.engine,
        mode: agentForm.mode,
        temperature: agentForm.temperature,
        systemPrompt: agentForm.systemPrompt.trim(),
        tools: agentForm.tools,
        isDefault: agentForm.isDefault,
        sceneAffinity: agentForm.sceneAffinity,
      });
      notifySuccess("已更新智能体");
    } else {
      const created = await luiStore.createAgent({
        name: agentForm.name.trim(),
        description: agentForm.description.trim(),
        engine: agentForm.engine,
        mode: agentForm.mode,
        temperature: agentForm.temperature,
        systemPrompt: agentForm.systemPrompt.trim(),
        tools: agentForm.tools,
        sceneAffinity: agentForm.sceneAffinity,
      });

      if (agentForm.isDefault) {
        await luiStore.updateAgent(created.id, { isDefault: true });
      }

      notifySuccess("已创建智能体");
    }

    await luiStore.loadAgents();
    closeAgentDialog();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "保存智能体失败");
  } finally {
    isSavingAgent.value = false;
  }
}

async function setDefaultAgent(agentId: string) {
  await luiStore.updateAgent(agentId, { isDefault: true });
  await luiStore.loadAgents();
  notifySuccess("已更新默认智能体");
}

async function removeAgent(agentId: string) {
  const agent = luiStore.agents.find((item) => item.id === agentId);
  if (agent && (agent.sourceType === "builtin" || !agent.isMutable)) {
    notifyWarning(
      agent.sourceType === "builtin"
        ? "系统内置面试智能体不可删除"
        : "当前智能体不可删除",
    );
    return;
  }
  await luiStore.deleteAgent(agentId);
  notifySuccess("已删除智能体");
}

function handleGatewayEndpointDialogOpenChange(open: boolean) {
  if (
    !open &&
    (isSavingGatewayEndpoint.value || isTestingGatewayEndpoint.value)
  ) {
    return;
  }

  isGatewayEndpointDialogOpen.value = open;
  if (!open) {
    closeGatewayEndpointDialog();
  }
}

async function saveGatewayEndpoint(payload: { providerId: string; apiKey: string; modelId: string; isDefault?: boolean }) {
  const endpoint: GatewayEndpoint = {
    ...buildGatewayEndpointFromValues(payload),
  };

  if (!validateGatewayEndpoint(endpoint, true)) {
    return;
  }

  isSavingGatewayEndpoint.value = true;

  try {
    if (editingGatewayEndpointId.value) {
      await luiStore.updateCustomEndpoint(
        editingGatewayEndpointId.value,
        endpoint,
      );
      notifySuccess("已更新自定义端点");
    } else {
      await luiStore.registerCustomEndpoint(endpoint);
      notifySuccess("已保存自定义端点");
    }
    if (payload.isDefault) {
      await luiStore.setDefaultCustomEndpoint(endpoint.id);
    }
    closeGatewayEndpointDialog();
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "保存自定义端点失败");
  } finally {
    isSavingGatewayEndpoint.value = false;
  }
}

async function runGatewayEndpointTest(
  endpoint: GatewayEndpoint,
  options?: { fromDialog?: boolean },
) {
  if (!validateGatewayEndpoint(endpoint, true)) {
    return;
  }

  if (options?.fromDialog) {
    isTestingGatewayEndpoint.value = true;
    gatewayDialogTestStatus.value = "testing";
    gatewayDialogTestMessage.value = "正在测试连接，验证 Provider、Base URL 与默认模型";
  } else {
    testingEndpointId.value = endpoint.id;
    endpointTestStatuses.value = {
      ...endpointTestStatuses.value,
      [endpoint.id]: "testing",
    };
  }

  try {
    const result = await luiStore.testCustomEndpoint(endpoint);
    if (result.modelCount > 0) {
      if (options?.fromDialog) {
        gatewayDialogTestStatus.value = "success";
        gatewayDialogTestMessage.value = `连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`;
      } else {
        endpointTestStatuses.value = {
          ...endpointTestStatuses.value,
          [endpoint.id]: "success",
        };
      }
      notifySuccess(
        `连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`,
      );
    } else {
      if (options?.fromDialog) {
        gatewayDialogTestStatus.value = "success";
        gatewayDialogTestMessage.value = "连接成功，但当前端点未返回任何模型";
      } else {
        endpointTestStatuses.value = {
          ...endpointTestStatuses.value,
          [endpoint.id]: "success",
        };
      }
      notifyWarning("连接成功，但当前端点未返回任何模型");
    }
  } catch (error) {
    if (options?.fromDialog) {
      gatewayDialogTestStatus.value = "failure";
      gatewayDialogTestMessage.value = error instanceof Error ? error.message : "测试端点连接失败";
    } else {
      endpointTestStatuses.value = {
        ...endpointTestStatuses.value,
        [endpoint.id]: "failure",
      };
    }
    notifyError(error instanceof Error ? error.message : "测试端点连接失败");
  } finally {
    if (options?.fromDialog) {
      isTestingGatewayEndpoint.value = false;
    } else {
      testingEndpointId.value = null;
    }
  }
}

async function testGatewayEndpoint(endpoint: GatewayEndpoint) {
  await runGatewayEndpointTest(endpoint);
}

async function testGatewayEndpointFromDialog(payload: { providerId: string; apiKey: string; modelId: string; isDefault?: boolean }) {
  try {
    const endpoint = buildGatewayEndpointFromValues(payload);
    if (!validateGatewayEndpoint(endpoint, true)) {
      return;
    }
    await runGatewayEndpointTest(endpoint, { fromDialog: true });
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "测试端点连接失败");
  }
}

async function removeGatewayEndpoint(endpointId: string) {
  await luiStore.removeCustomEndpoint(endpointId);
}

async function setDefaultGatewayEndpoint(endpointId: string) {
  await luiStore.setDefaultCustomEndpoint(endpointId);
  notifySuccess("已更新默认端点");
}

async function clearDefaultGatewayEndpoint() {
  await luiStore.setDefaultCustomEndpoint(null);
  notifySuccess("已清除默认端点");
}
</script>
