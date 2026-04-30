<template>
  <section
    v-if="currentWorkflow"
    :class="cn('flex h-full min-h-0 flex-col gap-3', props.class)"
  >
    <header class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm font-semibold">阶段产物</p>
        <Badge variant="outline" class="shrink-0">{{
          currentWorkflow.currentStage
        }}</Badge>
      </div>

      <div class="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="font-medium text-muted-foreground">当前</span>
          <Badge variant="secondary">{{ stageLabel(currentWorkflow.currentStage) }}</Badge>
          <template v-if="currentWorkflow.recommendedNextStage">
            <span class="text-muted-foreground">→</span>
            <span class="font-medium text-muted-foreground">下一步</span>
            <Badge variant="secondary">{{ stageLabel(currentWorkflow.recommendedNextStage) }}</Badge>
          </template>
        </div>
        <p
          v-if="currentWorkflow.recommendedAction"
          class="mt-2 text-sm leading-6 text-foreground/90"
        >
          {{ currentWorkflow.recommendedAction }}
        </p>
      </div>
    </header>

    <div
      v-if="currentWorkflow.artifacts.length === 0"
      class="rounded-lg border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground"
    >
      当前还没有阶段文档，完成一次阶段性输出后会自动保存到这里。
    </div>

    <div v-else class="min-h-0 flex-1 overflow-y-auto pr-1">
      <div class="space-y-2">
        <article
          v-for="artifact in currentWorkflow.artifacts"
          :key="artifact.id"
          class="rounded-xl border border-border/60 bg-card/80 px-3 py-3 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1 space-y-1.5">
              <div class="flex min-w-0 items-center gap-2">
                <Badge variant="secondary" class="shrink-0">{{
                  compactStageLabel(artifact.stage)
                }}</Badge>
                <span class="truncate text-sm font-medium">{{
                  artifact.title
                }}</span>
              </div>
              <p class="truncate text-xs text-muted-foreground">
                {{ artifact.fileName }}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="h-8 w-8 rounded-md border-border/60 bg-background text-foreground hover:bg-accent"
                title="预览"
                @click="openPreview(artifact)"
              >
                <Eye class="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="更多操作"
                  >
                    <MoreHorizontal class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-36">
                  <DropdownMenuItem @click="copyArtifact(artifact)">
                    <Copy class="h-4 w-4" />
                    <span>复制</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="downloadArtifact(artifact)">
                    <Download class="h-4 w-4" />
                    <span>下载</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </article>
      </div>
    </div>

    <Dialog
      :open="previewOpen"
      content-class="max-w-4xl p-5"
      @update:open="onPreviewOpenChange"
    >
      <template #content>
        <DialogHeader v-if="previewArtifact">
          <DialogTitle class="truncate pr-8 text-sm font-semibold">{{
            previewArtifact.fileName
          }}</DialogTitle>
          <DialogDescription>
            {{ stageLabel(previewArtifact.stage) }} · Markdown 文档
          </DialogDescription>
        </DialogHeader>

        <ScrollArea
          v-if="previewArtifactContent"
          class="h-[60vh] rounded-md border bg-muted/30"
        >
          <Markdown
            :content="previewArtifactContent"
            mode="static"
            class="size-full p-4 [&>*:first-child]:mt-0! [&>*:last-child]:mb-0!"
          />
        </ScrollArea>

        <DialogFooter v-if="previewArtifact">
          <Button
            type="button"
            variant="outline"
            @click="copyArtifact(previewArtifact)"
          >
            <Copy class="h-4 w-4" />
            复制内容
          </Button>
          <Button
            type="button"
            variant="outline"
            @click="downloadArtifact(previewArtifact)"
          >
            <Download class="h-4 w-4" />
            下载文件
          </Button>
        </DialogFooter>
      </template>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Download, Eye, MoreHorizontal } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";
import type { FileResource, Workflow, WorkflowArtifact } from "@/stores/lui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { stripDisplayOnlyFrontmatter } from "@/lib/markdown-display";

const props = defineProps<{
  workflow: Workflow | null;
  files: FileResource[];
  class?: string;
}>();

const currentWorkflow = computed(() => props.workflow);

const previewOpen = ref(false);
const previewArtifact = ref<WorkflowArtifact | null>(null);
const { notifyError, notifySuccess } = useAppNotifications();

const fileLookup = computed(
  () => new Map(props.files.map((file) => [file.id, file])),
);
const previewArtifactContent = computed(() => {
  if (!previewArtifact.value?.fileResourceId) {
    return "";
  }
  return (
    stripDisplayOnlyFrontmatter(
      fileLookup.value.get(previewArtifact.value.fileResourceId)?.content ?? "",
    )
  );
});

function stageLabel(stage: Workflow["currentStage"]) {
  switch (stage) {
    case "S0":
      return "S0 · 初筛";
    case "S1":
      return "S1 · 出题";
    case "S2":
      return "S2 · 面试环节";
    default:
      return "已完成";
  }
}

function compactStageLabel(stage: Workflow["currentStage"]) {
  switch (stage) {
    case "S0":
      return "S0";
    case "S1":
      return "S1";
    case "S2":
      return "S2";
    default:
      return "完成";
  }
}

function openPreview(artifact: WorkflowArtifact) {
  previewArtifact.value = artifact;
  previewOpen.value = true;
}

function onPreviewOpenChange(value: boolean) {
  previewOpen.value = value;
  if (!value) {
    previewArtifact.value = null;
  }
}

async function copyArtifact(artifact: WorkflowArtifact) {
  const content = artifact.fileResourceId
    ? stripDisplayOnlyFrontmatter(
        fileLookup.value.get(artifact.fileResourceId)?.content ?? "",
      )
    : "";
  if (!content) {
    return;
  }

  const copied = await copyTextToClipboard(content);
  if (!copied) {
    notifyError(new Error("当前环境不支持复制到剪贴板"), {
      title: "复制失败",
      fallbackMessage: "请下载文件后手动复制内容",
    });
    return;
  }

  notifySuccess("已复制内容");
}

function downloadArtifact(artifact: WorkflowArtifact) {
  const content = artifact.fileResourceId
    ? (fileLookup.value.get(artifact.fileResourceId)?.content ?? "")
    : "";
  if (!content) {
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = artifact.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
</script>
