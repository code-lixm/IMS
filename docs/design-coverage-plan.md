# design.pen 覆盖矩阵与补稿计划

范围：`design.pen` 中除 `j7KldU`（`shadcn: design system components`）外的全部顶层画板。目标是让 Vue 实现以设计稿为准；现有功能如果没有设计稿覆盖，则补充设计稿。

## 覆盖矩阵

| ID | 设计稿画板 | 对应 Vue 页面/组件 | 状态 | 说明 |
|---|---|---|---|---|
| `yygfH` | 面试记录 / 产品列表规范 | `apps/web/src/views/InterviewsView.vue`, `apps/web/src/components/interviews/*` | 部分已建，需继续精修 | 已创建 `/interviews` 页面和基础列表组件，需继续按完整画板补齐状态面板/详情入口。 |
| `EefHX` | 状态筛选 Tab / 产品列表规范 | `apps/web/src/components/interviews/interview-filter-bar.vue` | 需精修 | 当前有分段筛选，需对齐独立规范的选中/禁用/计数态。 |
| `hC7lT` | 空状态与错误态 / 产品列表规范 | `apps/web/src/components/ui/empty-state/EmptyState.vue`, `apps/web/src/components/interviews/*` | 需重写/补状态 | 需覆盖列表空态、搜索空态、错误重试态。 |
| `u56jF` | 列表项状态 / 产品列表规范 | `apps/web/src/components/interviews/interview-list-row.vue`, `apps/web/src/components/candidates/candidate-list.vue` | 需精修 | 需统一发布、待确认、草稿、异常、重复冲突行态。 |
| `KVOBO` | 用户菜单 / Centered Device Cascade 中文规范 | `apps/web/src/components/app-user-actions.vue` | 第一批已调整 | 已改成玻璃菜单、分区菜单和蓝色主操作，还需和设置页菜单态统一。 |
| `KW1yl` | 简历导入与初筛工作台 / 中文规范 | `apps/web/src/views/ImportView.vue` | 待重写 | Import 主工作台需按设计稿重排上传、初筛、任务状态和候选卡片。 |
| `YIf6l` | 简历详情弹窗 / 中文规范 | `apps/web/src/views/CandidateDetailView.vue`, `apps/web/src/components/import/ai-screening-detail-dialog.vue` | 待映射确认 | 需要确认当前简历详情由哪个弹窗/详情区域承载。 |
| `rG7dQ` | 面试记录详情侧栏 / 产品列表规范 | `apps/web/src/views/CandidateDetailView.vue`, `apps/web/src/components/interviews/*` | 待新增/改造 | 当前没有明确侧栏组件，建议新增到 `components/interviews/`。 |
| `lMHVd` | 录音整理工作台 / 中文规范 | `apps/web/src/components/recorder/recorder-panel.vue`, `apps/web/src/components/recorder/recorder-header-button.vue`, `apps/web/src/stores/recorder.ts` | 待重写 | 需要按录音整理工作台画板重写面板布局和状态。 |
| `L6fW3` | 设置与用户菜单 / Centered Device Cascade | `apps/web/src/views/SettingsView.vue`, `apps/web/src/components/app-user-actions.vue` | 待重写 | 设置页和用户菜单需要同一视觉系统。 |
| `OegMN` | 候选人详情页 / 中文规范 | `apps/web/src/views/CandidateDetailView.vue` | 待重写 | 候选人详情整体布局需以画板为准。 |
| `B6ZMC` | 面试安排表单 / 中文规范 | `apps/web/src/components/import/interview-import-form.vue`, `apps/web/src/components/import/interview-round-editor.vue`, 可能新增面试安排表单组件 | 待确认 | 当前表单偏历史面试导入，需确认是否复用或新增。 |
| `yfcOv` | 评估报告页面 / 中文规范 | `apps/web/src/components/lui/interview-score-upload-dialog.vue`, `apps/web/src/views/CandidateDetailView.vue` | 待确认 | 当前评估相关在上传弹窗和详情页中分散。 |
| `gSthE` | 筛选模板管理 / 中文规范 | `apps/web/src/views/ScreeningTemplatesView.vue`, `apps/web/src/views/ScreeningTemplateGroupsView.vue` | 待重写 | 需按模板管理画板统一列表、搜索、操作区。 |
| `rkidt` | 通知中心 / 中文规范 | `apps/web/src/components/app-notification-center.vue`, `apps/web/src/composables/use-app-notifications.ts` | 待重写 | 需补通知中心面板，不只是 toast。 |
| `Wtkna` | 导入历史 / 中文规范 | `apps/web/src/views/ImportView.vue`, import 相关组件 | 待重写 | 需抽出导入历史列表/状态详情。 |
| `uZx9U` | 筛选模板编辑态 / 中文规范 | `apps/web/src/components/import/template-form-dialog.vue` | 待重写 | 模板编辑弹窗需按画板重写字段布局。 |
| `rsRzQ` | 导入批次详情抽屉 / 中文规范 | `apps/web/src/views/ImportView.vue`, import 相关抽屉/详情组件 | 待新增/确认 | 当前未确认独立抽屉组件。 |
| `LX9xd` | 候选人列表 / 批量操作态 | `apps/web/src/components/candidates/candidate-list.vue`, `apps/web/src/views/CandidatesView.vue` | 第一批已调整 | 批量工具栏已改浅蓝态，列表行还需继续精修。 |
| `z0viKz` | 重新导入确认弹窗 / 危险操作规范 | `apps/web/src/components/candidates/candidate-page-header.vue` | 部分已有 | 当前已有危险确认弹窗，需按画板重写视觉和文案层级。 |
| `yZyEo` | AI 初筛详情 / 改分历史与模板证据态 | `apps/web/src/components/import/ai-screening-detail-dialog.vue` | 待重写 | 需补改分历史、模板证据和解释区。 |
| `GZCGt` | AI 初筛详情 / 未筛选运行中错误态 | `apps/web/src/components/import/ai-screening-detail-dialog.vue` | 待重写 | 需补未筛选、运行中、错误三类状态。 |
| `DHmb4` | 设置 / AI Gateway 配置弹窗 | `apps/web/src/components/lui/gateway-endpoint-dialog.vue`, `apps/web/src/views/SettingsView.vue` | 待重写 | 需按设置弹窗画板重写。 |
| `U9qEX` | 设置 / Agent 编辑弹窗 | `apps/web/src/views/SettingsView.vue`, LUI/agent 相关组件 | 待确认 | 需定位 Agent 编辑弹窗实现后重写。 |
| `HfdPA` | 模板组编辑弹窗 / 中文规范 | `apps/web/src/components/import/template-group-form-dialog.vue` | 待重写 | 需按模板组编辑态重写。 |
| `ze6lv` | 冲突合并弹窗 / 字段对比态 | `apps/web/src/components/conflict-merge-dialog.vue` | 待重写 | 需按字段对比双列态重写。 |
| `M1pa1p` | 通知 Toast 四种语气规范 | `apps/web/src/components/app-notification-center.vue`, `apps/web/src/composables/use-app-notifications.ts` | 待重写 | 需覆盖 success/error/info/warning 四态。 |
| `YI9S5` | CandidatesView / 同步与分享完整态 | `apps/web/src/views/CandidatesView.vue`, `apps/web/src/components/candidates/device-select-dialog.vue`, `apps/web/src/components/candidates/candidate-page-header.vue` | 第一批部分调整 | 同步状态、分享设备选择仍需按画板精修。 |
| `gl1si` | CandidateDetailView / 简历文档版与面试记录态 | `apps/web/src/views/CandidateDetailView.vue` | 待重写 | 需覆盖简历文档版和面试记录态。 |
| `b3fHjG` | ImportView / 阈值调整与模板重跑弹窗 | `apps/web/src/views/ImportView.vue`, import 相关组件 | 待确认/重写 | 需定位阈值调整与模板重跑实现。 |
| `fYKRg` | SettingsView / 端点测试与 Agent 状态 | `apps/web/src/views/SettingsView.vue` | 待重写 | 需按端点测试和 Agent 状态画板补齐。 |
| `GDUET` | LUIView / 主工作台与关键状态 | `apps/web/src/views/LUIView.vue`, `apps/web/src/components/lui/*` | 待重写 | LUI 主工作台是大组件，需单独批次处理。 |
| `JEu2c` | ImportView / 导出报告弹窗 | `apps/web/src/components/import/export-screening-dialog.vue` | 待重写 | 需按导出报告弹窗画板重写。 |
| `J4yPkO` | ImportView / 历史面试导入结果摘要 | `apps/web/src/components/import/interview-import-result-summary.vue` | 待重写 | 需按结果摘要画板重写。 |
| `xWZSS` | 交付导航 / Candidates 模块 | 文档/导航辅助，可能对应 `CandidatesView` 入口说明 | 待确认 | 可能是设计交付说明，不一定直接进入产品 UI。 |
| `KGZ2y` | 交付导航 / Import 模块 | 文档/导航辅助，可能对应 `ImportView` 入口说明 | 待确认 | 可能是设计交付说明，不一定直接进入产品 UI。 |
| `GM6DC` | 交付导航 / LUI 模块 | 文档/导航辅助，可能对应 `LUIView` 入口说明 | 待确认 | 可能是设计交付说明，不一定直接进入产品 UI。 |
| `FZzJh` | 交付导航 / Settings 模块 | 文档/导航辅助，可能对应 `SettingsView` 入口说明 | 待确认 | 可能是设计交付说明，不一定直接进入产品 UI。 |
| `tQx3N` | 组件状态规范 / 补充板 | 多个业务组件状态 | 待补齐 | 用于承载现有功能缺失的补充设计状态。 |

