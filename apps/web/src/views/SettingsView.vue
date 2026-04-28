<template>
  <AppPageShell>
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

    <AppPageContent class="space-y-4">
      <!-- Account -->
      <Card class="p-5">
        <h2 class="text-sm font-semibold mb-4">账户</h2>
        <Separator class="mb-4" />
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
      <Card class="p-5">
        <h2 class="text-sm font-semibold mb-4">同步</h2>
        <Separator class="mb-4" />
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
      <Card v-if="isDesktopRuntime" class="p-5">
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
      <Card class="p-5">
        <h2 class="text-sm font-semibold mb-4">外观</h2>
        <Separator class="mb-4" />

        <div class="space-y-5">
          <!-- 颜色 -->
          <div>
            <p class="text-xs text-muted-foreground mb-1">主题</p>
            <p class="mb-3 text-xs text-muted-foreground/80">
              使用 shadcn 内置的克制中性色方案，默认黑白极简风格。
            </p>
            <div class="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <button
                v-for="c in themeColors"
                :key="c"
                :class="[
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors',
                  currentColor === c
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                ]"
                @click="setColor(c)"
              >
                <span
                  class="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
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
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                ]"
                @click="setRadius(r)"
              >
                {{ r === 0 ? "无" : `${r}rem` }}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card class="p-5" data-onboarding="gateway-endpoints">
        <h2 class="text-sm font-semibold mb-4">AI Gateway 自定义端点</h2>
        <Separator class="mb-4" />

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
            :saving="isSavingGatewayEndpoint"
            :testing="isTestingGatewayEndpoint"
            :disable-provider-selection="editingGatewayEndpointId !== null"
            :save-button-text="editingGatewayEndpointId ? '保存修改' : '添加端点'"
            @update:open="handleGatewayEndpointDialogOpenChange"
            @save="saveGatewayEndpoint"
            @test="testGatewayEndpointFromDialog"
          />

          <div
            v-if="luiStore.customEndpoints.length === 0"
            class="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          >
            暂无自定义端点
          </div>

          <div v-else class="space-y-2">
            <div
              class="flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground"
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
              class="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium">{{ endpoint.name }}</p>
                  <Badge
                    v-if="luiStore.defaultEndpointId === endpoint.id"
                    variant="secondary"
                    >默认</Badge
                  >
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

      <Card class="p-5" data-onboarding="agent-management">
        <h2 class="text-sm font-semibold mb-4">Agent 管理</h2>
        <Separator class="mb-4" />

        <div class="space-y-4">
          <p class="text-xs text-muted-foreground">
            管理 LUI
            可选智能体。系统内置默认面试智能体支持编辑修改，但仍不可删除。
          </p>

          <div
            class="flex items-center justify-between gap-3 rounded-md border border-dashed p-3"
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
            @update:open="handleAgentDialogOpenChange"
          >
            <template #content>
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

            <div class="overflow-y-auto flex-1 min-h-0">
              <Separator class="my-4" />

              <div class="space-y-4">
                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">名称</label>
                  <Input
                    v-model="agentForm.name"
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
                      class="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="builtin">builtin</option>
                      <option value="deepagents">deepagents</option>
                    </select>
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs text-muted-foreground">模式</label>
                    <select
                      v-model="agentForm.mode"
                      class="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                    class="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
                    class="min-h-[120px]"
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
                  <div class="grid grid-cols-2 gap-2 rounded-md border p-3">
                    <label
                      v-for="toolName in AGENT_TOOL_OPTIONS"
                      :key="toolName"
                      class="flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="agentForm.tools.includes(toolName)"
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
                    class="rounded border-border"
                  />
                  设为默认智能体
                </label>
              </div>
            </div>

              <DialogFooter class="mt-6 gap-2">
                <Button
                  variant="secondary"
                  :disabled="isSavingAgent"
                  @click="closeAgentDialog"
                >
                  取消
                </Button>
                <Button :disabled="isSavingAgent" @click="saveAgent">
                  <Loader2
                    v-if="isSavingAgent"
                    class="mr-2 h-3.5 w-3.5 animate-spin"
                  />
                  {{ editingAgentId ? "保存修改" : "创建智能体" }}
                </Button>
              </DialogFooter>
            </template>
          </Dialog>

          <div
            v-if="luiStore.agents.length === 0"
            class="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          >
            暂无 Agent
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="agent in luiStore.agents"
              :key="agent.id"
              class="flex items-center justify-between gap-3 rounded-md border p-3"
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
    </AppPageContent>

    <BaobaoLoginDialog
      v-model:open="baobaoLoginDialogOpen"
      @authenticated="handleBaobaoAuthenticated"
    />
    <WhatsNewDialog :open="whatsNewDialogVisible" @close="dismissWhatsNew" />
  </AppPageShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from "vue";
