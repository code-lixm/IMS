# UI Components — shadcn-vue 组件库

**Scope:** `apps/web/src/components/ui/`

## OVERVIEW

基于 shadcn-vue 设计系统的可复用 UI 组件集合。使用 Radix Vue 作为底层，Tailwind CSS 进行样式定制。

## STRUCTURE

```
components/ui/
├── pagination/         # 分页组件（复合组件）
│   ├── Pagination.vue
│   ├── PaginationContent.vue
│   ├── PaginationItem.vue
│   ├── PaginationNext.vue
│   ├── PaginationPrevious.vue
│   └── PaginationEllipsis.vue
├── alert.vue           # 警告提示
├── alert-description.vue
├── alert-title.vue
├── badge.vue           # 徽章
├── button.vue          # 按钮（主要交互）
├── card.vue            # 卡片容器
├── dialog.vue          # 对话框
├── dialog-close.vue
├── dialog-description.vue
├── dialog-footer.vue
├── dialog-header.vue
├── dialog-title.vue
├── dropdown-menu-content.vue
├── dropdown-menu-group.vue
├── dropdown-menu-item.vue
├── dropdown-menu-label.vue
├── dropdown-menu-separator.vue
├── popover.vue         # 气泡卡片
├── popover-content.vue
├── popover-trigger.vue
├── progress.vue        # 进度条
├── slider.vue          # 滑块
├── tabs.vue            # 标签页
├── tabs-list.vue
└── ...                 # 其他基础组件
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 分页组件 | `pagination/` | 复合组件，需组合使用 |
| 对话框 | `dialog*.vue` | 包含完整对话框结构 |
| 下拉菜单 | `dropdown-menu-*.vue` | Radix Dropdown Menu |
| 按钮 | `button.vue` | 主要交互组件 |

## CONVENTIONS (THIS DIRECTORY)

- **单文件组件** — 每个组件独立 `.vue` 文件
- **命名规范** — kebab-case（`dialog-header.vue` 而非 `DialogHeader.vue`）
- **复合组件模式** — 复杂组件（pagination, dialog）拆分为多个子组件
- **Radix Vue 基础** — 底层使用 Radix Vue 提供 headless UI 逻辑
- **Tailwind 样式** — 所有样式通过 Tailwind CSS 类实现
- **无 Props 验证类型导入** — 组件内部定义 Props 接口

## ANTI-PATTERNS

- **避免直接修改样式** — 使用 Tailwind 类或 CSS 变量
- **不要跳过 Radix 封装** — 底层交互逻辑应通过 Radix Vue 实现

## DEPENDENCIES

- `radix-vue` — Headless UI 组件基础
- `tailwindcss` — 样式系统
- `class-variance-authority` — 组件变体管理（通常在 button 等组件中使用）

## USAGE EXAMPLE

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
</script>
```

## NOTES

- 组件通过 `unplugin-vue-components` 自动导入，无需手动 import
- 组件设计遵循 shadcn-vue 风格指南
- 表单相关组件可能依赖 `vee-validate` 或类似库
