# Phase 5 & 6: 交互体验优化 - 详细技术方案

> **目标**: 监听功能键盘化、引导页面优化、候选人选择修复、PDF 资源打通
> **工期**: 8 天
> **关键交付物**: 键盘监听、优化引导、修复问题

---

## Phase 5: 监听功能键盘化重构

### 5.1 需求分析

**现状问题**:
- 监听功能（录音/暂停/继续）在页面上显示按钮，占用空间
- 在 Tauri 桌面环境中，应该使用全局快捷键
- 需要独立窗口支持专注模式

**目标设计**:
- 独立小窗口（Floating Widget）
- 支持全局快捷键（Cmd/Ctrl + Shift + R 录音，Space 暂停/继续）
- 简洁的视觉反馈

### 5.2 Tauri 配置

```json
// apps/desktop/tauri.conf.json 添加新窗口配置
{
  "windows": [
    {
      "label": "recorder",
      "title": "录音助手",
      "width": 200,
      "height": 80,
      "alwaysOnTop": true,
      "resizable": false,
      "maximizable": false,
      "minimizable": false,
      "decorations": false, // 无边框
      "visible": false, // 默认隐藏
      "transparent": true,
      "skipTaskbar": true
    }
  ],
  "shortcuts": {
    "record-toggle": {
      "key": "CmdOrCtrl+Shift+R",
      "action": "toggle-recording"
    },
    "record-pause": {
      "key": "Space",
      "action": "toggle-pause",
      "scope": "recorder-window"
    }
  }
}
```

### 5.3 Rust 后端实现

```rust
// apps/desktop/src/recorder.rs

use tauri::{Manager, Window, WindowBuilder, Position, Size, Runtime};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct RecorderState {
    is_recording: AtomicBool,
    is_paused: AtomicBool,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            is_recording: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
        }
    }
}

// 显示/隐藏录音窗口
#[tauri::command]
pub async fn toggle_recorder_window<R: Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, RecorderState>,
) -> Result<(), String> {
    let window = app.get_window("recorder");
    
    if let Some(window) = window {
        // 窗口已存在，切换可见性
        if window.is_visible().map_err(|e| e.to_string())? {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    } else {
        // 创建新窗口
        let new_window = WindowBuilder::new(
            &app,
            "recorder",
            tauri::WindowUrl::App("/recorder".into())
        )
        .title("录音助手")
        .width(200.0)
        .height(80.0)
        .always_on_top(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .position(100.0, 100.0) // 默认位置，可配置
        .build()
        .map_err(|e| e.to_string())?;
        
        // 设置窗口在屏幕右下角
        if let Some(monitor) = new_window.current_monitor().map_err(|e| e.to_string())? {
            let screen_size = monitor.size();
            let window_size = new_window.outer_size().map_err(|e| e.to_string())?;
            
            new_window.set_position(
                Position::Physical(tauri::PhysicalPosition {
                    x: screen_size.width as i32 - window_size.width as i32 - 20,
                    y: screen_size.height as i32 - window_size.height as i32 - 40,
                })
            ).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

// 开始/停止录音
#[tauri::command]
pub async fn toggle_recording(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecorderStatus, String> {
    let was_recording = state.is_recording.load(Ordering::SeqCst);
    
    if was_recording {
        // 停止录音
        state.is_recording.store(false, Ordering::SeqCst);
        state.is_paused.store(false, Ordering::SeqCst);
        
        // TODO: 停止录音逻辑
        
        Ok(RecorderStatus::Stopped)
    } else {
        // 开始录音
        state.is_recording.store(true, Ordering::SeqCst);
        
        // TODO: 开始录音逻辑
        
        Ok(RecorderStatus::Recording)
    }
}

// 暂停/继续
#[tauri::command]
pub async fn toggle_pause(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecorderStatus, String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        return Err("未在录音状态".to_string());
    }
    
    let was_paused = state.is_paused.load(Ordering::SeqCst);
    state.is_paused.store(!was_paused, Ordering::SeqCst);
    
    // TODO: 暂停/继续录音逻辑
    
    if was_paused {
        Ok(RecorderStatus::Recording)
    } else {
        Ok(RecorderStatus::Paused)
    }
}

#[derive(serde::Serialize)]
pub enum RecorderStatus {
    Recording,
    Paused,
    Stopped,
}

// 获取状态
#[tauri::command]
pub async fn get_recorder_status(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecorderStatus, String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        Ok(RecorderStatus::Stopped)
    } else if state.is_paused.load(Ordering::SeqCst) {
        Ok(RecorderStatus::Paused)
    } else {
        Ok(RecorderStatus::Recording)
    }
}
```

