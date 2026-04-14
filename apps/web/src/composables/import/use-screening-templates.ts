import { computed, onMounted, ref } from "vue";
import { api } from "@/api/client";
import type { MatchingTemplate, MatchingTemplateListData, CreateMatchingTemplateInput, UpdateMatchingTemplateInput } from "@ims/shared";

const STORAGE_KEY = "ims.screening.selected-template";

interface TemplateState {
  items: MatchingTemplate[];
  selectedId: string | null;
  loading: boolean;
}

const state = ref<TemplateState>({
  items: [],
  selectedId: null,
  loading: false,
});

let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  hydrated = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    state.value.selectedId = stored;
  }
}

function persistSelected(id: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (id) {
    window.localStorage.setItem(STORAGE_KEY, id);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function useScreeningTemplates() {
  hydrate();

  async function fetchTemplates(): Promise<void> {
    state.value.loading = true;
    try {
      const data = await api<MatchingTemplateListData>("/api/screening/templates");
      state.value.items = data.items;

      // Auto-select default template or first available
      if (!state.value.selectedId && data.items.length > 0) {
        const defaultTemplate = data.items.find((t) => t.isDefault) ?? data.items[0];
        selectTemplate(defaultTemplate.id);
      } else if (state.value.selectedId) {
        // Verify selected template still exists
        const stillExists = data.items.some((t) => t.id === state.value.selectedId);
        if (!stillExists && data.items.length > 0) {
          selectTemplate(data.items[0].id);
        }
      }
    } finally {
      state.value.loading = false;
    }
  }

  function selectTemplate(id: string) {
    state.value.selectedId = id;
    persistSelected(id);
  }

  async function createTemplate(input: CreateMatchingTemplateInput): Promise<MatchingTemplate> {
    const template = await api<MatchingTemplate>("/api/screening/templates", {
      method: "POST",
      json: input,
    });
    state.value.items.unshift(template);

    // If this is the first template or marked as default, select it
    if (state.value.items.length === 1 || input.isDefault) {
      selectTemplate(template.id);
    }

    return template;
  }

  async function updateTemplate(id: string, input: UpdateMatchingTemplateInput): Promise<MatchingTemplate> {
    const template = await api<MatchingTemplate>(`/api/screening/templates/${id}`, {
      method: "PUT",
      json: input,
    });

    const index = state.value.items.findIndex((t) => t.id === id);
    if (index !== -1) {
      state.value.items[index] = template;
    }

    // If updated template is default, ensure it's selected
    if (template.isDefault) {
      selectTemplate(template.id);
    }

    return template;
  }

  async function deleteTemplate(id: string): Promise<void> {
    await api<{ id: string; deleted: boolean }>(`/api/screening/templates/${id}`, {
      method: "DELETE",
    });

    const index = state.value.items.findIndex((t) => t.id === id);
    if (index !== -1) {
      state.value.items.splice(index, 1);
    }

    // If deleted template was selected, select another
    if (state.value.selectedId === id) {
      if (state.value.items.length > 0) {
        const defaultTemplate = state.value.items.find((t) => t.isDefault) ?? state.value.items[0];
        selectTemplate(defaultTemplate.id);
      } else {
        state.value.selectedId = null;
        persistSelected(null);
      }
    }
  }

  onMounted(() => {
    fetchTemplates();
  });

  return {
    templates: computed(() => state.value.items),
    selectedId: computed(() => state.value.selectedId),
    loading: computed(() => state.value.loading),
    selectedTemplate: () => state.value.items.find((t) => t.id === state.value.selectedId) ?? null,
    fetchTemplates,
    selectTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
