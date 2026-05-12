import { computed, onMounted, ref } from "vue";
import { api } from "@/api/client";
import { screeningTemplatesApi } from "@/api/screening-templates";
import type {
  CreateMatchingTemplateInput,
  MatchingTemplate,
  MatchingTemplateListData,
  UpdateMatchingTemplateInput,
} from "@ims/shared";

interface BatchScreeningConfig {
  groupId: string | null;
  passThreshold: number;
  reviewThreshold: number;
  learningEnabled: boolean;
}

interface ScreeningTemplateGroup {
  id: string;
  name: string;
  description: string | null;
  passThreshold: number;
  reviewThreshold: number;
  learningEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ScreeningTemplateGroupListItem extends ScreeningTemplateGroup {
  templateCount: number;
  defaultTemplateId: string | null;
}

interface ScreeningTemplateGroupListData {
  items: ScreeningTemplateGroupListItem[];
}

interface ScreeningTemplateGroupDetailData {
  group: ScreeningTemplateGroup;
  templates: MatchingTemplate[];
  defaultTemplate: MatchingTemplate | null;
  links: Array<{ id: string; groupId: string; templateId: string; isDefault: boolean; createdAt: number; updatedAt: number }>;
  batchScreeningConfig: BatchScreeningConfig;
}

const STORAGE_KEY = "ims.screening.selected-template";

interface TemplateState {
  items: MatchingTemplate[];
  selectedId: string | null;
  loading: boolean;
  defaultTemplateId: string | null;
  groups: ScreeningTemplateGroupListData["items"];
  selectedGroupId: string | null;
  groupLoading: boolean;
  selectedGroupBatchScreeningConfig: BatchScreeningConfig | null;
}

const state = ref<TemplateState>({
  items: [],
  selectedId: null,
  loading: false,
  defaultTemplateId: null,
  groups: [],
  selectedGroupId: null,
  groupLoading: false,
  selectedGroupBatchScreeningConfig: null,
});

let hydrated = false;
let hydratedGroup = false;

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

function hydrateGroup() {
  if (hydratedGroup || typeof window === "undefined") {
    return;
  }
  hydratedGroup = true;
  const stored = window.localStorage.getItem("ims.screening.selected-group");
  if (stored) {
    state.value.selectedGroupId = stored;
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

function persistSelectedGroup(id: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (id) {
    window.localStorage.setItem("ims.screening.selected-group", id);
  } else {
    window.localStorage.removeItem("ims.screening.selected-group");
  }
}

export function useScreeningTemplates() {
  hydrate();
  hydrateGroup();

  async function loadGroup(groupId: string): Promise<ScreeningTemplateGroupDetailData | null> {
    state.value.groupLoading = true;
    try {
      const detail = await screeningTemplatesApi.getGroup(groupId);
      state.value.items = detail.templates;
      state.value.defaultTemplateId = detail.defaultTemplate?.id ?? null;
      state.value.selectedGroupBatchScreeningConfig = detail.batchScreeningConfig;

      const nextSelectedId = state.value.selectedId && detail.templates.some((template) => template.id === state.value.selectedId)
        ? state.value.selectedId
        : detail.defaultTemplate?.id ?? detail.templates[0]?.id ?? null;

      if (nextSelectedId !== state.value.selectedId) {
        state.value.selectedId = nextSelectedId;
        persistSelected(nextSelectedId);
      }

      return detail;
    } catch {
      state.value.items = [];
      state.value.defaultTemplateId = null;
      state.value.selectedGroupBatchScreeningConfig = null;
      return null;
    } finally {
      state.value.groupLoading = false;
    }
  }

  async function fetchTemplates(): Promise<void> {
    state.value.loading = true;
    try {
    const [templateData, groupData] = await Promise.all([
        api<MatchingTemplateListData>("/api/screening/templates"),
        screeningTemplatesApi.listGroups(),
      ]);

      state.value.groups = groupData.items;

      const nextGroupId = state.value.selectedGroupId && groupData.items.some((group) => group.id === state.value.selectedGroupId)
        ? state.value.selectedGroupId
        : groupData.items[0]?.id ?? null;

      if (nextGroupId) {
        state.value.selectedGroupId = nextGroupId;
        persistSelectedGroup(nextGroupId);
        await loadGroup(nextGroupId);
      } else {
        state.value.items = templateData.items;
        state.value.defaultTemplateId = templateData.items.find((t) => t.isDefault)?.id ?? null;
      }

      if (!state.value.selectedId && state.value.items.length > 0) {
        const defaultTpl = state.value.items.find((t) => t.isDefault) ?? state.value.items[0];
        selectTemplate(defaultTpl.id);
      } else if (state.value.selectedId) {
        const stillExists = state.value.items.some((t) => t.id === state.value.selectedId);
        if (!stillExists && state.value.items.length > 0) {
          const defaultTpl = state.value.items.find((t) => t.isDefault) ?? state.value.items[0];
          selectTemplate(defaultTpl.id);
        }
      }
    } finally {
      state.value.loading = false;
    }
  }

  async function loadDefaultTemplate(): Promise<MatchingTemplate | null> {
    const localDefault = state.value.items.find((t) => t.isDefault);
    if (localDefault) {
      return localDefault;
    }

    if (state.value.selectedGroupId) {
      const detail = await loadGroup(state.value.selectedGroupId);
      return detail?.defaultTemplate ?? null;
    }

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

  function selectTemplate(id: string | null) {
    state.value.selectedId = id;
    persistSelected(id);
  }

  async function selectGroup(id: string) {
    state.value.selectedGroupId = id;
    persistSelectedGroup(id);
    await loadGroup(id);
  }

  function clearSelection() {
    state.value.selectedId = null;
    persistSelected(null);
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
    groups: computed(() => state.value.groups),
    selectedId: computed(() => state.value.selectedId),
    selectedGroupId: computed(() => state.value.selectedGroupId),
    loading: computed(() => state.value.loading),
    groupLoading: computed(() => state.value.groupLoading),
    defaultTemplate,
    selectedGroup: computed(() => state.value.groups.find((group) => group.id === state.value.selectedGroupId) ?? null),
    selectedGroupBatchScreeningConfig: computed(() => state.value.selectedGroupBatchScreeningConfig),
    selectedTemplate: () => state.value.items.find((t) => t.id === state.value.selectedId) ?? null,
    fetchTemplates,
    loadDefaultTemplate,
    setAsDefault,
    selectTemplate,
    selectGroup,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    clearSelection,
  };
}
