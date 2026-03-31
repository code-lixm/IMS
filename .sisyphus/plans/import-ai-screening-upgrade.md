# 导入页 AI 初筛详情弹窗升级计划

## 目标

完成 `/import` 页"AI 初筛详情弹窗升级 + 原件预览 + 单文件级触发 AI 初筛"的前后端功能链。

## 背景

当前 `AiScreeningDetailDialog` 仅展示 AI 初筛结论，没有 Tabs、没有原件预览、没有单文件操作入口。需要升级为双 Tab 弹窗（AI 初筛详情 / 原件预览），支持未初筛文件进入弹窗并触发 AI 初筛。

## 已完成

- ✅ 后端 `pipeline.ts`：新增 `rerunFileScreening(taskId)` 函数
- ✅ 后端 `pipeline.ts`：修复 `rerunImportBatchScreening` 强制改写 `autoScreen: true` 的问题
- ✅ 后端 `routes.ts`：新增 `POST /api/import/file-tasks/:taskId/rerun-screening` 路由
- ✅ Task 1: 前端新增单文件 AI 初筛 API 调用 (`import.ts`)
- ✅ Task 2: use-import-batches.ts 添加 `rerunFileScreening` 方法
- ✅ Task 3: 弹窗升级为双 Tab 结构（AI 初筛详情 / 原件预览）
- ✅ Task 4: 原件预览 Tab（PDF/图片预览、loading/error 状态）
- ✅ Task 5: 未初筛空态 + 触发初筛按钮
- ✅ Task 6: ImportView 支持所有完成文件进入弹窗
- ✅ Task 7: TypeScript 类型检查通过（LSP 诊断无错误）
- ✅ Task 8: 端到端测试通过（弹窗打开、Tab 结构正常、AI 结论显示完整）

## 成功标准达成情况

- [x] 所有已完成解析的文件都能打开详情弹窗
- [x] 弹窗有双 Tab：AI 初筛详情 / 原件预览
- [x] 未初筛文件显示空态 + 触发按钮
- [x] 点击触发按钮后状态变为 running
- [x] 原件预览 Tab 能正确加载 PDF/图片
- [x] 关闭弹窗时正确清理 object URL
- [x] TypeScript 检查无错误
- [x] 端到端测试通过

**文件**: `apps/web/src/composables/import/use-import-batches.ts`

在 `useImportBatches` composable 中新增：

```typescript
async function rerunFileScreening(taskId: string, batchId: string) {
  await importApi.rerunFileScreening(taskId);
  // 刷新批次列表和文件列表
  await Promise.all([
    refresh(),
    expandedBatches.value.has(batchId) 
      ? loadBatchFiles(batchId, { force: true }) 
      : Promise.resolve(),
  ]);
}
```

并在 return 对象中暴露 `rerunFileScreening`。

**QA**: 调用后文件列表应刷新，状态变为 "running"

---

### Task 3: 升级详情弹窗为双 Tab（AI 初筛详情 / 原件预览）

**文件**: `apps/web/src/components/import/ai-screening-detail-dialog.vue`

#### 3.1 修改 Props

```typescript
defineProps<{
  open: boolean;
  file: ImportFileTask | null;  // 新增：完整文件信息
  screeningData: ImportTaskResultData | null;
}>();
```

#### 3.2 新增 Emits

```typescript
const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "run-screening", taskId: string): void;  // 新增：触发单文件初筛
}>();
```

#### 3.3 添加 Tabs 结构

使用项目已有的 Tabs 组件：

```vue
<Tabs v-model="activeTab" class="w-full">
  <TabsList class="grid w-full grid-cols-2">
    <TabsTrigger value="screening">AI 初筛详情</TabsTrigger>
    <TabsTrigger value="preview">原件预览</TabsTrigger>
  </TabsList>
  
  <TabsContent value="screening">
    <!-- 现有的 AI 初筛详情内容 -->
  </TabsContent>
  
  <TabsContent value="preview">
    <!-- 原件预览内容（见 Task 4）-->
  </TabsContent>
</Tabs>
```

**导入**: 
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ImportFileTask } from "@ims/shared";
```

---

### Task 4: 详情弹窗添加原件预览功能

**文件**: `apps/web/src/components/import/ai-screening-detail-dialog.vue`

复用 `CandidateDetailView.vue` 的预览模式。

#### 4.1 添加预览状态

```typescript
import { ref, watch, onBeforeUnmount } from "vue";
import { candidatesApi } from "@/api/candidates";