### 5.4 前端录音窗口组件

```vue
<!-- apps/web/src/views/RecorderWidget.vue -->

<template>
  <div 
    class="recorder-widget"
    :class="{ recording: isRecording, paused: isPaused }"
    @mousedown="startDrag"
  >
    <!-- 录音状态指示器 -->
    <div class="status-indicator">
      <div class="pulse" v-if="isRecording && !isPaused"></div>
      <div class="icon">
        <Mic v-if="!isRecording" class="w-6 h-6" />
        <Pause v-else-if="isPaused" class="w-6 h-6" />
        <Square v-else class="w-6 h-6" />
      </div>
    </div>
    
    <!-- 时间显示 -->
    <div class="timer">
      {{ formattedTime }}
    </div>
    
    <!-- 控制按钮 -->
    <div class="controls">
      <Button 
        size="sm" 
        variant="ghost"
        @click="toggleRecord"
        :class="{ 'text-red-500': isRecording }"
      >
        {{ isRecording ? '停止' : '开始' }}
      </Button>
      
      <Button 
        v-if="isRecording"
        size="sm" 
        variant="ghost"
        @click="togglePause"
      >
        {{ isPaused ? '继续' : '暂停' }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { Mic, Pause, Square } from 'lucide-vue-next';

const isRecording = ref(false);
const isPaused = ref(false);
const elapsedTime = ref(0);
let timerInterval: number | null = null;

// 格式化时间显示
const formattedTime = computed(() => {
  const minutes = Math.floor(elapsedTime.value / 60);
  const seconds = elapsedTime.value % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
});

// 开始/停止录音
async function toggleRecord() {
  const status = await invoke<string>('toggle_recording');
  updateStatus(status);
}

// 暂停/继续
async function togglePause() {
  const status = await invoke<string>('toggle_pause');
  updateStatus(status);
}

// 更新状态
function updateStatus(status: string) {
  if (status === 'Recording') {
    isRecording.value = true;
    isPaused.value = false;
    startTimer();
  } else if (status === 'Paused') {
    isPaused.value = true;
    stopTimer();
  } else {
    isRecording.value = false;
    isPaused.value = false;
    stopTimer();
    elapsedTime.value = 0;
  }
}

// 计时器
function startTimer() {
  if (timerInterval) return;
  timerInterval = window.setInterval(() => {
    if (!isPaused.value) {
      elapsedTime.value++;
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// 窗口拖拽
function startDrag(e: MouseEvent) {
  // 通过 Tauri API 实现窗口拖拽
  if ((e.target as HTMLElement).closest('.status-indicator')) {
    // 只有点击指示器区域才拖拽
    invoke('start_drag_window');
  }
}

// 监听全局快捷键事件
let unlistenRecord: (() => void) | null = null;
let unlistenPause: (() => void) | null = null;

onMounted(async () => {
  // 获取初始状态
  const status = await invoke<string>('get_recorder_status');
  updateStatus(status);
  
  // 监听全局快捷键
  unlistenRecord = await listen('shortcut-record', () => {
    toggleRecord();
  });
  
  unlistenPause = await listen('shortcut-pause', () => {
    if (isRecording.value) {
      togglePause();
    }
  });
});

onUnmounted(() => {
  stopTimer();
  unlistenRecord?.();
  unlistenPause?.();
});
</script>

<style scoped>
.recorder-widget {
  width: 200px;
  height: 80px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 12px;
  color: white;
  backdrop-filter: blur(10px);
  -webkit-app-region: drag; /* 允许拖拽 */
}

.recorder-widget .controls {
  -webkit-app-region: no-drag; /* 按钮区域不拖拽 */
}

.status-indicator {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.recording .status-indicator {
  background: rgba(239, 68, 68, 0.2);
}

.pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.5);
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.timer {
  font-family: monospace;
  font-size: 18px;
  font-weight: 500;
}

.controls {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
</style>
```

### 5.5 主窗口触发录音窗口

