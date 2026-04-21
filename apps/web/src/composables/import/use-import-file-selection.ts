import { ref } from "vue";
import { importApi } from "@/api/import";
import { shareApi } from "@/api/share";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { pickFiles, type PickedFile } from "@/composables/use-file-picker";

const IMPORT_ACCEPT = ".pdf,.zip,.rar,.tar,.7z,.tgz,.tar.gz,.tar.bz2,.tbz2,.tar.xz,.txz,.imr";

interface UseImportFileSelectionOptions {
  onImportFinished?: () => Promise<void> | void;
}

function isImrFile(file: PickedFile) {
  return file.name.toLowerCase().endsWith(".imr");
}

export function useImportFileSelection(options: UseImportFileSelectionOptions = {}) {
  const isImporting = ref(false);
  const { autoScreen } = useImportPreferences();
  const { notifyError } = useAppNotifications();

  async function importImrFiles(files: PickedFile[]) {
    for (const file of files) {
      const result = await shareApi.import(file.path);
      if (result.result === "failed") {
        throw new Error(result.error ?? `导入 ${file.name} 失败`);
      }
    }
  }

  async function triggerImport(importOptions?: { autoScreen?: boolean }) {
    const files = await pickFiles({ accept: IMPORT_ACCEPT, multiple: true });
    if (!files.length) {
      return;
    }

    const regularFiles = files.filter((file) => !isImrFile(file));
    const imrFiles = files.filter(isImrFile);

    isImporting.value = true;
    try {
      if (regularFiles.length > 0) {
        await importApi.upload(regularFiles.map((file) => file.file), importOptions?.autoScreen ?? autoScreen.value);
      }

      if (imrFiles.length > 0) {
        await importImrFiles(imrFiles);
      }
    } catch (error) {
      notifyError(error, {
        title: "导入失败",
        fallbackMessage: "导入失败，请查看具体错误信息",
      });
    } finally {
      isImporting.value = false;
      await options.onImportFinished?.();
    }
  }

  return {
    isImporting,
    triggerImport,
  };
}
