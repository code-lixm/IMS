import { computed, ref } from "vue";
import { importApi } from "@/api/import";
import { shareApi } from "@/api/share";
import { useImportPreferences } from "@/composables/import/use-import-preferences";
import { pickFiles, type PickedFile } from "@/composables/use-file-picker";
import type { ShareImportResult } from "@ims/shared";

const IMPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.zip,.imr";

interface PendingConflict {
  candidateId: string;
  dialogData: ConflictData;
}

interface ConflictFieldData {
  name: string;
  label: string;
  localValue: string | number | null | undefined;
  importValue: string | number | null | undefined;
}

interface ConflictData {
  candidateName: string;
  source: "local" | "import";
  phone: string | null;
  email: string | null;
  conflicts: ConflictFieldData[];
}

interface ConflictDialogState {
  open: boolean;
  data: ConflictData | null;
}

interface UseImportFileSelectionOptions {
  onImportFinished?: () => Promise<void> | void;
}

function isImrFile(file: PickedFile) {
  return file.name.toLowerCase().endsWith(".imr");
}

function toPendingConflict(result: ShareImportResult): PendingConflict | null {
  if (result.result !== "conflict" || !result.candidateId) {
    return null;
  }

  return {
    candidateId: result.candidateId,
    dialogData: {
      candidateName: result.candidateName ?? "",
      source: "import",
      phone: result.phone ?? null,
      email: result.email ?? null,
      conflicts: (result.conflicts ?? []).map((conflict) => ({
        name: conflict.name,
        label: conflict.label,
        localValue: conflict.localValue,
        importValue: conflict.importValue,
      })),
    },
  };
}

export function useImportFileSelection(options: UseImportFileSelectionOptions = {}) {
  const isImporting = ref(false);
  const conflictQueue = ref<PendingConflict[]>([]);
  const activeConflict = ref<PendingConflict | null>(null);
  const { autoScreen } = useImportPreferences();

  const conflictDialog = computed<ConflictDialogState>(() => ({
    open: activeConflict.value !== null,
    data: activeConflict.value?.dialogData ?? null,
  }));

  function shiftNextConflict() {
    activeConflict.value = conflictQueue.value.shift() ?? null;
  }

  function resetConflictState() {
    conflictQueue.value = [];
    activeConflict.value = null;
  }

  async function importImrFiles(files: PickedFile[]) {
    const conflicts: PendingConflict[] = [];

    for (const file of files) {
      const result = await shareApi.import(file.path);
      const conflict = toPendingConflict(result);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    if (conflicts.length > 0) {
      conflictQueue.value = [...conflictQueue.value, ...conflicts];
      if (!activeConflict.value) {
        shiftNextConflict();
      }
    }
  }

  async function triggerImport(importOptions?: { autoScreen?: boolean }) {
    const files = await pickFiles({ accept: IMPORT_ACCEPT, multiple: true });
    if (!files.length) {
      return;
    }

    resetConflictState();

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
    } finally {
      isImporting.value = false;
      await options.onImportFinished?.();
    }
  }

  async function resolveConflict(strategy: "local" | "import") {
    const currentConflict = activeConflict.value;
    if (!currentConflict) {
      return;
    }

    await shareApi.resolve(currentConflict.candidateId, strategy);
    shiftNextConflict();
    await options.onImportFinished?.();
  }

  function setConflictDialogOpen(open: boolean) {
    if (open) {
      if (!activeConflict.value) {
        shiftNextConflict();
      }
      return;
    }

    resetConflictState();
  }

  return {
    isImporting,
    conflictDialog,
    triggerImport,
    resolveConflict,
    setConflictDialogOpen,
  };
}