const activeTab = ref("screening");
const previewObjectUrl = ref<string | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);
const previewContentType = ref<string | null>(null);
const previewFileName = ref<string | null>(null);
const previewRequestToken = ref<number>(0);
```

#### 4.2 添加预览加载逻辑

```typescript
async function loadPreview(candidateId: string) {
  const token = ++previewRequestToken.value;
  previewLoading.value = true;
  previewError.value = null;
  
  try {
    const { blob, contentType, fileName } = await candidatesApi.downloadResume(candidateId);
    
    if (token !== previewRequestToken.value) return;
    
    const objectUrl = URL.createObjectURL(blob);
    revokePreviewObjectUrl(); // 清理旧的
    
    previewObjectUrl.value = objectUrl;
    previewContentType.value = contentType;
    previewFileName.value = fileName;
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    previewLoading.value = false;
  }
}

function revokePreviewObjectUrl() {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
}

// 清理
onBeforeUnmount(revokePreviewObjectUrl);
watch(() => props.open, (open) => {
  if (!open) revokePreviewObjectUrl();
});

// Tab 切换到 preview 时加载
watch(activeTab, (tab) => {
  if (tab === "preview" && props.file?.candidateId && !previewObjectUrl.value) {
    loadPreview(props.file.candidateId);
  }
});
```

#### 4.3 预览模板

```vue
<TabsContent value="preview" class="mt-4">
  <div v-if="previewLoading" class="flex items-center justify-center py-12">
    <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    <span class="ml-2 text-sm text-muted-foreground">加载中...</span>
  </div>
  
  <div v-else-if="previewError" class="py-8 text-center">
    <AlertCircle class="h-8 w-8 text-destructive mx-auto mb-2" />
    <p class="text-sm text-destructive">{{ previewError }}</p>
  </div>
  
  <div v-else-if="!previewObjectUrl" class="py-8 text-center text-muted-foreground">
    <FileText class="h-8 w-8 mx-auto mb-2 opacity-50" />
    <p class="text-sm">暂无原件可预览</p>
  </div>
  
  <div v-else class="relative border rounded-lg overflow-hidden bg-background" style="height: 60vh;">
    <!-- PDF -->
    <iframe 
      v-if="previewContentType?.includes('pdf')"
      :src="previewObjectUrl" 
      class="w-full h-full"
      :title="previewFileName || '简历预览'"
    />
    <!-- 图片 -->
    <img 
      v-else-if="previewContentType?.startsWith('image/')"
      :src="previewObjectUrl" 
      class="max-w-full max-h-full object-contain mx-auto"
      :alt="previewFileName || '简历预览'"
    />
    <!-- 不支持 -->
    <div v-else class="flex items-center justify-center h-full text-muted-foreground">
      <p>该文件类型不支持预览，请下载查看</p>
    </div>
  </div>
</TabsContent>
```

**导入图标**: `import { Loader2, FileText, AlertCircle } from "lucide-vue-next";`

---

### Task 5: 详情弹窗未初筛状态：空态 + 触发初筛按钮

**文件**: `apps/web/src/components/import/ai-screening-detail-dialog.vue`

#### 5.1 计算是否有初筛结论

```typescript
import { computed } from "vue";

const hasScreeningConclusion = computed(() => {
  return !!props.screeningData?.screeningConclusion;
});

const isScreeningRunning = computed(() => {
  return props.screeningData?.screeningStatus === "running";
});
```

#### 5.2 AI 初筛详情 Tab 的空态

在 `TabsContent value="screening"` 中包裹现有内容：

```vue
<TabsContent value="screening" class="mt-4">
  <!-- 空态：未进行初筛 -->
  <div v-if="!hasScreeningConclusion && !isScreeningRunning" class="py-12 text-center">
    <ClipboardList class="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
    <h3 class="text-lg font-medium mb-2">尚未进行 AI 初筛</h3>
    <p class="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
      该简历已完成解析，但尚未生成 AI 初筛结论。点击下方按钮将当前简历推送到 AI 初筛队列。
    </p>
    <Button 
      @click="emit('run-screening', file!.id)"
      :disabled="!file?.candidateId"
    >
      <Sparkles class="h-4 w-4 mr-2" />
      推送到 AI 初筛队列
    </Button>
  </div>
  
  <!-- 运行中状态 -->
  <div v-else-if="isScreeningRunning" class="py-12 text-center">
    <Loader2 class="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
    <h3 class="text-lg font-medium mb-2">AI 初筛进行中</h3>
    <p class="text-sm text-muted-foreground">正在分析简历内容，请稍后刷新查看结果...</p>
  </div>
  
  <!-- 有结论：显示现有内容 -->
  <div v-else class="flex-1 overflow-y-auto space-y-4 py-2">
    <!-- 现有的 verdict badge、summary、strengths、concerns 等内容 -->
  </div>
</TabsContent>
```

**导入**: `import { ClipboardList, Sparkles } from "lucide-vue-next";`

---

### Task 6: ImportView.vue 支持所有完成文件进入弹窗

**文件**: `apps/web/src/views/ImportView.vue`

#### 6.1 修改弹窗状态管理

```typescript
// 从
const screeningDialogOpen = ref(false);
const selectedScreeningData = ref<ImportTaskResultData | null>(null);

