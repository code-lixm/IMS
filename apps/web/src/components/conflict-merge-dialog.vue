<template>
  <Dialog
    :open="open"
    content-class="max-w-2xl max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="onUpdateOpen"
  >
    <template #content>
      <AppDialogLayout body-class="space-y-4">
        <template #header>
          <DialogHeader>
            <DialogTitle>候选人信息冲突</DialogTitle>
            <DialogDescription>
              检测到本地已存在相同候选人，请逐字段选择保留本地版本或使用导入版本
            </DialogDescription>
          </DialogHeader>
        </template>

        <div class="space-y-4" v-if="conflictData">
          <!-- Candidate identity -->
          <div class="bg-muted/50 rounded-lg px-4 py-3">
            <div class="flex items-center gap-3">
              <Badge variant="outline" class="shrink-0">{{ conflictData.source === "local" ? "本地" : "导入" }}</Badge>
              <span class="font-medium">{{ conflictData.candidateName }}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-1">
              {{ conflictData.phone ? `手机: ${conflictData.phone}` : "" }}
              {{ conflictData.email ? ` · 邮箱: ${conflictData.email}` : "" }}
            </p>
          </div>

          <!-- Conflict list with per-field merge/keep actions -->
          <div class="overflow-hidden rounded-md bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-28">冲突字段</TableHead>
                  <TableHead>本地版本</TableHead>
                  <TableHead>导入版本</TableHead>
                  <TableHead class="w-36 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="field in conflictData.conflicts" :key="field.name">
                  <TableCell class="font-medium">{{ field.label }}</TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span v-if="field.localValue !== undefined" class="text-sm">
                        {{ formatFieldValue(field.name, field.localValue) }}
                      </span>
                      <Badge v-else variant="secondary" class="text-xs">无</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span v-if="field.importValue !== undefined" class="text-sm">
                        {{ formatFieldValue(field.name, field.importValue) }}
                      </span>
                      <Badge v-else variant="secondary" class="text-xs">无</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        :class="{ 'border-blue-500 bg-blue-50 dark:bg-blue-950/30': fieldSelections[field.name] === 'local' }"
                        @click="selectField(field.name, 'local')"
                      >
                        <Check v-if="fieldSelections[field.name] === 'local'" class="mr-0.5 h-3 w-3" />
                        保留
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        class="h-7 px-2 text-xs"
                        :class="{ 'border-green-500 bg-green-50 dark:bg-green-950/30': fieldSelections[field.name] === 'import' }"
                        @click="selectField(field.name, 'import')"
                      >
                        <Check v-if="fieldSelections[field.name] === 'import'" class="mr-0.5 h-3 w-3" />
                        导入
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <!-- Actions hint -->
          <div class="flex items-center gap-4 text-sm text-muted-foreground">
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-blue-500" />
              <span>保留本地</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="h-2 w-2 rounded-full bg-green-500" />
              <span>使用导入</span>
            </div>
            <div class="flex items-center gap-1.5 text-muted-foreground/60">
              <div class="h-2 w-2 rounded-full bg-muted-foreground/30" />
              <span>未选择则保留本地</span>
            </div>
          </div>
        </div>

        <template #footer>
          <Button variant="outline" @click="resolve('local')">
            <Check class="h-4 w-4 mr-1.5" />
            全部保留本地
          </Button>
          <Button variant="outline" @click="emitResolveMerge">
            <GitMerge class="h-4 w-4 mr-1.5" />
            应用选择
          </Button>
          <Button variant="default" @click="resolve('import')">
            <ArrowRight class="h-4 w-4 mr-1.5" />
            全部使用导入版本
          </Button>
        </template>
      </AppDialogLayout>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { ArrowRight, Check, GitMerge } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppDialogLayout, Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table } from "@/components/ui/table";
import { TableBody } from "@/components/ui/table";
import { TableCell } from "@/components/ui/table";
import { TableHead } from "@/components/ui/table";
import { TableHeader } from "@/components/ui/table";
import { TableRow } from "@/components/ui/table";

export interface ConflictField {
  name: string;
  label: string;
  localValue: string | number | null | undefined;
  importValue: string | number | null | undefined;
}

export interface ConflictData {
  candidateName: string;
  source: "local" | "import";
  phone: string | null;
  email: string | null;
  conflicts: ConflictField[];
}

export interface FieldSelection {
  [fieldName: string]: "local" | "import";
}

const props = defineProps<{
  open: boolean;
  conflictData: ConflictData | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "resolve", strategy: "local" | "import"): void;
  (e: "resolve-merge", selections: FieldSelection): void;
}>();

const fieldSelections = reactive<FieldSelection>({});

// Reset selections when conflictData changes
watch(
  () => props.conflictData,
  (data) => {
    for (const key of Object.keys(fieldSelections)) {
      delete fieldSelections[key];
    }
    if (data) {
      data.conflicts.forEach((field) => {
        fieldSelections[field.name] = "local";
      });
    }
  },
  { immediate: true },
);

function onUpdateOpen(value: boolean) {
  emit("update:open", value);
}

function formatFieldValue(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "无";
  if (name === "tags" && Array.isArray(value)) return (value as string[]).join(", ");
  if (name === "yearsOfExperience") return `${value} 年`;
  return String(value);
}

function resolve(strategy: "local" | "import") {
  emit("resolve", strategy);
  emit("update:open", false);
}

function selectField(name: string, strategy: "local" | "import") {
  fieldSelections[name] = strategy;
}

function emitResolveMerge() {
  emit("resolve-merge", { ...fieldSelections });
  emit("update:open", false);
}
</script>
