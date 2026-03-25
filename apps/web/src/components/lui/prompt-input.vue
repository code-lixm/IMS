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

    <div class="flex items-center gap-1">
      <!-- Agent Selector -->
      <Button
        type="button"
        size="sm"
        variant="ghost"
        :disabled="disabled"
        class="h-7 text-xs text-muted-foreground"
        @click="toggleAgentMenu"
      >
        <Bot class="mr-1 h-3.5 w-3.5" />
        {{ selectedAgentId ? 'Agent' : 'Agent' }}
      </Button>

      <!-- Model Selector -->
      <Button
        type="button"
        size="sm"
        variant="ghost"
        :disabled="disabled"
        class="h-7 text-xs text-muted-foreground"
        @click="toggleModelMenu"
      >
        <span class="mr-1">⌘</span>
        {{ selectedAgentId ? 'Model' : 'Model' }}
      </Button>

      <!-- Temperature -->
      <Button
        type="button"
        size="icon"
        variant="ghost"
        :disabled="disabled"
        class="h-7 w-7 text-muted-foreground"
        title="Temperature"
      >
        <Thermometer class="h-3.5 w-3.5" />
      </Button>

      <!-- File Upload -->
      <Button
        type="button"
        size="icon"
        variant="ghost"
        :disabled="disabled"
        class="h-7 w-7 text-muted-foreground"
        @click="triggerFileUpload"
      >
        <Plus class="h-3.5 w-3.5" />
      </Button>

      <!-- Textarea -->
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

      <!-- Send Button -->
      <Button
        type="button"
        size="icon"
        :disabled="disabled || !canSend"
        class="h-8 w-8 shrink-0"
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
import { Bot, Paperclip, Plus, Send, Thermometer, X } from "lucide-vue-next";
import { useFileUpload } from "@/composables/use-file-upload";
import Button from "@/components/ui/button.vue";
import Input from "@/components/ui/input.vue";

interface PromptInputProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  selectedAgentId?: string | null;
  authorizedProviders?: string[];
  temperature?: number;
}

const props = withDefaults(defineProps<PromptInputProps>(), {
  modelValue: "",
  placeholder: "输入消息，输入 / 使用命令",
  disabled: false,
  accept: ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr",
  multiple: true,
  selectedAgentId: null,
  authorizedProviders: () => [],
  temperature: 0.7,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "send", value: string): void;
  (e: "select-command", value: string): void;
  (e: "file-upload", files: File[]): void;
  (e: "select-agent", agentId: string | null): void;
  (e: "authorize", provider: string): void;
  (e: "update:temperature", value: number): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const pickedFiles = ref<File[]>([]);

const canSend = computed(() => props.modelValue.trim().length > 0);

const { setFileInputRef, triggerFileUpload, handleFileChange } = useFileUpload({
  disabled: () => props.disabled,
  onFilesSelected: async (files) => {
    pickedFiles.value = files;
    emit("file-upload", files);
  },
});

watch(
  () => props.modelValue,
  async () => {
    await nextTick();
    resizeTextarea();
  },
  { immediate: true },
);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      pickedFiles.value = [];
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

function removePickedFile(index: number) {
  pickedFiles.value.splice(index, 1);
}

function toggleAgentMenu() {
  emit("select-agent", null);
}

function toggleModelMenu() {
  emit("authorize", "");
}
</script>
