import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import type { FileResource } from "./types";

interface LuiFileModuleOptions {
  selectedId: Ref<string | null>;
  fileResources: Ref<Record<string, FileResource[]>>;
  error: Ref<string | null>;
}

export interface LuiFileModule {
  currentFiles: ComputedRef<FileResource[]>;
  addFileResource: (conversationId: string, file: File) => Promise<FileResource>;
  removeFileResource: (conversationId: string, fileId: string) => Promise<void>;
}

export function createLuiFileModule(options: LuiFileModuleOptions): LuiFileModule {
  const { selectedId, fileResources, error } = options;
  const { notifyError } = useAppNotifications();

  const currentFiles = computed(() =>
    selectedId.value ? fileResources.value[selectedId.value] ?? [] : []
  );

  async function addFileResource(conversationId: string, file: File) {
    try {
      const result = await luiApi.uploadFile(conversationId, file);
      const nextFile: FileResource = {
        id: result.id,
        name: result.name,
        type: result.type,
        content: result.content,
        size: result.size,
        createdAt: new Date(),
      };

      if (!fileResources.value[conversationId]) {
        fileResources.value[conversationId] = [];
      }

      fileResources.value[conversationId] = [...fileResources.value[conversationId], nextFile];
      return nextFile;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to upload file";
      notifyError(reportAppError("lui/upload-file", err, {
        title: "上传文件失败",
        fallbackMessage: "暂时无法上传文件",
      }));
      throw err;
    }
  }

  async function removeFileResource(conversationId: string, fileId: string) {
    try {
      await luiApi.deleteFile(fileId);
      fileResources.value[conversationId] = (fileResources.value[conversationId] ?? []).filter(
        (file) => file.id !== fileId
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete file";
      notifyError(reportAppError("lui/delete-file", err, {
        title: "删除文件失败",
        fallbackMessage: "暂时无法删除文件",
      }));
      throw err;
    }
  }

  return {
    currentFiles,
    addFileResource,
    removeFileResource,
  };
}
