# 本地 Bun API 规范 v0.2

- 状态: In Progress
- 服务: `Bun.serve`
- 角色: 客户端内部统一业务 API
- 更新: 补充完整 request/response schema 及全部错误码

---

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

---

## 3. 认证接口

### `POST /api/auth/start`

启动登录流程。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "loginUrl": "https://internal.company.com/auth?requestId=req_xxx",
    "requestId": "req_xxx"
  }
}
```

---

### `GET /api/auth/status`

查询当前认证状态。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "status": "valid | expired | unauthenticated",
    "user": {
      "id": "user_001",
      "name": "张三",
      "email": "zhangsan@company.com"
    },
    "lastValidatedAt": 1742640000000
  }
}
```

---

### `POST /api/auth/complete`

网页登录回调闭环后，完成 token 落库与用户同步。

**请求：**

```json
{
  "requestId": "req_xxx",
  "token": "xxxxx",
  "expiresAt": 1745241600000
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "status": "valid",
    "user": {
      "id": "user_001",
      "name": "张三",
      "email": "zhangsan@company.com"
    }
  }
}
```

---

### `POST /api/auth/relogin`

触发重新验证（同 `start`）。

**响应 `200`：同 `POST /api/auth/start`**

---

### `POST /api/auth/logout`

清除本地会话与缓存状态。

**响应 `200`：**

```json
{
  "success": true,
  "data": { "status": "logged_out" }
}
```

---

## 4. 用户与同步接口

### `GET /api/me`

返回当前用户信息与客户端状态。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_001",
      "name": "张三",
      "email": "zhangsan@company.com",
      "tokenStatus": "valid",
      "lastSyncAt": 1742640000000,
      "settings": {}
    },
    "syncEnabled": false,
    "opencodeReady": true,
    "opencodeVersion": "x.x.x"
  }
}
```

---

### `POST /api/sync/run`

立即执行一次同步。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "syncedCandidates": 12,
    "syncedInterviews": 5,
    "syncAt": 1742640000000
  }
}
```

---

### `POST /api/sync/toggle`

开启/关闭自动轮询同步。

**请求：**

```json
{
  "enabled": true
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMs": 5000
  }
}
```

---

### `GET /api/sync/status`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "intervalMs": 5000,
    "lastSyncAt": 1742640000000,
    "lastError": null
  }
}
```

---

## 5. 候选人接口

### `GET /api/candidates`

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 模糊搜索姓名/岗位/手机/邮箱 |
| `source` | string | `local` / `remote` / `hybrid` |
| `position` | string | 精确匹配岗位 |
| `status` | string | 面试状态 |
| `hasAiArtifacts` | boolean | 是否有 AI 产物 |
| `page` | number | 页码，从 1 开始 |
| `pageSize` | number | 每页条数，默认 20 |

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "cand_001",
        "source": "remote",
        "name": "张三",
        "phone": "13800000000",
        "email": "zhangsan@example.com",
        "position": "前端工程师",
        "yearsOfExperience": 5,
        "tags": ["react", "候选池A"],
        "createdAt": 1742505600000,
        "updatedAt": 1742640000000
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

---

### `POST /api/candidates`

创建纯本地候选人。

**请求：**

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

**响应 `201`：**

```json
{
  "success": true,
  "data": {
    "id": "cand_xxx",
    "source": "local",
    "name": "张三",
    "phone": "13800000000",
    "email": "zhangsan@example.com",
    "position": "前端工程师",
    "yearsOfExperience": 5,
    "tags": ["本地导入"],
    "createdAt": 1742640000000,
    "updatedAt": 1742640000000
  }
}
```

---

### `GET /api/candidates/:id`

返回候选人完整档案。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "candidate": {
      "id": "cand_001",
      "source": "remote",
      "remoteId": "remote_123",
      "name": "张三",
      "phone": "13800000000",
      "email": "zhangsan@example.com",
      "position": "前端工程师",
      "yearsOfExperience": 5,
      "tags": ["react"],
      "createdAt": 1742505600000,
      "updatedAt": 1742640000000
    },
    "resumes": [
      {
        "id": "res_001",
        "fileName": "张三-简历.pdf",
        "fileType": "pdf",
        "fileSize": 204800,
        "ocrConfidence": 95,
        "createdAt": 1742505600000
      }
    ],
    "interviews": [
      {
        "id": "int_001",
        "round": 1,
        "status": "completed",
        "scheduledAt": 1742505600000,
        "meetingLink": "https://meeting.example.com/abc",
        "manualEvaluation": {
          "rating": 4,
          "decision": "pass",
          "comments": "基础扎实"
        }
      }
    ],
    "artifactsSummary": [
      {
        "id": "art_001",
        "type": "screening",
        "currentVersion": 2,
        "updatedAt": 1742640000000
      }
    ],
    "workspace": {
      "id": "ws_001",
      "status": "active",
      "lastAccessedAt": 1742640000000
    }
  }
}
```

