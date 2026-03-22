# 导入流水线规范 v0.1

- 状态: Draft
- 目标: 支持批量导入 `zip/pdf/图片`，并形成可观察、可重试、可恢复的本地处理流程

## 1. 设计目标

- 本地优先，不阻塞 UI
- 文件级失败不拖垮整个批次
- 支持 OCR、解析、候选人归并、搜索建索引
- 产出明确任务状态与进度

## 2. 流水线分层

### 2.1 批次级任务 `ImportBatch`

表示一次用户导入动作。

字段建议：

- `id`
- `status`
- `sourceType`
- `totalFiles`
- `processedFiles`
- `successFiles`
- `failedFiles`
- `currentStage`
- `createdAt`
- `startedAt`
- `completedAt`

### 2.2 文件级任务 `ImportFileTask`

表示单个文件的处理状态。

字段建议：

- `id`
- `batchId`
- `originalPath`
- `normalizedPath`
- `fileType`
- `status`
- `stage`
- `errorCode`
- `errorMessage`
- `candidateId`
- `resultJson`

## 3. 支持格式

### 3.1 首版支持

- `zip`
- `pdf`
- `png`
- `jpg`
- `jpeg`
- `webp`

### 3.2 后续可扩展

- `doc`
- `docx`

## 4. 状态机

### 4.1 批次状态

- `queued`
- `preparing`
- `extracting`
- `classifying`
- `processing`
- `indexing`
- `completed`
- `partial_success`
- `failed`
- `cancelled`

### 4.2 文件状态

- `queued`
- `extracting`
- `text_extracting`
- `ocr_running`
- `parsing`
- `matching_candidate`
- `saving`
- `done`
- `failed`
- `skipped`

## 5. 处理流程

```text
创建批次
→ 扫描输入
→ 若文件为 ZIP 则解压
→ 分类与过滤
→ PDF 文本提取 / 图片 OCR
→ 结构化解析
→ 候选人归并或新建
→ 保存文件与结构化结果
→ 更新搜索索引
→ 完成或进入 AI 初筛队列
```

## 6. 详细阶段规则

### 6.1 `preparing`

- 接收文件路径列表
- 计算批次数量
- 创建批次记录
- 校验路径是否可访问

### 6.2 `extracting`

- 对 ZIP 文件解压到临时工作目录
- 允许递归展开，但需要 `maxDepth` 限制
- 跳过隐藏文件、系统文件、明显无关文件

建议默认：

- `maxDepth = 3`
- `maxEntriesPerArchive = 500`

### 6.3 `classifying`

- 根据扩展名与 MIME 分类
- 白名单之外文件标记为 `skipped`
- 记录跳过原因

### 6.4 `text_extracting`

#### PDF

- 首先尝试直接提取文本
- 若文本长度低于阈值，如 `< 200` 字符，则切入 OCR fallback

#### 图片

- 直接进入 OCR

### 6.5 `ocr_running`

- 对图片或扫描版 PDF 执行 OCR
- 建议记录页级进度
- 保存 OCR 结果文本

### 6.6 `parsing`

解析目标：

- 姓名
- 手机号
- 邮箱
- 岗位倾向
- 工作年限
- 技能关键词
- 教育经历
- 工作经历
- 项目经历

规则：

- 结构化解析失败不等于整个文件失败
- 至少保留原始提取文本

### 6.7 `matching_candidate`

归并顺序：

1. 手机号精确匹配
2. 邮箱精确匹配
3. 无命中则新建候选人

弱匹配（例如姓名 + 岗位）只提示，不自动合并。

### 6.8 `saving`

- 保存原始文件
- 保存提取文本
- 保存解析结果
- 关联候选人与简历
- 更新候选人摘要字段

### 6.9 `indexing`

- 将提取全文写入 FTS 索引
- 刷新候选人搜索摘要

## 7. 并发策略

### 7.1 建议并发

- 文本提取/OCR: `2 ~ 4`
- 结构化解析: `2 ~ 4`
- AI 初筛: `1 ~ 2`
- 导出与共享: 单任务串行

### 7.2 原则

- 不要让大批量 OCR 抢占全部资源
- 并发数可配置
- UI 始终显示当前活动任务

## 8. 取消、重试、恢复

### 8.1 取消

- 批次取消后，不再启动新的文件任务
- 正在执行的任务尽量软中断
- 已完成结果保留

### 8.2 重试

- 支持文件级重试
- 支持批次级“只重试失败项”

### 8.3 恢复

- 应用重启后保留任务状态
- 默认不自动续跑
- 用户点击“恢复”后继续处理

## 9. 错误码建议

- `IMPORT_FILE_NOT_FOUND`
- `IMPORT_UNSUPPORTED_TYPE`
- `IMPORT_ARCHIVE_TOO_DEEP`
- `IMPORT_ARCHIVE_TOO_LARGE`
- `IMPORT_TEXT_EXTRACT_FAILED`
- `IMPORT_OCR_FAILED`
- `IMPORT_PARSE_FAILED`
- `IMPORT_SAVE_FAILED`
- `IMPORT_INDEX_FAILED`

## 10. UI 展示要求

### 10.1 批次卡片

- 总文件数
- 成功数
- 失败数
- 当前阶段
- 总体百分比
- 当前文件名

### 10.2 文件明细

- 文件名
- 文件类型
- 当前阶段
- 状态
- 失败原因
- 重试按钮

## 11. 与 AI 初筛的衔接

- 导入流水线完成后可以自动或手动进入 AI 初筛队列
- AI 初筛不是导入成功的前置条件
- 候选人档案应在导入成功后即可进入主列表

## 12. 数据落库原则

- 原始文件与提取文本分离存储
- 结构化解析结果单独存 JSON
- 候选人与简历是一对多关系
- 批次、文件任务、候选人关系可追踪
