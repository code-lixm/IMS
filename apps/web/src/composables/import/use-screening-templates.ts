import { computed, onMounted, ref } from "vue";
import { api } from "@/api/client";
import { screeningTemplatesApi } from "@/api/screening-templates";
import type { MatchingTemplate, MatchingTemplateListData, CreateMatchingTemplateInput, UpdateMatchingTemplateInput } from "@ims/shared";

const STORAGE_KEY = "ims.screening.selected-template";

interface TemplateState {
  items: MatchingTemplate[];
  selectedId: string | null;
  loading: boolean;
  defaultTemplateId: string | null;
}

const state = ref<TemplateState>({
  items: [],
  selectedId: null,
  loading: false,
  defaultTemplateId: null,
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

      // Update default template ID if any template is marked as default
      const defaultTemplate = data.items.find((t) => t.isDefault);
      if (defaultTemplate) {
        state.value.defaultTemplateId = defaultTemplate.id;
      }

      // Auto-select default template or first available
      if (!state.value.selectedId && data.items.length > 0) {
        const defaultTpl = data.items.find((t) => t.isDefault) ?? data.items[0];
        selectTemplate(defaultTpl.id);
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

  async function loadDefaultTemplate(): Promise<MatchingTemplate | null> {
    // Find the template marked as default in current list first
    const localDefault = state.value.items.find((t) => t.isDefault);
    if (localDefault) {
      return localDefault;
    }

    // Otherwise, fetch from API
    const data = await api<MatchingTemplateListData>("/api/screening/templates");
    const defaultTemplate = data.items.find((t) => t.isDefault) ?? null;
    if (defaultTemplate) {
      state.value.defaultTemplateId = defaultTemplate.id;
    }
    return defaultTemplate;
  }

  async function setAsDefault(templateId: string): Promise<void> {
    const template = await screeningTemplatesApi.setDefault(templateId);

    // Update the template in the list
    const index = state.value.items.findIndex((t) => t.id === templateId);
    if (index !== -1) {
      state.value.items[index] = template;
    }

    // Update default template ID
    state.value.defaultTemplateId = templateId;

    // If this is the selected template, update selection
    if (state.value.selectedId === templateId) {
      // Already selected, do nothing more
    }
  }

  function selectTemplate(id: string) {
    state.value.selectedId = id;
    persistSelected(id);
  }

  async function createTemplate(input: CreateMatchingTemplateInput): Promise<MatchingTemplate> {
    const template = await screeningTemplatesApi.create(input);
    state.value.items.unshift(template);

    // If this is the first template or marked as default, select it
    if (state.value.items.length === 1 || input.isDefault) {
      selectTemplate(template.id);
    }

    // Update default template ID if this is the new default
    if (template.isDefault) {
      state.value.defaultTemplateId = template.id;
    }

    return template;
  }

  async function updateTemplate(id: string, input: UpdateMatchingTemplateInput): Promise<MatchingTemplate> {
    const template = await screeningTemplatesApi.update(id, input);

    const index = state.value.items.findIndex((t) => t.id === id);
    if (index !== -1) {
      state.value.items[index] = template;
    }

    // Update default template ID if this is now the default
    if (template.isDefault) {
      state.value.defaultTemplateId = template.id;
    }

    // If updated template is default, ensure it's selected
    if (template.isDefault) {
      selectTemplate(template.id);
    }

    return template;
  }

  async function deleteTemplate(id: string): Promise<void> {
    await screeningTemplatesApi.remove(id);

    const index = state.value.items.findIndex((t) => t.id === id);
    if (index !== -1) {
      state.value.items.splice(index, 1);
    }

    // If deleted template was default, clear default ID
    if (state.value.defaultTemplateId === id) {
      state.value.defaultTemplateId = null;
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

  const defaultTemplate = computed(() => {
    if (!state.value.defaultTemplateId) {
      return state.value.items.find((t) => t.isDefault) ?? null;
    }
    return state.value.items.find((t) => t.id === state.value.defaultTemplateId) ?? null;
  });

  return {
    templates: computed(() => state.value.items),
    selectedId: computed(() => state.value.selectedId),
    loading: computed(() => state.value.loading),
    defaultTemplate,
    selectedTemplate: () => state.value.items.find((t) => t.id === state.value.selectedId) ?? null,
    fetchTemplates,
    loadDefaultTemplate,
    setAsDefault,
    selectTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}