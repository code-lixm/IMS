<template>
  <Dialog :open="open" @update:open="onUpdateOpen">
    <template #default>
      <div class="fixed left-1/2 top-1/2 z-50 grid w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg max-h-[85vh] overflow-hidden flex flex-col">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">候选人信息冲突</h2>
          <Button variant="ghost" size="icon" class="h-8 w-8" @click="emit('update:open', false)">
            <X class="h-4 w-4" />
          </Button>
        </div>
        <p class="text-sm text-muted-foreground">
          检测到本地已存在相同候选人，请选择如何处理
        </p>

        <div class="flex-1 overflow-y-auto space-y-4 py-2" v-if="conflictData">
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

          <!-- Conflict list -->
          <div class="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-28">冲突字段</TableHead>
                  <TableHead>本地版本</TableHead>
                  <TableHead>导入版本</TableHead>
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
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="outline" @click="resolve('local')">
            <Check class="h-4 w-4 mr-1.5" />
            保留本地
          </Button>
          <Button variant="default" @click="resolve('import')">
            <ArrowRight class="h-4 w-4 mr-1.5" />
            使用导入版本
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ArrowRight, Check, X } from "lucide-vue-next";
import Button from "@/components/ui/button.vue";
import Badge from "@/components/ui/badge.vue";
import Dialog from "@/components/ui/dialog.vue";
import Table from "@/components/ui/table.vue";
import TableBody from "@/components/ui/table-body.vue";
import TableCell from "@/components/ui/table-cell.vue";
import TableHead from "@/components/ui/table-head.vue";
import TableHeader from "@/components/ui/table-header.vue";
import TableRow from "@/components/ui/table-row.vue";

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

defineProps<{
  open: boolean;
  conflictData: ConflictData | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "resolve", strategy: "local" | "import"): void;
}>();

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
</script>
