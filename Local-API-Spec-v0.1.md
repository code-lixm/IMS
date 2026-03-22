# 本地 Bun API 规范 v0.1

- 状态: Draft
- 服务: `Bun.serve`
- 角色: 客户端内部统一业务 API

## 1. 设计原则

- 前端只访问本地 API
- 本地 API 负责数据库、远程系统、文件、任务与 OpenCode 服务协同
- 统一鉴权、统一错误码、统一响应格式

## 2. 响应格式

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-03-22T12:00:00Z"
  }
}
```

失败示例：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AUTH_EXPIRED",
    "message": "登录已过期，请重新验证"
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-03-22T12:00:00Z"
  }
}
```

## 3. 认证接口

### `POST /api/auth/start`

作用：启动登录流程。

返回：

- `loginUrl`
- `requestId`

### `GET /api/auth/status`

返回：

- `status`: `valid | expired | unauthenticated`
- `user`
- `lastValidatedAt`

### `POST /api/auth/complete`

作用：网页登录回调闭环后，由本地服务完成 token 落库与用户同步。

### `POST /api/auth/relogin`

作用：触发重新验证。

### `POST /api/auth/logout`

作用：清除本地会话与缓存状态。

## 4. 用户与同步接口

### `GET /api/me`

返回当前用户信息与客户端状态。

### `POST /api/sync/run`

作用：立即执行一次同步。

### `POST /api/sync/toggle`

请求：

```json
{
  "enabled": true
}
```

规则：

- `true`: 开启 5 秒轮询
- `false`: 停止轮询

### `GET /api/sync/status`

返回：

- `enabled`
- `intervalMs`
- `lastSyncAt`
- `lastError`

## 5. 候选人接口

### `GET /api/candidates`

查询参数：

- `search`
- `source`
- `position`
- `round`
- `status`
- `hasAiArtifacts`
- `page`
- `pageSize`

### `POST /api/candidates`

作用：创建纯本地候选人。

请求示例：

```json
{
  "name": "张三",
  "phone": "13800000000",
  "email": "zhangsan@example.com",
  "position": "前端工程师",
  "yearsOfExperience": 5,
  "tags": ["本地导入"]
}
```

### `GET /api/candidates/:id`

返回候选人完整档案：

- 候选人基本信息
- 简历列表
- 面试记录
- AI 产物摘要
- workspace 信息

### `PUT /api/candidates/:id`

更新允许项：

- `position`
- `yearsOfExperience`
- `tags`
- `source`

### `DELETE /api/candidates/:id`

说明：逻辑删除。

## 6. 面试记录接口

### `GET /api/candidates/:id/interviews`

### `POST /api/candidates/:id/interviews`

创建本地面试记录。

### `GET /api/interviews/:id`

### `PUT /api/interviews/:id`

允许更新：

- `status`
- `scheduledAt`
- `meetingLink`
- `manualEvaluation`

### `POST /api/interviews/:id/export`

导出该轮面试资料。

## 7. 导入接口

### `POST /api/import/batches`

作用：创建导入批次。

请求：

```json
{
  "paths": [
    "/Users/a/Desktop/resume.zip",
    "/Users/a/Desktop/candidate.pdf"
  ],
  "autoScreen": false
}
```

返回：

- `batchId`
- `status`

### `GET /api/import/batches`

### `GET /api/import/batches/:id`

### `GET /api/import/batches/:id/files`

### `POST /api/import/batches/:id/cancel`

### `POST /api/import/batches/:id/retry-failed`

## 8. AI 工作台与产物接口

### `POST /api/candidates/:id/workspace`

作用：创建或获取候选人专属 OpenCode workspace。

返回：

```json
{
  "candidateId": "cand_001",
  "sessionId": "ses_xxx",
  "url": "http://127.0.0.1:4096/session/ses_xxx"
}
```

### `GET /api/candidates/:id/workspace`

返回已有映射。

### `GET /api/candidates/:id/artifacts`

返回该候选人全部产物摘要。

### `GET /api/artifacts/:id`

返回单个产物与版本列表。

### `POST /api/artifacts/:id/feedback`

作用：提交反馈，触发 agent 优化并生成新版本。

请求：

```json
{
  "feedback": "题目太简单，请提高到资深前端面试难度"
}
```

### `GET /api/artifacts/:id/download?format=md`

支持：

- `md`
- `pdf`

## 9. 共享接口

### `POST /api/share/discover/start`

作用：开启局域网设备发现。

### `POST /api/share/discover/stop`

### `GET /api/share/devices`

返回：

- 最近联系人
- 当前发现设备

### `POST /api/share/export`

请求：

```json
{
  "candidateId": "cand_001"
}
```

返回：

- `.imr` 路径

### `POST /api/share/send`

请求：

```json
{
  "candidateId": "cand_001",
  "target": {
    "ip": "192.168.1.20",
    "port": 3001,
    "name": "李四的电脑"
  }
}
```

### `POST /api/share/import`

作用：导入 `.imr`。

### `GET /api/share/records`

查看发送/接收历史。

## 10. 通知接口

### `GET /api/notifications`

### `POST /api/notifications/:id/read`

### `GET /api/indicator`

返回顶部信号灯状态：

- `gray`
- `green`
- `yellow`
- `red`

## 11. OpenCode 服务管理接口

### `GET /api/system/opencode/status`

返回：

- `running`
- `baseUrl`
- `port`
- `version`

### `POST /api/system/opencode/start`

### `POST /api/system/opencode/restart`

### `POST /api/system/opencode/stop`

## 12. 错误码规范

- `AUTH_REQUIRED`
- `AUTH_EXPIRED`
- `REMOTE_SYNC_FAILED`
- `IMPORT_UNSUPPORTED_FILE`
- `IMPORT_PARSE_FAILED`
- `IMPORT_OCR_FAILED`
- `WORKSPACE_CREATE_FAILED`
- `SHARE_DEVICE_OFFLINE`
- `SHARE_CONFLICT_DETECTED`
- `SYSTEM_OPENCODE_NOT_READY`

## 13. 安全约束

- OpenCode 服务仅监听本机地址
- 不向前端暴露 token 原文
- 文件下载接口需要本地服务授权判断
