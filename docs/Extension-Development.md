# Agent 扩展开发指南

## 概述

本文档介绍如何开发 IMS Agent 扩展。

## 扩展结构

一个 Agent 扩展是一个 ESM 模块,需要导出以下内容:

```typescript
import type { AgentManifest, AgentFactory } from '@ims/web/agents';

interface AgentExtension {
  manifest: AgentManifest;
  factory: AgentFactory;
  ui?: {
    settingsComponent?: () => Promise<Component>;
    messageRenderer?: () => Promise<Component>;
  };
}

export default {
  manifest: { ... },
  factory: () => { ... },
} satisfies AgentExtension;
```

## 示例: 自定义简历分析 Agent

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { AgentManifest, AgentFactory, AgentTool } from '@ims/web/agents';

const manifest: AgentManifest = {
  id: 'custom-resume-analyzer',
  name: '自定义简历分析',
  description: '使用自定义规则分析简历',
  capabilities: ['resume-analysis', 'custom-rules'],
  model: 'gpt-4o',
  category: 'extension',
  permissions: ['candidate:read', 'resume:read'],
};

const factory: AgentFactory = () => {
  const tools: Record<string, AgentTool> = {
    customAnalysis: {
      description: '应用自定义分析规则',
      inputSchema: z.object({
        rules: z.array(z.string()).describe('自定义规则列表'),
      }),
      execute: async ({ rules }, context) => {
        // 实现自定义分析逻辑
        return { analysis: '...' };
      },
    },
  };

  return {
    systemPrompt: `你是自定义简历分析助手。
    
你的职责:
- 读取简历内容
- 应用自定义分析规则
- 生成分析报告`,
    tools,
    maxSteps: 5,
  };
};

export default {
  manifest,
  factory,
} satisfies AgentExtension;
```

## 示例: 候选人搜索 Agent

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { AgentManifest, AgentFactory, AgentTool } from '@ims/web/agents';

const manifest: AgentManifest = {
  id: 'candidate-search',
  name: '候选人搜索',
  description: '根据条件搜索候选人',
  capabilities: ['search', 'filter'],
  model: 'gpt-4o',
  category: 'extension',
  permissions: ['candidate:read'],
};

const factory: AgentFactory = () => {
  const tools: Record<string, AgentTool> = {
    searchCandidates: {
      description: '搜索候选人',
      inputSchema: z.object({
        keywords: z.array(z.string()).describe('搜索关键词'),
        status: z.enum(['new', 'screening', 'interview', 'offer', 'hired', 'rejected']).optional().describe('候选人状态'),
        limit: z.number().optional().describe('返回数量限制'),
      }),
      execute: async ({ keywords, status, limit }, context) => {
        // 实现搜索逻辑
        // 可以通过 context 访问 IMS 业务状态
        return { candidates: [] };
      },
    },
  };

  return {
    systemPrompt: `你是候选人搜索助手。

你的职责:
- 根据用户需求搜索候选人
- 应用筛选条件
- 返回匹配的候选人列表`,
    tools,
    maxSteps: 3,
  };
};

export default {
  manifest,
  factory,
} satisfies AgentExtension;
```

## Manifest 字段说明

### 必填字段

- `id`: Agent 唯一标识符 (小写字母、数字、连字符)
- `name`: Agent 显示名称
- `description`: Agent 功能描述
- `model`: 使用的模型名称 (如 'gpt-4o', 'gpt-3.5-turbo')
- `category`: 必须为 'extension'
- `permissions`: 所需权限列表

### 可选字段

- `capabilities`: Agent 能力标签列表
- `handoffTargets`: 可移交的目标 Agent ID 列表
- `ui`: UI 扩展配置
  - `icon`: 图标名称
  - `color`: 主题颜色

## 权限列表

| 权限 | 说明 |
|------|------|
| `candidate:read` | 读取候选人信息 |
| `candidate:write` | 修改候选人信息 |
| `candidate:create` | 创建候选人 |
| `candidate:delete` | 删除候选人 |
| `interview:read` | 读取面试信息 |
| `interview:write` | 修改面试信息 |
| `interview:create` | 创建面试 |
| `resume:read` | 读取简历信息 |
| `resume:parse` | 解析简历 |
| `system:read` | 读取系统信息 |
| `system:settings` | 修改系统设置 |
| `system:extensions` | 管理扩展 |

## 工具定义

工具使用 Vercel AI SDK 的 `tool()` 函数定义:

```typescript
const myTool: AgentTool = {
  description: '工具描述',
  inputSchema: z.object({
    param1: z.string().describe('参数1说明'),
    param2: z.number().optional().describe('参数2说明'),
  }),
  execute: async (params, context) => {
    // 实现工具逻辑
    // params: 输入参数
    // context: IMS 业务上下文
    return { result: '...' };
  },
};
```

## 发布扩展

1. 将扩展打包为 ESM 模块
2. 部署到 HTTPS 服务器
3. 在 IMS 扩展管理界面中加载

### 打包示例

使用 Vite 或 Rollup 打包:

```javascript
// vite.config.js
export default {
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MyAgentExtension',
      fileName: 'index',
      formats: ['es'],
    },
  },
};
```

### 部署要求

- 必须通过 HTTPS 提供服务
- 必须设置正确的 CORS 头
- 建议使用 CDN 加速

## 安全要求

- 必须通过 HTTPS 加载
- 必须声明所需权限
- 权限会被运行时校验
- 敏感操作需要用户确认

## 调试扩展

### 本地调试

1. 创建扩展文件 (如 `my-extension.js`)
2. 在扩展管理界面选择"从本地文件加载"
3. 查看控制台日志

### 远程调试

1. 部署扩展到测试服务器
2. 在扩展管理界面输入 URL
3. 查看加载状态和错误信息

## 最佳实践

1. **最小权限原则**: 只申请必要的权限
2. **清晰的描述**: 提供详细的 manifest 信息
3. **错误处理**: 在工具中妥善处理错误
4. **性能优化**: 避免长时间运行的操作
5. **用户体验**: 提供友好的交互提示

## 常见问题

### Q: 如何访问 IMS 业务数据?

A: 通过工具的 `context` 参数访问。Context 包含当前候选人、面试等信息。

### Q: 如何实现 Agent 之间的移交?

A: 在 manifest 中声明 `handoffTargets`,然后在工具中返回移交指令。

### Q: 如何调试扩展?

A: 使用浏览器开发者工具查看控制台日志和网络请求。

### Q: 扩展加载失败怎么办?

A: 检查 URL 是否正确、权限是否声明、manifest 是否完整。

## 参考资源

- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [Zod 文档](https://zod.dev/)
- [IMS Agent 架构设计](./Agent-Extension-Architecture.md)