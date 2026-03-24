<template>
  <section class="flex h-full min-h-0 flex-col gap-3">
    <header class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">文件资源</h3>
      <Badge variant="secondary">{{ totalCount }} 个文件</Badge>
    </header>

    <div
      v-if="totalCount === 0"
      class="flex h-36 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
    >
      暂无文件资源
    </div>

    <ScrollArea v-else class="h-[28rem] pr-3">
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
                  <p class="truncate text-sm font-medium">{{ file.name }}</p>
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

    <Dialog :open="previewOpen" @update:open="onPreviewOpenChange">
      <template #default>
        <div
          v-if="previewOpen && previewFile"
          class="fixed left-1/2 top-1/2 z-50 flex w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold">{{ previewFile.name }}</p>
              <div class="mt-1 flex items-center gap-2">
                <Badge variant="outline">{{ typeLabel(previewFile.type) }}</Badge>
                <Badge v-if="previewFile.language" variant="secondary">{{ previewFile.language }}</Badge>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              @click="previewOpen = false"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea class="h-[60vh] rounded-md border bg-muted/30">
            <div v-if="isMarkdownFile(previewFile)" class="p-4">
              <div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderMarkdown(previewFile.content)" />
            </div>
            <pre v-else class="whitespace-pre-wrap break-all p-4 text-xs leading-5"><code>{{ previewFile.content }}</code></pre>
          </ScrollArea>

          <div class="flex justify-end">
            <Button type="button" variant="outline" @click="downloadFile(previewFile)">
              <Download class="h-4 w-4" />
              下载文件
            </Button>
          </div>
        </div>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { storeToRefs } from "pinia"
import { marked } from "marked"
import DOMPurify from "dompurify"
import {
  Download,
  Eye,
  FileCode,
  FileText,
  Trash2,
  X,
} from "lucide-vue-next"
import Badge from "@/components/ui/badge.vue"
import Button from "@/components/ui/button.vue"
import Dialog from "@/components/ui/dialog.vue"
import ScrollArea from "@/components/ui/scroll-area.vue"
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

function renderMarkdown(content: string): string {
  const rawHtml = marked.parse(content, { async: false }) as string
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } })
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
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
</script>