## 分批顺序

1. 全局壳与核心列表：Candidates、Interviews、用户菜单、批量操作、同步/分享状态。
2. Import 与 AI 初筛：ImportView、导入历史、批次详情、AI 初筛详情、导出报告、历史面试导入摘要。
3. CandidateDetail 与面试：候选人详情、简历详情、面试详情侧栏、面试安排表单、评估报告。
4. Settings / LUI / Recorder：设置页、Gateway、Agent、LUI 主工作台、录音整理工作台。
5. 系统状态与弹窗：通知中心、Toast、冲突合并、模板管理、模板编辑、模板组编辑、空/错态和补充状态板。

## 设计稿缺口候选

以下功能已在代码中出现，但目前需要进一步确认是否有明确顶层画板覆盖；若没有，应补充到 `tQx3N` 或新增业务画板：

| 功能/组件 | 路径 | 补稿建议 |
|---|---|---|
| 登录页 | `apps/web/src/views/LoginView.vue` | 新增 `LoginView / 登录态与异常态`。 |
| 404/500 错误页 | `apps/web/src/views/NotFoundView.vue`, `apps/web/src/views/ServerErrorView.vue` | 新增 `系统错误页 / 404 与 500`。 |
| What's New 弹窗 | `apps/web/src/components/changelog/WhatsNewDialog.vue` | 新增 `版本更新弹窗 / 中文规范`。 |
| 新手引导 | `apps/web/src/components/onboarding-tour-host.vue` | 新增 `新手引导 / 浮层与步骤态`。 |
| 设备选择分享弹窗 | `apps/web/src/components/candidates/device-select-dialog.vue` | 可并入 `YI9S5`，若状态不足则新增补充态。 |
| AI Elements 低层组件 | `apps/web/src/components/ai-elements/**` | 如作为 LUI 子状态出现，可补入 `GDUET` 或 `tQx3N`，不单独补低层 primitives。 |

## 每批验收

每批完成后执行：LSP diagnostics 覆盖修改文件、`git diff --check`、必要的页面手动打开验证。全量 `pnpm --filter @ims/web typecheck` 目前存在既有阻塞：`apps/web/src/components/import/interview-import-form.vue:148` 的 `candidateId` 未使用。

## 文档校验记录

- 覆盖矩阵设计行数：39。
- 顶层设计 ID 去重：通过。
- 排除项校验：`j7KldU` 未进入覆盖矩阵。
- 当前用途：作为代码还原批次计划与后续设计稿补稿清单的基线文档。
