# UI Components — shadcn-vue 组件库

**Package:** @ims/web
**Scope:** `apps/web/src/components/ui/`
**Generated:** 2026-04-20

## OVERVIEW

基于 shadcn-vue 设计系统的可复用 UI 组件集合。底层使用 `reka-ui`（Vue 3 Headless UI）和 `radix-vue` 提供无样式交互逻辑，样式通过 Tailwind CSS 类实现，组件变体由 `class-variance-authority` 管理。

## COMPONENT LIST

### Form Components

| Component | Path | Notes |
|-----------|------|-------|
| Input | `input/Input.vue` | v-model 支持，placeholder/text-muted-foreground 样式 |
| Textarea | `textarea.vue` | 同 Input 风格，支持 rows 属性 |
| Checkbox | `checkbox.vue` | 手写实现，非 Radix，带 check 图标 |
| Select | `select/Select.vue` | 复合组件，reka-ui，index.ts 导出 |
| Slider | `slider.vue` | radix-vue SliderRoot/Track/Range/Thumb |
| Switch | `switch/Switch.vue` | reka-ui |

### Navigation & Command

| Component | Path | Notes |
|-----------|------|-------|
| Tabs | `tabs-trigger.vue`, `tabs-content.vue` | radix-vue |
| Command | `command/Command.vue` | reka-ui ListboxRoot，搜索过滤内置 |
| CommandDialog | `command/CommandDialog.vue` | Command + Dialog 组合 |

### Overlay / Modal / Popover

| Component | Path | Notes |
|-----------|------|-------|
| Dialog | `dialog.vue` | radix-vue，Teleport to body，Transition 动画 |
| Popover | `popover.vue` | radix-vue |
| DropdownMenu | `dropdown-menu.vue` | radix-vue DropdownMenuRoot |
| Tooltip | `tooltip-trigger.vue`, `tooltip-content.vue` | radix-vue |

### Layout & Container

| Component | Path | Notes |
|-----------|------|-------|
| Card | `card/Card.vue` | 复合：Card + CardHeader + CardContent + CardFooter + CardTitle + CardDescription + CardAction |
| Accordion | `accordion/Accordion.vue` | reka-ui，复合子组件 |
| Collapsible | `collapsible/Collapsible.vue` | reka-ui |
| Separator | `separator/Separator.vue` | radix-vue |
| Resizable | `resizable-panel-group.vue`, `resizable-handle.vue` | 面板可调节大小 |
| ScrollArea | `scroll-area/ScrollArea.vue` | reka-ui，带 ScrollBar |

### Data Display

| Component | Path | Notes |
|-----------|------|-------|
| Table | `table.vue` | 原生 `<table>`，需配合 TableCell/TableRow |
| Badge | `badge/Badge.vue` | variants: default/destructive/secondary/outline |
| Avatar | `avatar/Avatar.vue` | Avatar + AvatarImage + AvatarFallback，variants: size/shape |
| Alert | `alert/Alert.vue` | Alert + AlertTitle + AlertDescription，variants: default/destructive |
| Progress | `progress/Progress.vue` | radix-vue |
| Skeleton | `skeleton.vue` | loading 占位 |

### Basic / Primitive

| Component | Path | Notes |
|-----------|------|-------|
| Button | `button/Button.vue` | variants: default/destructive/outline/secondary/ghost/link，sizes: default/sm/lg/icon |
| ButtonGroup | `button-group/ButtonGroup.vue` | Button + Text + Separator 组合 |
| CircularProgress | `circular-progress.vue` | SVG 圆环进度 |

### Compound Component Index Files

每个目录下的 `index.ts` 负责导出组件和 variants：

```
select/index.ts         → Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue, SelectScrollUpButton, SelectScrollDownButton
command/index.ts        → Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut
card/index.ts          → Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription, CardAction
badge/index.ts         → Badge, badgeVariants
alert/index.ts         → Alert, AlertTitle, AlertDescription, alertVariants
button/index.ts        → Button, buttonVariants
avatar/index.ts        → Avatar, AvatarImage, AvatarFallback, avatarVariants
accordion/index.ts     → Accordion, AccordionItem, AccordionContent, AccordionTrigger
collapsible/index.ts  → Collapsible, CollapsibleTrigger, CollapsibleContent
progress/index.ts      → Progress
separator/index.ts     → Separator
switch/index.ts        → Switch
scroll-area/index.ts   → ScrollArea, ScrollBar
resizable/index.ts    → ResizablePanelGroup, ResizableHandle, ResizablePanel
```

## USAGE PATTERNS

### 直接导入（单文件组件）

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
</script>
```

### 复合组件（index.ts barrel）

```vue
<script setup lang="ts">
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
</script>
```

### v-model 双向绑定

Input/Textarea 使用 `modelValue` + `update:modelValue`：

```vue
<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { ref } from 'vue'

const value = ref('')
</script>
<template>
  <Input v-model="value" placeholder="Type something..." />
</template>
```

### Dialog 控制

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const open = ref(false)
</script>
<template>
  <Button @click="open = true">Open</Button>
  <Dialog v-model:open="open">
    <template #content>
      <DialogHeader>
        <DialogTitle>Title</DialogTitle>
        <DialogDescription>Description</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button @click="open = false">Cancel</Button>
        <Button variant="default">Confirm</Button>
      </DialogFooter>
    </template>
  </Dialog>
</template>
```

