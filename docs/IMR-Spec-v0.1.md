# IMR 包格式规范 v0.1

- 状态: Draft
- 格式名: `IMR` (`Interview Manager Resume`)
- 文件后缀: `.imr`
- 底层容器: `zip`

## 1. 目标

`.imr` 用于在客户端之间传递完整候选人档案，覆盖以下场景：

- 局域网在线共享前的统一打包格式
- 离线导出导入
- 数据备份与交接

共享单位不是单个文件，而是完整候选人档案。

## 2. 包含内容

- 候选人主信息
- 简历原始文件
- 文本提取/OCR 结果
- 简历结构化解析结果
- 面试记录
- AI 产物及其版本
- 附加文件
- 完整性校验信息

## 3. 目录结构

```text
candidate-{candidateId}-{timestamp}.imr
├── manifest.json
├── checksums.json
├── candidate.json
├── resumes/
│   ├── resume-1.pdf
│   └── resume-2.png
├── parsed/
│   ├── resume-1.extracted.txt
│   ├── resume-1.parsed.json
│   └── resume-2.ocr.txt
├── interviews/
│   ├── interview-round-1.json
│   └── interview-round-2.json
├── artifacts/
│   ├── screening/
│   │   ├── artifact.json
│   │   ├── v1.md
│   │   └── v2.md
│   ├── questions/
│   │   ├── round-1-v1.md
│   │   └── round-2-v1.md
│   └── evaluations/
│       ├── round-1-v1.md
│       └── round-2-v1.md
└── attachments/
    └── extra-note.txt
```

## 4. 核心文件定义

### 4.1 `manifest.json`

用于描述整个包的元信息。

```json
{
  "format": "imr",
  "version": "1.0.0",
  "exportedAt": "2026-03-22T12:00:00Z",
  "sourceApp": "interview-manager",
  "sourceVersion": "0.1.0",
  "candidateId": "cand_001",
  "candidateIdentity": {
    "name": "张三",
    "phone": "13800000000",
    "email": "zhangsan@example.com"
  },
  "contains": {
    "resumes": 2,
    "interviews": 2,
    "artifacts": 5,
    "attachments": 1
  },
  "hashAlgorithm": "sha256",
  "encryption": {
    "enabled": false,
    "method": null
  }
}
```

### 4.2 `checksums.json`

记录包内每个文件的哈希值。

```json
{
  "candidate.json": "sha256:...",
  "resumes/resume-1.pdf": "sha256:...",
  "parsed/resume-1.parsed.json": "sha256:..."
}
```

### 4.3 `candidate.json`

候选人主档案。

```json
{
  "id": "cand_001",
  "source": "hybrid",
  "remoteId": "remote_123",
  "name": "张三",
  "phone": "13800000000",
  "email": "zhangsan@example.com",
  "position": "前端工程师",
  "yearsOfExperience": 5,
  "tags": ["react", "候选池A"],
  "createdAt": "2026-03-20T10:00:00Z",
  "updatedAt": "2026-03-22T11:00:00Z"
}
```

### 4.4 `interviews/*.json`

每轮面试一份 JSON。

```json
{
  "id": "int_001",
  "remoteId": "remote_interview_001",
  "round": 1,
  "status": "completed",
  "scheduledAt": "2026-03-25T14:00:00Z",
  "meetingLink": "https://meeting.example.com/abc",
  "manualEvaluation": {
    "rating": 4,
    "decision": "pass",
    "comments": "基础扎实"
  }
}
```

### 4.5 `artifacts/*`

按产物类型和轮次组织文件。

- 文本渲染文件优先使用 `.md`
- 可选附带 `.pdf`
- 元数据文件使用 `artifact.json`

示例：

```json
{
  "artifactId": "art_001",
  "type": "screening",
  "currentVersion": 2,
  "versions": [1, 2]
}
```

## 5. 导出规则

- 一个 `.imr` 仅包含一个候选人主档案。
- 所有引用文件必须真实存在。
- 导出时必须生成 `manifest.json` 与 `checksums.json`。
- 文件名允许脱敏导出，但包内 `candidate.json` 是否脱敏由用户设置决定。

## 6. 导入规则

### 6.1 校验

导入时必须执行：

- 容器格式校验
- `manifest.json` 存在校验
- 版本兼容校验
- `checksums.json` 校验
- 关键 JSON 文件结构校验

### 6.2 失败条件

以下情况必须拒绝导入：

- 包损坏
- manifest 缺失
- 关键 JSON 非法
- 版本完全不兼容
- 校验和不通过且用户未允许忽略

### 6.3 容错条件

以下情况允许降级导入：

- 未识别的附加字段
- 部分附件缺失但主档案完整
- 非关键产物缺失

## 7. 冲突合并规则

### 7.1 候选人识别顺序

1. 手机号精确匹配
2. 邮箱精确匹配
3. 用户人工选择已有候选人
4. 新建候选人

### 7.2 合并策略

- 候选人基本信息: 默认提示用户确认
- 简历文件: 按哈希去重
- 面试记录: `remoteId` 相同则合并，否则新增
- AI 产物: 全部保留，按版本追加
- 附件: 按哈希去重，不按文件名去重

### 7.3 导入结果

结果状态建议：

- `created`
- `merged`
- `conflict`
- `failed`

## 8. 安全与扩展

- 当前版本默认不强制加密
- 后续可在 `manifest.encryption` 中扩展加密算法
- 后续可扩展签名字段以验证来源客户端

## 9. 与在线共享的关系

- 在线共享先生成临时 `.imr`
- 再通过局域网协议发送该文件
- 接收方按普通 `.imr` 导入流程处理

结论：在线共享与离线导入导出共用一套打包标准。