---

### `PUT /api/candidates/:id`

更新候选人信息。

**请求：**

```json
{
  "position": "高级前端工程师",
  "yearsOfExperience": 6,
  "tags": ["react", "vue"],
  "source": "hybrid"
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": { "id": "cand_001", "...updated fields" }
}
```

---

### `DELETE /api/candidates/:id`

逻辑删除（软删除）。

**响应 `200`：**

```json
{
  "success": true,
  "data": { "id": "cand_001", "deletedAt": 1742640000000 }
}
```

---

## 6. 简历接口

### `GET /api/candidates/:id/resumes`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "res_001",
        "fileName": "张三-简历.pdf",
        "fileType": "pdf",
        "fileSize": 204800,
        "filePath": "/Users/.../files/resumes/res_001.pdf",
        "extractedText": "张三\n13800000000\n...",
        "parsedData": {
          "name": "张三",
          "phone": "13800000000",
          "email": "zhangsan@example.com",
          "position": "前端工程师",
          "yearsOfExperience": 5,
          "skills": ["React", "TypeScript", "Node.js"],
          "education": [...],
          "workHistory": [...]
        },
        "ocrConfidence": 95,
        "createdAt": 1742505600000
      }
    ]
  }
}
```

---

### `GET /api/resumes/:id`

**响应 `200`：** 同上单个 resume 对象。

---

### `GET /api/resumes/:id/download`

下载原始简历文件。

**响应 `200`：** 文件流，`Content-Disposition: attachment; filename="xxx.pdf"`。

---

## 7. 面试记录接口

### `GET /api/candidates/:id/interviews`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "int_001",
        "candidateId": "cand_001",
        "round": 1,
        "status": "completed",
        "scheduledAt": 1742505600000,
        "meetingLink": "https://meeting.example.com/abc",
        "interviewerIds": ["user_001", "user_002"],
        "manualEvaluation": {
          "rating": 4,
          "decision": "pass",
          "comments": "基础扎实"
        },
        "createdAt": 1742505600000,
        "updatedAt": 1742640000000
      }
    ]
  }
}
```

---

### `POST /api/candidates/:id/interviews`

创建本地面试记录。

**请求：**

```json
{
  "round": 2,
  "scheduledAt": 1745241600000,
  "meetingLink": "https://meeting.example.com/def",
  "interviewerIds": ["user_003"]
}
```

**响应 `201`：** 返回创建的 interview 对象。

---

### `GET /api/interviews/:id`

**响应 `200`：** 单个 interview 对象（同上格式）。

---

### `PUT /api/interviews/:id`

**请求：**

```json
{
  "status": "completed",
  "scheduledAt": 1745241600000,
  "meetingLink": "https://meeting.example.com/def",
  "manualEvaluation": {
    "rating": 5,
    "decision": "strong_pass",
    "comments": "算法能力优秀"
  }
}
```

**响应 `200`：** 更新后的 interview 对象。

---

## 8. 导入接口

### `POST /api/import/batches`

创建导入批次。

**请求：**

```json
{
  "paths": [
    "/Users/a/Desktop/resume.zip",
    "/Users/a/Desktop/candidate.pdf"
  ],
  "autoScreen": false
}
```

**响应 `201`：**

```json
{
  "success": true,
  "data": {
    "id": "batch_001",
    "status": "queued",
    "totalFiles": 12,
    "autoScreen": false,
    "createdAt": 1742640000000
  }
}
```

---

### `GET /api/import/batches`

列出所有导入批次，按创建时间倒序。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "batch_001",
        "status": "processing",
        "currentStage": "parsing",
        "totalFiles": 12,
        "processedFiles": 5,
        "successFiles": 4,
        "failedFiles": 1,
        "createdAt": 1742640000000,
        "startedAt": 1742640010000,
        "completedAt": null
      }
    ]
  }
}
```

---

### `GET /api/import/batches/:id`

**响应 `200`：** 单个批次详情（同上格式，含 processedFiles/successFiles/failedFiles）。

---

### `GET /api/import/batches/:id/files`

列出批次内所有文件任务。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "task_001",
        "originalPath": "/Users/a/Desktop/resume.pdf",
        "fileType": "pdf",
        "status": "done",
        "stage": "saving",
        "errorCode": null,
        "errorMessage": null,
        "candidateId": "cand_001",
        "retryCount": 0,
        "createdAt": 1742640000000,
        "updatedAt": 1742640100000
      }
    ]
  }
}
```