### Select 下拉选择

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const value = ref('')
</script>
<template>
  <Select v-model="value">
    <SelectTrigger>
      <SelectValue placeholder="Select..." />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectItem value="1">Option 1</SelectItem>
        <SelectItem value="2">Option 2</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
```

### Command 搜索命令面板

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const open = ref(false)
</script>
<template>
  <CommandDialog :open="open" @update:open="open = $event">
    <CommandInput placeholder="Type a command..." />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Actions">
        <CommandItem @select="open = false">Action 1</CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
```

### Card 组合

```vue
<script setup lang="ts">
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
</script>
<template>
  <Card>
    <CardHeader>
      <CardTitle>Title</CardTitle>
      <CardDescription>Description</CardDescription>
    </CardHeader>
    <CardContent>Content</CardContent>
    <CardFooter>Footer</CardFooter>
  </Card>
</template>
```

## FORM COMPONENTS

Form 组件统一使用 `modelValue` prop + `update:modelValue` emit 实现 v-model 兼容。

### Input / Textarea

```vue
<Input v-model="form.email" type="email" placeholder="Email" />
<Textarea v-model="form.bio" rows="4" />
```

### Checkbox

```vue
<Checkbox :checked="agreed" @update:checked="agreed = $event" />
```

### Select

支持 `modelValue` v-model，通过 `SelectValue` slot 显示选中内容：

```vue
<Select v-model="form.status">
  <SelectTrigger class="w-[180px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="active">Active</SelectItem>
    <SelectItem value="inactive">Inactive</SelectItem>
  </SelectContent>
</Select>
```

### Slider

```vue
<Slider v-model="[value]" :min="0" :max="100" step="1" />
```

### Switch

```vue
<Switch v-model="enabled" />
```

## DATA DISPLAY

### Table

配合 TableCell、TableRow 使用：

```vue
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow v-for="item in items" :key="item.id">
      <TableCell>{{ item.name }}</TableCell>
      <TableCell>
        <Badge :variant="item.active ? 'default' : 'secondary'">
          {{ item.active ? 'Active' : 'Inactive' }}
        </Badge>
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Badge Variants

- `default` — 默认样式
- `destructive` — 危险/错误
- `secondary` — 次要
- `outline` — 边框样式

### Avatar

支持 `size`（sm/md/lg）和 `shape`（circle/square）variants：

```vue
<Avatar size="md" shape="circle">
  <AvatarImage src="..." alt="..." />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

### Alert Variants

- `default` — 默认信息
- `destructive` — 危险/警告

### Progress

```vue
<Progress :model-value="75" />
```

## DIALOG / MODAL

Dialog 使用 `open` prop + `update:open` emit 控制开关。通过 named slot `#content` 放置弹窗内部内容，配合 `DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` 组成完整结构。

### 动画

Dialog 自带 Transition 动画：
- **进入** — opacity 0→100 + scale 0.95→1，duration 200ms
- **退出** — opacity 100→0 + scale 1→0.95，duration 150ms
- **遮罩** — opacity 0→100，bg-black/50

### DropdownMenu

```vue
<DropdownMenu v-model:open="open">
  <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem @select="handleAction">Action</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuLabel>Section</DropdownMenuLabel>
  </DropdownMenuContent>
</DropdownMenu>
```

## CONVENTIONS

### 命名

- 文件名 — kebab-case（`dialog-header.vue`）
- 组件名 — PascalCase（`DialogHeader`）
- 目录 — kebab-case（`select/`）

### Props 接口

组件内部定义局部 `Props` 接口，使用 `defineProps<T>()`：

```ts
interface Props {
  class?: HTMLAttributes['class']
  variant?: ButtonVariants['variant']
}
const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})
```

### Emit 定义

```ts
const emit = defineEmits<{
  (e: 'update:modelValue', payload: string): void
  (e: 'update:open', v: boolean): void
}>()
```

### 样式合并

使用 `cn()` utility（`@/lib/utils`）合并 Tailwind 类：

```ts
:class="cn('base-class', condition && 'conditional-class', props.class)"
```

### 变体系统

使用 `class-variance-authority` 在 `index.ts` 中定义 variants：

```ts
// button/index.ts
export const buttonVariants = cva('inline-flex items-center justify-center', {
  variants: {
    variant: { default: '', destructive: '', ghost: '' },
    size: { default: '', sm: '', lg: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})
```

### Headless 库选择

- **reka-ui** — Button, Select, Accordion, Avatar, ScrollArea, Slider, Switch, Command
- **radix-vue** — Dialog, DropdownMenu, Popover, Tabs, Separator, Collapsible, Progress

### 依赖

- `reka-ui` — Vue 3 Headless UI
- `radix-vue` — Radix Vue Primitives
- `tailwindcss` — 样式系统
- `class-variance-authority` — 组件变体
- `@vueuse/core` — `useVModel`, `reactiveOmit`
- `lucide-vue-next` — 图标

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Button 变体 | `button/index.ts` |
| Select 复合组件 | `select/` |
| Command 搜索面板 | `command/` |
| Dialog 结构 | `dialog.vue` + `dialog-*.vue` |
| Card 组合 | `card/` |
| Table 组件 | `table.vue`, `table-cell.vue` |
| DropdownMenu | `dropdown-menu.vue` + `dropdown-menu-*.vue` |