```typescript
// apps/web/src/composables/useRecorder.ts

import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export function useRecorder() {
  // 显示录音窗口
  async function showRecorder() {
    await invoke('toggle_recorder_window');
  }
  
  // 注册全局快捷键监听（如果在主窗口）
  async function registerShortcuts() {
    // 监听录音切换事件
    await listen('shortcut-record', async () => {
      await invoke('toggle_recording');
    });
  }
  
  return {
    showRecorder,
    registerShortcuts,
  };
}
```

---

## Phase 6: 引导页面优化

### 6.1 引导流程设计

```
引导页面流程 (Onboarding Flow)
├── 步骤 1: 欢迎页面
│   └── 产品介绍 + 开始使用按钮
├── 步骤 2: 端点配置
│   ├── AI 服务商选择（OpenAI/Claude/自定义）
│   ├── API Key 输入
│   └── 测试连接按钮
├── 步骤 3: 登录/注册（可选）
│   └── 扫码登录/邮箱登录
├── 步骤 4: 快速设置
│   ├── 选择行业/岗位类型
│   └── 设置默认面试官
└── 步骤 5: 完成
    └── 进入主界面
```

### 6.2 引导页面组件

```vue
<!-- apps/web/src/views/Onboarding.vue -->

<template>
  <div class="onboarding">
    <!-- 步骤指示器 -->
    <div class="step-indicator">
      <div 
        v-for="step in totalSteps" 
        :key="step"
        class="step-dot"
        :class="{ active: currentStep >= step, completed: currentStep > step }"
      >
        {{ step }}
      </div>
    </div>
    
    <!-- 步骤内容 -->
    <div class="step-content">
      <!-- 步骤 1: 欢迎 -->
      <div v-if="currentStep === 1" class="step">
        <div class="welcome">
          <h1 class="text-3xl font-bold mb-4">欢迎使用 IMS 面试助手</h1>
          <p class="text-muted-foreground mb-8">
            智能面试管理，让招聘更高效
          </p>
          <Button size="lg" @click="nextStep">
            开始设置
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <!-- 步骤 2: 端点配置 -->
      <div v-if="currentStep === 2" class="step">
        <h2 class="text-2xl font-bold mb-6">配置 AI 服务</h2>
        
        <div class="space-y-6 max-w-md mx-auto">
          <!-- 服务商选择 -->
          <div>
            <Label>AI 服务商</Label>
            <Select v-model="endpointConfig.provider">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <!-- 端点 URL -->
          <div>
            <Label>API 端点</Label>
            <Input 
              v-model="endpointConfig.url"
              :placeholder="getPlaceholder()"
            />
          </div>
          
          <!-- API Key -->
          <div>
            <Label>API Key</Label>
            <Input 
              v-model="endpointConfig.apiKey"
              type="password"
              placeholder="sk-..."
            />
          </div>
          
          <!-- 测试连接 -->
          <Button 
            variant="outline" 
            @click="testConnection"
            :loading="testing"
          >
            <CheckCircle v-if="testSuccess" class="mr-2 h-4 w-4 text-green-500" />
            <XCircle v-else-if="testFailed" class="mr-2 h-4 w-4 text-red-500" />
            {{ testButtonText }}
          </Button>
        </div>
        
        <div class="mt-8 flex justify-between">
          <Button variant="ghost" @click="prevStep">返回</Button>
          <Button @click="nextStep" :disabled="!testSuccess">继续</Button>
        </div>
      </div>
      
      <!-- 步骤 3: 登录（可选） -->
      <div v-if="currentStep === 3" class="step">
        <h2 class="text-2xl font-bold mb-6">登录账号（可选）</h2>
        
        <div class="login-options max-w-md mx-auto space-y-4">
          <!-- 扫码登录 -->
          <Card class="cursor-pointer hover:border-primary" @click="loginWithQR">
            <CardContent class="flex items-center gap-4 p-6">
              <QrCode class="h-8 w-8" />
              <div>
                <p class="font-medium">扫码登录</p>
                <p class="text-sm text-muted-foreground">使用移动端扫码快速登录</p>
              </div>
            </CardContent>
          </Card>
          
          <!-- 跳过 -->
          <Button variant="ghost" class="w-full" @click="nextStep">
            跳过，稍后设置
          </Button>
        </div>
        
        <div class="mt-8 flex justify-between">
          <Button variant="ghost" @click="prevStep">返回</Button>
          <Button @click="nextStep">继续</Button>
        </div>
      </div>
      
      <!-- 步骤 4: 快速设置 -->
      <div v-if="currentStep === 4" class="step">
        <h2 class="text-2xl font-bold mb-6">快速设置</h2>
        
        <div class="space-y-6 max-w-md mx-auto">
          <div>
            <Label>主要招聘领域</Label>
            <Select v-model="settings.industry">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tech">互联网/科技</SelectItem>
                <SelectItem value="finance">金融</SelectItem>
                <SelectItem value="manufacturing">制造业</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>默认面试官</Label>
            <Input v-model="settings.interviewerName" placeholder="您的姓名" />
          </div>
        </div>
        
        <div class="mt-8 flex justify-between">
          <Button variant="ghost" @click="prevStep">返回</Button>
          <Button @click="completeSetup">完成设置</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { aiApi } from '@/api/ai';

const router = useRouter();
const currentStep = ref(1);
const totalSteps = 4;

// 端点配置
const endpointConfig = reactive({
  provider: 'openai',
  url: '',
  apiKey: '',
});

// 设置
const settings = reactive({
  industry: 'tech',
  interviewerName: '',
});

// 测试连接状态
const testing = ref(false);
const testSuccess = ref(false);
const testFailed = ref(false);

const testButtonText = computed(() => {
  if (testing.value) return '测试中...';
  if (testSuccess.value) return '连接成功';
  if (testFailed.value) return '连接失败，重试';
  return '测试连接';
});

function getPlaceholder() {
  const placeholders: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    custom: 'https://your-api-endpoint.com',
  };
  return placeholders[endpointConfig.provider];
}

async function testConnection() {
  testing.value = true;
  testSuccess.value = false;
  testFailed.value = false;
  
  try {
    const result = await aiApi.testEndpoint({
      url: endpointConfig.url,
      apiKey: endpointConfig.apiKey,
    });
    
    testSuccess.value = result.success;
    testFailed.value = !result.success;
  } catch {
    testFailed.value = true;
  } finally {
    testing.value = false;
  }
}

async function completeSetup() {
  // 保存配置
  await aiApi.saveEndpoint(endpointConfig);
  await aiApi.saveSettings(settings);
  
  // 标记已完成引导
  localStorage.setItem('onboarding_completed', 'true');
  
  // 进入主界面
  router.push('/');
}

function nextStep() {
  if (currentStep.value < totalSteps) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
}
</script>
```

