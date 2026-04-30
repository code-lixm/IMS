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
import type { WhatsNewData, WhatsNewEntry } from "@ims/shared";
import whatsNew from "@/assets/whats-new.json";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const whatsNewData = computed<WhatsNewData>(() => whatsNew as WhatsNewData);
const versions = computed<WhatsNewEntry[]>(() => {
  const entries = whatsNewData.value.versions?.length
    ? whatsNewData.value.versions
    : [{
      version: whatsNewData.value.version,
      date: whatsNewData.value.date,
      sections: whatsNewData.value.sections,
    }];
  return entries;
});
const latestEntry = computed<WhatsNewEntry>(() => versions.value[0]);

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
        class="w-[760px] max-w-[92vw] max-h-[76vh] flex flex-col"
      >
        <DialogHeader class="shrink-0 border-b pb-5">
          <DialogTitle class="text-2xl font-semibold tracking-tight">
            更新日志
          </DialogTitle>
          <DialogDescription>
            <span class="inline-flex flex-wrap items-center gap-2 text-sm">
              <span>最新版本</span>
              <span class="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                v{{ latestEntry.version }}
              </span>
              <span class="text-muted-foreground">{{ latestEntry.date }}</span>
              <span class="text-muted-foreground">·</span>
              <span class="text-muted-foreground">共 {{ versions.length }} 个版本</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div class="min-h-0 flex-1 overflow-y-auto pr-3 pt-5">
          <div class="relative space-y-8 pl-7 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border/70">
            <article
              v-for="(versionEntry, versionIndex) in versions"
              :key="versionEntry.version"
              class="relative"
            >
              <span
                :class="[
                  'absolute -left-[1.75rem] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background',
                  versionIndex === 0 ? 'bg-primary' : 'bg-muted-foreground/40',
                ]"
              />
              <header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-lg font-semibold tracking-tight text-foreground">
                  v{{ versionEntry.version }}
                </span>
                <span class="text-xs text-muted-foreground">{{ versionEntry.date }}</span>
                <span
                  v-if="versionIndex === 0"
                  class="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  最新
                </span>
              </header>

              <div class="space-y-4">
                <section
                  v-for="(section, sIndex) in versionEntry.sections"
                  :key="`${versionEntry.version}-${section.title}`"
                  class="pl-0"
                >
                  <h3 class="mb-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground">
                    {{ section.title }}
                  </h3>
                  <ul class="space-y-1">
                    <li
                      v-for="(item, iIndex) in section.items"
                      :key="`${versionEntry.version}-${sIndex}-${iIndex}`"
                      class="relative pl-4 text-sm leading-6 text-muted-foreground before:absolute before:left-0 before:text-muted-foreground/50 before:content-['•']"
                      v-html="renderMarkdown(item)"
                    />
                  </ul>
                </section>
              </div>
            </article>
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
