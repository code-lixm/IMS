<template>
  <section class="flex h-full min-h-0 flex-col gap-3">
    <header class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">文件资源</h3>
      <Badge variant="outline" class="h-8 rounded-sm gap-1.5 border-border/60 bg-background px-2.5 text-xs font-medium leading-none shadow-none">
        <FileText class="h-3.5 w-3.5" />
        {{ totalCount }} 个文件
      </Badge>
    </header>

    <div
      v-if="totalCount === 0"
      class="flex flex-1 items-start justify-start rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground"
    >
      <div class="space-y-1">
        <p class="font-medium text-foreground/80">暂无文件资源</p>
        <p class="text-xs leading-5 text-muted-foreground">当会话自动同步简历或手动上传文件后，这里会显示对应文件。</p>
      </div>
    </div>

    <ScrollArea v-else class="min-h-0 flex-1 pr-3">
      <div class="space-y-4">
        <section
          v-for="group in groupedResources"
          :key="group.type"
          class="space-y-2"
        >
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {{ group.label }}
            </h4>
            <Badge variant="outline">{{ group.files.length }}</Badge>
          </div>

          <div class="space-y-2">
            <article
              v-for="file in group.files"
              :key="file.id"
              class="flex items-center justify-between gap-2 rounded-md border p-3"
            >
              <div class="min-w-0 flex items-center gap-2">
                <component
                  :is="file.type === 'code' ? FileCode : FileText"
                  class="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ displayFileName(file.name) }}</p>
                  <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ formatDate(file.createdAt) }}</span>
                    <Badge v-if="file.language" variant="secondary">{{ file.language }}</Badge>
                  </div>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  title="预览"
                  @click="openPreview(file)"
                >
                  <Eye class="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  title="下载"
                  @click="downloadFile(file)"
                >
                  <Download class="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive"
                  title="删除"
                  @click="removeFile(file.id)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </ScrollArea>

    <Dialog
      :open="previewOpen"
      content-class="max-w-5xl p-5"
      @update:open="onPreviewOpenChange"
    >
      <template #content>
        <DialogHeader v-if="previewFile">
          <DialogTitle class="truncate pr-8 text-sm font-semibold">
            {{ displayFileName(previewFile.name) }}
          </DialogTitle>
          <DialogDescription class="flex items-center gap-2 pt-1">
            <Badge variant="outline">{{ typeLabel(previewFile.type) }}</Badge>
            <Badge v-if="previewFile.language" variant="secondary">{{ previewFile.language }}</Badge>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea v-if="previewFile" class="h-[60vh] rounded-md border bg-muted/30">
          <div v-if="isMarkdownFile(previewFile)" class="p-4">
            <div class="prose prose-sm max-w-none dark:prose-invert" v-html="renderMarkdown(previewFile.content)" />
          </div>
          <pre v-else class="whitespace-pre-wrap break-all p-4 text-xs leading-5"><code>{{ previewFile.content }}</code></pre>
        </ScrollArea>

        <DialogFooter v-if="previewFile">
          <Button type="button" variant="outline" @click="downloadFile(previewFile)">
            <Download class="h-4 w-4" />
            下载文件
          </Button>
        </DialogFooter>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { storeToRefs } from "pinia"
import {
  Download,
  Eye,
  FileCode,
  FileText,
  Trash2,
} from "lucide-vue-next"
import Badge from "@/components/ui/badge.vue"
import Button from "@/components/ui/button.vue"
import Dialog from "@/components/ui/dialog.vue"
import DialogDescription from "@/components/ui/dialog-description.vue"
import DialogFooter from "@/components/ui/dialog-footer.vue"
import DialogHeader from "@/components/ui/dialog-header.vue"
import DialogTitle from "@/components/ui/dialog-title.vue"
import ScrollArea from "@/components/ui/scroll-area.vue"
import { renderSafeMarkdown } from "@/lib/render/render-safe-markdown"
import { useLuiStore, type FileResource } from "@/stores/lui"

type FileResourceType = FileResource["type"]

const TYPE_LABELS: Record<FileResourceType, string> = {
  code: "代码",
  document: "文档",
  image: "图片",
}

const GROUP_ORDER: FileResourceType[] = ["code", "document", "image"]

const luiStore = useLuiStore()
const { currentFiles } = storeToRefs(luiStore)

const previewOpen = ref(false)
const previewFile = ref<FileResource | null>(null)
const renderMarkdown = renderSafeMarkdown

const totalCount = computed(() => currentFiles.value.length)

const groupedResources = computed(() => {
  return GROUP_ORDER.map((type) => {
    const files = currentFiles.value
      .filter((file) => file.type === type)
      .sort((left, right) => {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })

    return {
      type,
      label: TYPE_LABELS[type],
      files,
    }
  }).filter((group) => group.files.length > 0)
})

function typeLabel(type: FileResourceType) {
  return TYPE_LABELS[type]
}

function formatDate(value: Date) {
  const date = new Date(value)
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function isMarkdownFile(file: FileResource): boolean {
  return file.name.toLowerCase().endsWith(".md") || 
         file.name.toLowerCase().endsWith(".markdown") ||
         file.language === "markdown"
}

function displayFileName(name: string): string {
  try {
    return decodeURIComponent(name).replace(/\+/g, " ")
  }
  catch {
    return name
  }
}

function openPreview(file: FileResource) {
  previewFile.value = file
  previewOpen.value = true
}

function onPreviewOpenChange(value: boolean) {
  previewOpen.value = value
  if (!value) {
    previewFile.value = null
  }
}

async function removeFile(id: string) {
  if (!luiStore.selectedId) return
  await luiStore.removeFileResource(luiStore.selectedId, id)
  if (previewFile.value && previewFile.value.id === id) {
    previewFile.value = null
    previewOpen.value = false
  }
}

function resolveMimeType(file: FileResource): string {
  if (file.type === "image") return "image/*"
  if (file.type === "document") return "text/markdown;charset=utf-8"
  if (file.language === "typescript") return "text/typescript;charset=utf-8"
  if (file.language === "javascript") return "text/javascript;charset=utf-8"
  if (file.language === "json") return "application/json;charset=utf-8"
  return "text/plain;charset=utf-8"
}

function downloadFile(file: FileResource) {
  const blob = new Blob([file.content], { type: resolveMimeType(file) })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = displayFileName(file.name)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
</script>