import {
  CheckCircle,
  Download,
  FileText,
  FlaskConical,
  Pencil,
  Power,
  Plus,
  RefreshCw,
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
import WhatsNewDialog from "@/components/changelog/WhatsNewDialog.vue";
import AppPageContent from "@/components/layout/app-page-content.vue";
import AppPageHeader from "@/components/layout/app-page-header.vue";
import AppPageShell from "@/components/layout/app-page-shell.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { GatewayEndpoint } from "@/lib/ai-gateway-config";
import { luiApi } from "@/api/lui";
import type { Agent as LuiAgent } from "@/stores/lui";

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
const { dialogVisible: whatsNewDialogVisible, showWhatsNew, dismissWhatsNew } = useWhatsNew();
const syncEnabled = ref(false);
const baobaoLoginDialogOpen = ref(false);
const pendingBaobaoAction = ref<"run-sync" | "toggle-sync" | null>(null);
const pendingToggleEnabled = ref<boolean | null>(null);
const isGatewayEndpointDialogOpen = ref(false);
const editingGatewayEndpointId = ref<string | null>(null);
const testingEndpointId = ref<string | null>(null);
const isTestingGatewayEndpoint = ref(false);
const isSavingGatewayEndpoint = ref(false);
const presetProviders = ref<PresetProvider[]>([]);
const isAgentDialogOpen = ref(false);
const editingAgentId = ref<string | null>(null);
const isSavingAgent = ref(false);
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

const colorLabel: Record<string, string> = {
  neutral: "黑白",
  zinc: "锌灰",
  stone: "暖灰",
  slate: "板岩",
};

const colorHint: Record<string, string> = {
  neutral: "极简黑白",
  zinc: "冷调灰黑",
  stone: "暖调米灰",
  slate: "蓝灰中性",
};

const colorDotStyle: Record<string, string> = {
  neutral: "linear-gradient(135deg, hsl(0 0% 9%) 0%, hsl(0 0% 85%) 100%)",
  zinc: "linear-gradient(135deg, hsl(240 5.9% 10%) 0%, hsl(240 5% 55%) 100%)",
  stone: "linear-gradient(135deg, hsl(24 9.8% 10%) 0%, hsl(30 18% 70%) 100%)",
  slate:
    "linear-gradient(135deg, hsl(222.2 47.4% 11.2%) 0%, hsl(214 30% 55%) 100%)",
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
}

function buildGatewayEndpointFromValues(payload?: { providerId: string; apiKey: string; modelId: string }): GatewayEndpoint {
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

async function saveGatewayEndpoint(payload: { providerId: string; apiKey: string; modelId: string }) {
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
  } else {
    testingEndpointId.value = endpoint.id;
  }

  try {
    const result = await luiStore.testCustomEndpoint(endpoint);
    if (result.modelCount > 0) {
      notifySuccess(
        `连接成功，发现 ${result.providerCount} 个 Provider、${result.modelCount} 个模型`,
      );
    } else {
      notifyWarning("连接成功，但当前端点未返回任何模型");
    }
  } catch (error) {
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

async function testGatewayEndpointFromDialog(payload: { providerId: string; apiKey: string; modelId: string }) {
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
