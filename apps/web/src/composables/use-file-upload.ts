import { ref } from "vue";

interface UseFileUploadOptions {
  disabled?: boolean | (() => boolean);
  onFilesSelected?: (files: File[]) => void | Promise<void>;
}

function isDisabled(disabled?: boolean | (() => boolean)) {
  if (typeof disabled === "function") return disabled();
  return Boolean(disabled);
}

function toNativeInput(target: unknown): HTMLInputElement | null {
  if (target instanceof HTMLInputElement) return target;

  if (target && typeof target === "object" && "$el" in target) {
    const element = (target as { $el?: unknown }).$el;
    if (element instanceof HTMLInputElement) return element;
  }

  return null;
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const fileInputRef = ref<HTMLInputElement | null>(null);

  function setFileInputRef(target: unknown) {
    fileInputRef.value = toNativeInput(target);
  }

  function triggerFileUpload() {
    if (isDisabled(options.disabled)) return;
    fileInputRef.value?.click();
  }

  async function handleFileChange(event: Event) {
    if (isDisabled(options.disabled)) return;

    const target = event.target as HTMLInputElement | null;
    const files = Array.from(target?.files ?? []);
    if (!files.length) return;

    await options.onFilesSelected?.(files);

    if (target) {
      target.value = "";
    }
  }

  return {
    fileInputRef,
    setFileInputRef,
    triggerFileUpload,
    handleFileChange,
  };
}
