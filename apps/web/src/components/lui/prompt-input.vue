<template>
  <div class="rounded-xl border border-border bg-background p-2 shadow-sm">
    <div v-if="pickedFiles.length" class="mb-2 flex flex-wrap gap-2">
      <div
        v-for="(file, index) in pickedFiles"
        :key="`${file.name}-${index}`"
        class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
      >
        <Paperclip class="h-3.5 w-3.5" />
        <span class="max-w-44 truncate">{{ file.name }}</span>
        <button
          type="button"
          class="inline-flex h-4 w-4 items-center justify-center rounded-sm hover:bg-background"
          :disabled="disabled"
          @click="removePickedFile(index)"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>

    <div class="relative">
      <DropdownMenu :open="slashMenuOpen" @update:open="onSlashMenuOpenChange">
        <DropdownMenuTrigger as-child>
          <button type="button" class="pointer-events-none absolute h-0 w-0 opacity-0" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" class="mb-2 w-64">
          <DropdownMenuItem
            v-for="command in filteredCommands"
            :key="command.value"
            @select.prevent="selectSlashCommand(command.value)"
          >
            <span class="font-medium">{{ command.value }}</span>
            <span class="ml-2 text-xs text-muted-foreground">{{ command.label }}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled class="text-xs text-muted-foreground">
            输入命令后按 Enter 发送
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <textarea
        ref="textareaRef"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        rows="1"
        class="max-h-52 min-h-[40px] w-full resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        @input="onInput"
        @keydown="onKeydown"
      />
    </div>

    <div class="mt-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          :disabled="disabled"
          class="h-8 w-8"
          @click="triggerFileUpload"
        >
          <Plus class="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        size="icon"
        :disabled="disabled || !canSend"
        class="h-8 w-8"
        @click="sendMessage"
      >
        <Send class="h-4 w-4" />
      </Button>
    </div>

    <Input
      :ref="setFileInputRef"
      type="file"
      class="hidden"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Paperclip, Plus, Send, X } from "lucide-vue-next";
import { useFileUpload } from "@/composables/use-file-upload";
import Button from "@/components/ui/button.vue";
import DropdownMenu from "@/components/ui/dropdown-menu.vue";
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue";
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue";
import DropdownMenuSeparator from "@/components/ui/dropdown-menu-separator.vue";
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue";
import Input from "@/components/ui/input.vue";

interface SlashCommand {
  value: string;
  label: string;
}

interface PromptInputProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  onFileUpload?: (files: File[]) => void | Promise<void>;
}

const props = withDefaults(defineProps<PromptInputProps>(), {
  modelValue: "",
  placeholder: "输入消息，输入 / 使用命令",
  disabled: false,
  accept: ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr",
  multiple: true,
  onFileUpload: undefined,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "send", value: string): void;
  (e: "select-command", value: string): void;
}>();

const slashCommands: SlashCommand[] = [
  { value: "/search", label: "搜索候选人" },
  { value: "/import", label: "导入文件" },
  { value: "/help", label: "获取帮助" },
];

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const slashMenuOpen = ref(false);
const pickedFiles = ref<File[]>([]);

const commandKeyword = computed(() => {
  const value = props.modelValue.trim();
  if (!value.startsWith("/")) return "";
  return value.toLowerCase();
});

const filteredCommands = computed(() => {
  if (!commandKeyword.value) return slashCommands;
  return slashCommands.filter((command) => command.value.startsWith(commandKeyword.value));
});

const canSend = computed(() => props.modelValue.trim().length > 0);

const { setFileInputRef, triggerFileUpload, handleFileChange } = useFileUpload({
  disabled: () => props.disabled,
  onFilesSelected: async (files) => {
    pickedFiles.value = files;
    await props.onFileUpload?.(files);
  },
});

watch(
  () => props.modelValue,
  async (value) => {
    slashMenuOpen.value = value.trim().startsWith("/") && filteredCommands.value.length > 0;
    await nextTick();
    resizeTextarea();
  },
  { immediate: true },
);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      slashMenuOpen.value = false;
    }
  },
);

function resizeTextarea() {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = "auto";
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 208)}px`;
}

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value;
  emit("update:modelValue", value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  sendMessage();
}

function sendMessage() {
  if (props.disabled) return;

  const value = props.modelValue.trim();
  if (!value) return;

  emit("send", value);
}

function selectSlashCommand(command: string) {
  emit("update:modelValue", `${command} `);
  emit("select-command", command);
  slashMenuOpen.value = false;

  nextTick(() => {
    textareaRef.value?.focus();
    resizeTextarea();
  });
}

function removePickedFile(index: number) {
  pickedFiles.value.splice(index, 1);
}

function onSlashMenuOpenChange(value: boolean) {
  slashMenuOpen.value = value;
}
</script>
