# Phase 5 & 6: 交互体验优化 - 详细技术方案（修正版）

> **目标**: 监听功能键盘化、引导页面优化、候选人选择修复
> **工期**: 7 天（修正）
> **关键交付物**: 键盘监听、优化引导、修复问题

---

## Phase 5: 监听功能键盘化重构

### 5.1 修正说明

1. 使用 Tauri v2 全局快捷键
2. 复用现有窗口机制
3. 与 Phase 1-3 的现有组件保持一致

### 5.2 Tauri 配置

```json
// apps/desktop/tauri.conf.json 新增窗口
{
  "app": {
    "windows": [
      {
        "label": "recorder",
        "title": "录音助手",
        "width": 200,
        "height": 80,
        "alwaysOnTop": true,
        "resizable": false,
        "decorations": false,
        "visible": false,
        "transparent": true
      }
    ]
  },
  "plugins": {
    "global-shortcut": {
      "shortcuts": ["CmdOrCtrl+Shift+R"]
    }
  }
}
```

### 5.3 Rust 后端实现

```rust
// apps/desktop/src/lib.rs 新增命令

use tauri::Manager;

#[tauri::command]
pub async fn toggle_recorder_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_window("recorder");
    
    if let Some(window) = window {
        if window.is_visible().map_err(|e| e.to_string())? {
            window.hide().map_err(|e| e.to_string())?
        } else {
            window.show().map_err(|e| e.to_string())?
            window.set_focus().map_err(|e| e.to_string())?
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn start_drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_drag_move().map_err(|e| e.to_string())
}
```

### 5.4 前端录音窗口

```vue
<!-- apps/web/src/views/RecorderWidget.vue -->

<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/tauri";

const isRecording = ref(false);
const isPaused = ref(false);
const elapsedTime = ref(0);

const formattedTime = computed(() => {
  const m = Math.floor(elapsedTime.value / 60);
  const s = elapsedTime.value % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});

async function toggleRecord() {
  isRecording.value = !isRecording.value;
  if (!isRecording.value) {
    elapsedTime.value = 0;
  }
}
</script>

<template>
  <div class="recorder-widget" :class="{ recording: isRecording }">
    <div class="status-indicator">
      <Mic v-if="!isRecording" class="w-6 h-6" />
      <Square v-else class="w-6 h-6" />
    </div>
    <div class="timer">{{ formattedTime }}</div>
    <Button size="sm" @click="toggleRecord">
      {{ isRecording ? "停止" : "开始" }}
    </Button>
  </div>
</template>
```

---

## Phase 6: 引导页面优化

### 6.1 引导流程

```
欢迎页面 → 端点配置 → 登录（可选）→ 完成
```

### 6.2 引导组件

```vue
<!-- apps/web/src/views/Onboarding.vue -->

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const step = ref(1);

const config = ref({
  provider: "openai",
  url: "",
  apiKey: "",
});

async function testConnection() {
  // 调用 API 测试连接
}

function complete() {
  localStorage.setItem("onboarding_completed", "true");
  router.push("/");
}
</script>

<template>
  <div class="onboarding">
    <!-- 欢迎 -->
    <div v-if="step === 1">
      <h1>欢迎使用 IMS</h1>
      <Button @click="step = 2">开始设置</Button>
    </div>

    <!-- 端点配置 -->
    <div v-if="step === 2">
      <h2>配置 AI 服务</h2>
      <Select v-model="config.provider">
        <SelectItem value="openai">OpenAI</SelectItem>
        <SelectItem value="anthropic">Claude</SelectItem>
      </Select>
      <Input v-model="config.apiKey" type="password" placeholder="API Key" />
      <Button @click="testConnection">测试连接</Button>
      <Button @click="complete">完成</Button>
    </div>
  </div>
</template>
```

---

## 7. Bug 修复

### 7.1 候选人选择显示

```vue
<!-- 修复 SelectValue 显示 -->
<SelectTrigger>
  <SelectValue>
    <template v-if="selectedCandidate">
      {{ selectedCandidate.name }}
    </template>
  </SelectValue>
</SelectTrigger>
```

### 7.2 思考阶段展开/收起

```typescript
// 使用 conversationId + messageId 作为唯一 key
const storageKey = computed(
  () => `reasoning-open-${props.conversationId}-${props.messageId}`
);
```

---

## 8. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 |
|----|------|------|------|--------|
| P5-T1 | Tauri 录音窗口 | 1d | - | 中 |
| P5-T2 | Rust 快捷键 | 1.5d | T1 | 中 |
| P5-T3 | 前端录音组件 | 1d | T1 | 中 |
| P5-T4 | 引导页面 | 1.5d | - | 低 |
| P5-T5 | Bug 修复 | 1d | - | 高 |
| P5-T6 | 集成测试 | 1d | 以上全部 | 高 |

**Phase 5-6 总工期**: 7 天

---

**文档完成** ✅