---

### `POST /api/import/batches/:id/cancel`

**响应 `200`：**

```json
{
  "success": true,
  "data": { "id": "batch_001", "status": "cancelled" }
}
```

---

### `POST /api/import/batches/:id/retry-failed`

重试批次内所有失败文件。

**响应 `200`：**

```json
{
  "success": true,
  "data": { "retriedCount": 3 }
}
```

---

### `POST /api/import/files/:id/retry`

重试单个文件任务。

**响应 `200`：** 同上。

---

## 9. AI 工作台与产物接口

### `POST /api/candidates/:id/workspace`

创建或获取候选人专属 OpenCode workspace。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "candidateId": "cand_001",
    "workspace": {
      "id": "ws_001",
      "sessionId": "ses_xxx",
      "status": "active",
      "lastAccessedAt": 1742640000000
    },
    "url": "http://127.0.0.1:4096/session/ses_xxx"
  }
}
```

---

### `GET /api/candidates/:id/workspace`

**响应 `200`：** 同上，仅返回已有 workspace 信息。

---

### `GET /api/candidates/:id/artifacts`

返回该候选人全部产物摘要。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "art_001",
        "type": "screening",
        "interviewId": null,
        "roundNumber": null,
        "currentVersion": 2,
        "latestVersion": {
          "version": 2,
          "feedbackText": "题目太简单",
          "createdAt": 1742640000000
        },
        "createdAt": 1742505600000,
        "updatedAt": 1742640000000
      }
    ]
  }
}
```

---

### `GET /api/artifacts/:id`

返回单个产物详情及全部版本列表。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "artifact": {
      "id": "art_001",
      "candidateId": "cand_001",
      "type": "screening",
      "currentVersion": 2,
      "createdAt": 1742505600000,
      "updatedAt": 1742640000000
    },
    "versions": [
      {
        "id": "ver_001",
        "version": 1,
        "promptSnapshot": "请对以下简历做初筛评估",
        "feedbackText": null,
        "markdownPath": "/Users/.../artifacts/screening/v1.md",
        "createdAt": 1742505600000
      },
      {
        "id": "ver_002",
        "version": 2,
        "promptSnapshot": "请对以下简历做初筛评估",
        "feedbackText": "题目太简单，请提高到资深前端面试难度",
        "markdownPath": "/Users/.../artifacts/screening/v2.md",
        "createdAt": 1742640000000
      }
    ]
  }
}
```

---

### `POST /api/artifacts/:id/feedback`

提交反馈，触发 agent 生成新版本。

**请求：**

```json
{
  "feedback": "题目太简单，请提高到资深前端面试难度"
}
```

**响应 `202`：**

```json
{
  "success": true,
  "data": {
    "artifactId": "art_001",
    "newVersion": 3,
    "status": "generating"
  }
}
```

---

### `GET /api/artifacts/:id/download`

**查询参数：** `format=md | pdf`

**响应 `200`：** 文件流下载。

---

## 10. 共享接口

### `POST /api/share/discover/start`

开启局域网设备发现。

**响应 `200`：**

```json
{
  "success": true,
  "data": { "status": "discovering" }
}
```

---

### `POST /api/share/discover/stop`

停止发现。

---

### `GET /api/share/devices`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "recentContacts": [
      { "id": "device_001", "name": "李四的电脑", "lastSeen": 1742640000000 }
    ],
    "onlineDevices": [
      { "id": "device_002", "name": "王五的 MacBook", "ip": "192.168.1.20", "port": 3001 }
    ]
  }
}
```

---

### `POST /api/share/export`

导出候选人档案为 `.imr`。

**请求：**

```json
{
  "candidateId": "cand_001"
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "filePath": "/Users/.../exports/candidate-cand_001-1742640000.imr",
    "fileSize": 512000
  }
}
```

---

### `POST /api/share/send`

在线发送给局域网设备。

**请求：**