---

## 7. 其他修复项

### 7.1 候选人选择显示修复

```vue
<!-- 修复 agent-selector.vue 中的 Select 组件 -->

<Select v-model="selectedCandidateId">
  <SelectTrigger>
    <SelectValue placeholder="选择候选人">
      <!-- 修复：显示候选人名字 -->
      <template v-if="selectedCandidate">
        {{ selectedCandidate.name }}
      </template>
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    <SelectItem 
      v-for="candidate in candidates" 
      :key="candidate.id" 
      :value="candidate.id"
    >
      {{ candidate.name }} - {{ candidate.position }}
    </SelectItem>
  </SelectContent>
</Select>
```

### 7.2 PDF 资源下载修复

```typescript
// 在 file-manager.ts 中添加 PDF 处理

async function extractPdfText(fileId: string): Promise<string> {
  // 使用 PDF.js 或其他库提取文本
  const pdfjsLib = await import('pdfjs-dist');
  const file = await fileManager.getFileById(fileId);
  if (!file || file.mimeType !== 'application/pdf') {
    throw new Error('不是 PDF 文件');
  }
  
  const content = await fileManager.readFile(fileId);
  // 处理 PDF 内容...
  return extractedText;
}
```

---

## 8. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 |
|----|------|------|------|--------|----------|
| P5-T1 | Tauri 录音窗口配置 | 1d | - | 中 | 窗口配置完成 |
| P5-T2 | Rust 后端录音控制 | 1.5d | T1 | 中 | 快捷键可用 |
| P5-T3 | 前端录音窗口组件 | 1d | T1 | 中 | UI 完成 |
| P5-T4 | 引导页面设计 | 0.5d | - | 低 | 设计稿完成 |
| P5-T5 | 引导页面实现 | 1.5d | T4 | 低 | 4 步引导可用 |
| P5-T6 | 候选人选择修复 | 0.5d | - | 高 | 显示正确 |
| P5-T7 | PDF 资源打通 | 1d | - | 中 | 可下载 PDF |
| P5-T8 | 集成测试 | 1d | 以上全部 | 高 | 测试通过 |

**Phase 5-6 总工期**: 8 天

---

**文档完成** ✅
