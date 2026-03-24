# Requirements Document

## Introduction

LUI AI Gateway 集成模块为 Interview Manager System 提供统一的 AI 服务管理能力，支持多模型切换、智能体管理、强度调节、安全授权等功能。该模块将作为 LUI (Language User Interface) 的核心基础设施，为用户提供灵活的 AI 交互体验。

## Alignment with Product Vision

该功能支持 product.md 中的 AI 赋能面试管理愿景：
- 提供统一的 AI Gateway 接入层，支持多种 AI 服务提供商
- 通过智能体 (Agent) 系统实现任务特定的 AI 行为定制
- 通过强度调节让用户平衡输出质量与响应速度
- 通过 OS Keyring 安全存储凭证，保护用户 API Key

## Requirements

### Requirement 1: 智能体切换 (Agent Selector)

**User Story:** 作为面试官，我可以在 LUI 工作区快速切换不同的智能体配置，以便针对不同面试环节使用合适的 AI 助手。

#### Acceptance Criteria

1. WHEN 用户点击底部工具栏的智能体选择器 THEN 系统 SHALL 显示已保存的智能体列表
2. WHEN 用户选择某个智能体 THEN 系统 SHALL 将该智能体的 system prompt 和工具配置应用到当前会话
3. IF 当前会话已有消息 THEN 系统 SHALL 提示用户确认切换（可选：保持历史或清空上下文）
4. WHEN 用户创建新会话 THEN 系统 SHALL 默认使用上次使用的智能体

### Requirement 2: 模型切换 (Model Selector)

**User Story:** 作为面试官，我可以在不同 AI 模型之间快速切换，以便根据需要选择性能、成本或功能更适合的模型。

#### Acceptance Criteria

1. WHEN 用户点击模型选择器 THEN 系统 SHALL 显示可用的 AI 模型列表（按提供商分组）
2. WHEN 用户选择某个模型 THEN 系统 SHALL 将该模型用于后续所有 AI 请求
3. IF 所选模型需要 API Key 但尚未配置 THEN 系统 SHALL 提示用户进行授权
4. WHEN 模型切换时 THEN 系统 SHALL 保持当前会话上下文不变

### Requirement 3: 强度调节 (Temperature Control)

**User Story:** 作为面试官，我可以调节 AI 输出的创意强度，以便在精确回答和发散思考之间灵活切换。

#### Acceptance Criteria

1. WHEN 用户点击强度调节按钮 THEN 系统 SHALL 显示三档选项：精确(0.0)、平衡(0.5)、创意(1.0)
2. WHEN 用户选择某一档位 THEN 系统 SHALL 将该 temperature 值应用到后续 AI 请求
3. WHEN 显示当前档位时 THEN 系统 SHALL 使用视觉标识（图标/颜色）区分不同强度
4. IF 当前使用特定智能体 THEN 系统 SHALL 优先使用智能体配置的默认强度

### Requirement 4: 一键自动授权 (Auto-Authorization)

**User Story:** 作为面试官，我可以通过一键授权快速配置 AI 服务，无需手动输入和记忆复杂的 API Key。

#### Acceptance Criteria

1. WHEN 用户首次使用需要授权的模型 THEN 系统 SHALL 显示授权按钮
2. WHEN 用户点击授权按钮 THEN 系统 SHALL 弹出 OAuth 授权窗口或 API Key 输入框
3. WHEN 用户完成授权 THEN 系统 SHALL 将凭证安全存储到 OS Keyring
4. WHEN 存储成功后 THEN 系统 SHALL 显示授权状态为"已授权"并启用模型使用
5. IF 授权失败 THEN 系统 SHALL 显示错误信息并允许重试

### Requirement 5: 待办指示器 (Task Queue Indicator)

**User Story:** 作为面试官，我可以在输入框上方看到当前 AI 处理任务的进度，以便了解系统状态和等待时间。

#### Acceptance Criteria

1. WHEN AI 开始处理请求 THEN 系统 SHALL 在输入框上方显示待办指示器
2. WHEN 显示待办指示器时 THEN 系统 SHALL 展示当前处理任务名称和进度状态
3. WHEN 存在多个待处理任务 THEN 系统 SHALL 显示队列数量和预计等待时间
4. WHEN 任务完成或失败 THEN 系统 SHALL 自动隐藏或更新指示器状态
5. WHEN 用户点击指示器 THEN 系统 SHALL 展开详细任务列表和状态

## Non-Functional Requirements

### Code Architecture and Modularity
- **Single Responsibility Principle**: 
  - `ai-gateway.ts` - 统一网关接口层
  - `credential-manager.ts` - 凭证管理 (OS Keyring 封装)
  - `model-registry.ts` - 模型注册表
  - `agent-config.ts` - 智能体配置管理
  - `task-queue.ts` - 任务队列管理
  
- **Modular Design**: 各模块独立，通过接口通信
- **Dependency Management**: 网关层不依赖具体模型实现
- **Clear Interfaces**: 定义 `AIGateway`、`CredentialStore`、`ModelProvider` 等接口

### Performance
- 模型列表加载时间 < 100ms
- 授权过程响应时间 < 3s
- 任务队列更新延迟 < 200ms

### Security
- API Key 必须存储在 OS Keyring，禁止明文存储
- 授权凭证在内存中仅保留必要时间
- 敏感信息不出现在日志中

### Reliability
- 授权失败时提供清晰的错误信息和重试机制
- 网络异常时自动重试最多 3 次
- 凭证过期时自动提示重新授权

### Usability
- UI 元素与现有 shadcn-vue 设计系统保持一致
- 授权流程引导清晰，最多 3 步完成
- 状态指示使用用户熟悉的图标和文案
