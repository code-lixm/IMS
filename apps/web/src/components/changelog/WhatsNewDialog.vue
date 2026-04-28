<script setup lang="ts">
import { computed } from "vue";
import { ExternalLink } from "lucide-vue-next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { WhatsNewEntry } from "@ims/shared";
import whatsNew from "@/assets/whats-new.json";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const entry = computed<WhatsNewEntry>(() => whatsNew as WhatsNewEntry);

function handleUpdateOpen(open: boolean) {
  if (!open) {
    emit("close");
  }
}

function handleClose() {
  emit("close");
}

/**
 * Simple Markdown subset renderer.
 * Supports:
 *   **bold** → <strong>
 *   [text](url) → <a>
 */
function renderMarkdown(text: string): string {
  // Step 1: Strip all HTML tags first (security + spec compliance)
  // Only allow tags we generate ourselves: <strong> and <a>
  let html = text
    // Escape any raw HTML tags that might exist in the source
    .replace(/<(?!\/?\b(strong|a)\b)[^>]+>/gi, "")
    // Step 2: Convert Markdown subset to HTML
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-primary hover:text-primary/80">$1</a>');
  return html;
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleUpdateOpen">
    <template #content>
      <DialogContent
        class="w-[600px] max-w-[90vw] max-h-[70vh] flex flex-col"
      >
        <DialogHeader class="shrink-0">
          <DialogTitle>🎉 新版本发布</DialogTitle>
          <DialogDescription>
            <span class="inline-flex items-center gap-2">
              <span class="font-medium text-foreground">v{{ entry.version }}</span>
              <span class="text-muted-foreground">·</span>
              <span class="text-muted-foreground">{{ entry.date }}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div class="overflow-y-auto flex-1 min-h-0 pr-1">
          <div
            v-for="(section, sIndex) in entry.sections"
            :key="section.title"
            class="mb-5 last:mb-0"
          >
            <h3
              class="text-sm font-semibold text-foreground mb-2 sticky top-0 bg-background py-1"
            >
              {{ section.title }}
            </h3>
            <ul class="space-y-1.5">
              <li
                v-for="(item, iIndex) in section.items"
                :key="`${sIndex}-${iIndex}`"
                class="text-sm text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground/60"
                v-html="renderMarkdown(item)"
              />
            </ul>
            <Separator
              v-if="sIndex < entry.sections.length - 1"
              class="mt-4"
            />
          </div>
        </div>

        <DialogFooter class="shrink-0 gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            class="gap-1.5"
            as="a"
            href="https://github.com/code-lixm/IMS/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink class="h-3.5 w-3.5" />
            查看完整更新日志
          </Button>
          <Button size="sm" @click="handleClose">
            知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </template>
  </Dialog>
</template>
