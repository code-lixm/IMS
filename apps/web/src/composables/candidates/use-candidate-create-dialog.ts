import { ref } from "vue";
import { useCandidatesStore } from "@/stores/candidates";
import { createEmptyCandidateForm } from "./types";

export function useCandidateCreateDialog(store: ReturnType<typeof useCandidatesStore>) {
  const open = ref(false);
  const isSubmitting = ref(false);
  const form = ref(createEmptyCandidateForm());

  function reset() {
    form.value = createEmptyCandidateForm();
  }

  function setOpen(nextOpen: boolean) {
    open.value = nextOpen;
    if (!nextOpen) {
      reset();
    }
  }

  async function submit() {
    if (!form.value.name.trim() || isSubmitting.value) {
      return false;
    }

    isSubmitting.value = true;
    try {
      await store.create(form.value);
      setOpen(false);
      return true;
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    open,
    form,
    isSubmitting,
    setOpen,
    submit,
  };
}
