<template>
  <Dialog
    :open="open"
    content-class="max-w-md"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="space-y-4 p-1">
        <DialogHeader>
          <DialogTitle>导出 AI 初筛结果</DialogTitle>
          <DialogDescription>
            选择要导出的字段，勾选完成后点击「导出 Excel」将下载文件。
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 py-2">
          <p class="text-sm font-medium text-muted-foreground">选择导出字段</p>
          <div class="space-y-2">
            <label v-for="field in fields" :key="field.key" class="flex items-center gap-2.5 cursor-pointer hover:opacity-80">
              <input
                type="checkbox"
                :checked="field.checked"
                class="h-4 w-4 rounded border-primary text-primary accent-primary cursor-pointer"
                @change="field.checked = ($event.target as HTMLInputElement).checked"
              />
              <span class="text-sm">{{ field.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="exportError" class="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
          {{ exportError }}
        </div>

        <DialogFooter>
          <Button variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button :disabled="exporting || !hasCheckedFields" @click="handleExport">
            <Download v-if="!exporting" class="h-4 w-4 mr-2" />
            <Loader2 v-else class="h-4 w-4 mr-2 animate-spin" />
            {{ exporting ? "导出中..." : "导出 Excel" }}
          </Button>
        </DialogFooter>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Download, Loader2 } from "lucide-vue-next";
import { importApi } from "@/api/import";
import Button from "@/components/ui/button.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";

const props = defineProps<{
  open: boolean;
  batchId?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const fields = ref([
  { key: "name", label: "姓名", checked: true },
  { key: "position", label: "岗位", checked: true },
  { key: "yearsOfExperience", label: "工作年限", checked: true },
  { key: "phone", label: "电话", checked: true },
  { key: "email", label: "邮箱", checked: true },
  { key: "skills", label: "技能", checked: true },
  { key: "education", label: "学历", checked: true },
  { key: "workHistory", label: "工作经历", checked: true },
  { key: "verdict", label: "AI 结论", checked: true },
  { key: "label", label: "结论标签", checked: true },
  { key: "score", label: "分数", checked: true },
  { key: "summary", label: "综合评价", checked: true },
  { key: "strengths", label: "优点", checked: true },
  { key: "concerns", label: "顾虑", checked: true },
  { key: "recommendedAction", label: "建议操作", checked: true },
  { key: "screeningSource", label: "初筛来源", checked: true },
  { key: "originalPath", label: "原始文件", checked: false },
  { key: "batchId", label: "批次ID", checked: false },
]);

const hasCheckedFields = computed(() => fields.value.some((f) => f.checked));
const exporting = ref(false);
const exportError = ref<string | null>(null);

async function handleExport() {
  exporting.value = true;
  exportError.value = null;
  try {
    const { blob, fileName } = await importApi.exportResults(props.batchId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    emit("update:open", false);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "导出失败，请重试";
  } finally {
    exporting.value = false;
  }
}
</script>