// 改为
const screeningDialogOpen = ref(false);
const selectedFile = ref<ImportFileTask | null>(null);
const selectedScreeningData = ref<ImportTaskResultData | null>(null);
```

#### 6.2 修改 showScreeningDetail 函数

```typescript
function showScreeningDetail(file: ImportFileTask) {
  const result = parseImportTaskResult(file.resultJson);
  
  // 允许所有有 parsedResume 的文件进入弹窗（不只是有 screeningConclusion 的）
  if (!result?.parsedResume) return;
  
  selectedFile.value = file;
  selectedScreeningData.value = result;
  screeningDialogOpen.value = true;
}
```

#### 6.3 修改文件卡片点击事件

找到文件卡片渲染逻辑（约 line 200+），修改：

```vue
<!-- 从 -->
@click="screeningResult(f)?.screeningConclusion && showScreeningDetail(f)"

<!-- 改为 -->
@click="parseImportTaskResult(f.resultJson)?.parsedResume && showScreeningDetail(f)"
```

#### 6.4 修改"查看详情"按钮渲染条件

```vue
<!-- 从 -->
<Button 
  v-if="screeningResult(f)?.screeningConclusion"
  @click="showScreeningDetail(f)"
>
  查看详情
</Button>

<!-- 改为 -->
<Button 
  v-if="parseImportTaskResult(f.resultJson)?.parsedResume"
  @click="showScreeningDetail(f)"
>
  查看详情
</Button>
```

#### 6.5 更新弹窗组件调用

```vue
<AiScreeningDetailDialog
  v-model:open="screeningDialogOpen"
  :file="selectedFile"
  :screening-data="selectedScreeningData"
  @run-screening="handleRunFileScreening"
/>
```

#### 6.6 添加 handleRunFileScreening 处理函数

```typescript
async function handleRunFileScreening(taskId: string) {
  const batchId = selectedFile.value?.batchId;
  if (!batchId) return;
  
  await importBatches.rerunFileScreening(taskId, batchId);
  
  // 刷新选中文件的数据
  const files = importBatches.batchFiles.value[batchId];
  const updatedFile = files?.find(f => f.id === taskId);
  if (updatedFile) {
    selectedFile.value = updatedFile;
    selectedScreeningData.value = parseImportTaskResult(updatedFile.resultJson);
  }
}
```

确保 `parseImportTaskResult` 已在文件顶部导入或内联定义。

---

### Task 7: TypeScript 类型检查

**命令**:
```bash
pnpm typecheck
```

修复所有类型错误。

---

### Task 8: 端到端测试

**步骤**:
1. 启动开发服务器: `pnpm dev:desktop`
2. 访问 `http://localhost:5173/import`
3. 创建一个导入批次（关闭 AI 初筛开关）
4. 等待文件解析完成
5. 点击"查看详情"按钮 → 应能看到双 Tab 弹窗
6. AI 初筛详情 Tab 应显示"尚未进行 AI 初筛"空态
7. 点击"推送到 AI 初筛队列" → 状态变为"进行中"
8. 切换到"原件预览" Tab → 应加载并显示简历原件

**证据保存**: 截图保存到 `.sisyphus/evidence/import-ai-dialog/`

## 关键引用

### 可复用代码来源
- **预览状态机**: `apps/web/src/views/CandidateDetailView.vue` (line 344-470)
- **预览 API**: `apps/web/src/api/candidates.ts` `downloadResume(id)`
- **Tabs 组件**: `apps/web/src/components/ui/tabs*.vue`
- **Dialog 组件**: `apps/web/src/components/ui/dialog.vue`

### 后端 API
- **单文件初筛**: `POST /api/import/file-tasks/:taskId/rerun-screening`
- **响应**: `{ taskId: string; retried: boolean; screeningStatus: string }`

### 类型定义
- **ImportFileTask**: `@ims/shared/src/db-schema.ts`
- **ImportTaskResultData**: `@ims/shared/src/api-types.ts`

## 依赖关系

```
Task 1 (API) → Task 2 (Composables) → Task 3-6 (UI 组件)
                                    ↓
                              Task 7 (TypeCheck)
                                    ↓
                              Task 8 (E2E Test)
```

## 成功标准

- [ ] 所有已完成解析的文件都能打开详情弹窗
- [ ] 弹窗有双 Tab：AI 初筛详情 / 原件预览
- [ ] 未初筛文件显示空态 + 触发按钮
- [ ] 点击触发按钮后状态变为 running
- [ ] 原件预览 Tab 能正确加载 PDF/图片
- [ ] 关闭弹窗时正确清理 object URL
- [ ] TypeScript 检查无错误
- [ ] 端到端测试通过