```json
{
  "candidateId": "cand_001",
  "target": {
    "ip": "192.168.1.20",
    "port": 3001,
    "deviceId": "device_002",
    "name": "王五的 MacBook"
  }
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "recordId": "share_001",
    "status": "success",
    "transferredAt": 1742640000000
  }
}
```

---

### `POST /api/share/import`

导入 `.imr` 文件。

**请求：**

```json
{
  "filePath": "/Users/.../candidate-cand_001-1742640000.imr"
}
```

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "recordId": "share_002",
    "result": "merged",
    "candidateId": "cand_001",
    "mergedFields": ["interviews", "artifacts"]
  }
}
```

---

### `GET /api/share/records`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "share_001",
        "type": "send",
        "candidateId": "cand_001",
        "targetDevice": { "name": "王五的 MacBook", "ip": "192.168.1.20" },
        "status": "success",
        "createdAt": 1742640000000,
        "completedAt": 1742640010000
      }
    ]
  }
}
```

---

## 11. 通知接口

### `GET /api/notifications`

**查询参数：** `unreadOnly=true | false`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif_001",
        "type": "import_complete",
        "title": "导入完成",
        "body": "批次 batch_001 已完成，12 个文件中 11 个成功",
        "readAt": null,
        "createdAt": 1742640000000
      }
    ],
    "unreadCount": 3
  }
}
```

---

### `POST /api/notifications/:id/read`

标记单条已读。

**响应 `200`：**

```json
{
  "success": true,
  "data": { "id": "notif_001", "readAt": 1742640000000 }
}
```

---

### `POST /api/notifications/read-all`

全部已读。

---

### `GET /api/indicator`

返回顶部信号灯状态。

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "status": "green",
    "reasons": ["sync_ok", "opencode_ready"]
  }
}
```

状态枚举：`gray`（无活动）| `green`（正常）| `yellow`（警告）| `red`（错误）

---

## 12. OpenCode 服务管理接口

### `GET /api/system/opencode/status`

**响应 `200`：**

```json
{
  "success": true,
  "data": {
    "running": true,
    "baseUrl": "http://127.0.0.1:4096",
    "port": 4096,
    "version": "x.x.x"
  }
}
```

---

### `POST /api/system/opencode/start`

**响应 `200`：** 返回 status（同上）。

---

### `POST /api/system/opencode/restart`

**响应 `200`：** 返回 status（同上）。

---

### `POST /api/system/opencode/stop`

**响应 `200`：**

```json
{
  "success": true,
  "data": { "running": false }
}
```

---

## 13. 错误码规范

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `AUTH_REQUIRED` | 401 | 需要登录 |
| `AUTH_EXPIRED` | 401 | token 已过期 |
| `AUTH_INVALID` | 401 | token 无效 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 422 | 请求参数校验失败 |
| `REMOTE_SYNC_FAILED` | 502 | 远程系统同步失败 |
| `IMPORT_UNSUPPORTED_FILE` | 422 | 不支持的文件类型 |
| `IMPORT_PARSE_FAILED` | 422 | 简历解析失败 |
| `IMPORT_OCR_FAILED` | 422 | OCR 识别失败 |
| `IMPORT_ARCHIVE_TOO_DEEP` | 422 | ZIP 嵌套层数超限 |
| `IMPORT_ARCHIVE_TOO_LARGE` | 413 | ZIP 文件过大 |
| `IMPORT_TEXT_EXTRACT_FAILED` | 422 | 文本提取失败 |
| `IMPORT_SAVE_FAILED` | 500 | 文件保存失败 |
| `IMPORT_INDEX_FAILED` | 500 | 索引建立失败 |
| `WORKSPACE_CREATE_FAILED` | 503 | 工作台创建失败 |
| `SHARE_DEVICE_OFFLINE` | 503 | 目标设备不在线 |
| `SHARE_CONFLICT_DETECTED` | 409 | 共享冲突（候选人信息冲突） |
| `SHARE_IMPORT_FAILED` | 422 | 导入 IMR 包失败 |
| `SHARE_VALIDATION_FAILED` | 422 | IMR 包校验失败 |
| `SYSTEM_OPENCODE_NOT_READY` | 503 | OpenCode 服务未就绪 |
| `SYSTEM_OPENCODE_CRASHED` | 503 | OpenCode 子进程异常退出 |
| `INTERNAL_ERROR` | 500 | 内部错误 |

---

## 14. 安全约束

- OpenCode 服务仅监听 `127.0.0.1`
- 不向前端暴露 token 原文
- 文件下载接口需要本地服务授权判断
- `.imr` 包校验失败时拒绝导入
