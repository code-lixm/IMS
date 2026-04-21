<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <template #content>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="gateway-endpoint-provider">模型厂商</Label>
          <select
            id="gateway-endpoint-provider"
            v-model="providerId"
            class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            :disabled="saving || disableProviderSelection"
          >
            <option value="" disabled>请选择模型厂商</option>
            <option
              v-for="provider in presetProviders"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select>
          <p class="text-xs text-muted-foreground">
            {{ selectedPresetProvider ? `Base URL: ${selectedPresetProvider.baseURL}` : "请选择一个提供商" }}
          </p>
        </div>

        <div class="space-y-2">
          <Label for="gateway-endpoint-apikey">API Key</Label>
          <div class="flex gap-2">
            <Input
              id="gateway-endpoint-apikey"
              v-model="apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="请输入 API Key"
              :disabled="saving"
              class="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              class="shrink-0"
              :disabled="saving"
              @click="showApiKey = !showApiKey"
            >
              <Eye v-if="!showApiKey" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            留空则使用凭证管理中的 API Key
          </p>
        </div>

        <div class="space-y-2" v-if="availableModelOptions.length > 0">
          <Label for="gateway-endpoint-model">默认模型（可选）</Label>
          <select
            id="gateway-endpoint-model"
            v-model="selectedModelKey"
            class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            :disabled="saving"
          >
            <option value="">不指定（按全局默认）</option>
            <option
              v-for="option in availableModelOptions"
              :key="modelOptionKey(option)"
              :value="modelOptionKey(option)"
            >
              {{ option.label }}
            </option>
          </select>
          <p class="text-xs text-muted-foreground">
            选定模型厂商后，仅展示该厂商下的可用模型。
          </p>
          <p class="text-xs text-muted-foreground" v-if="providerId.trim()">
            当前厂商已加载 {{ availableModelOptions.length }} 个模型。
          </p>
          <p v-if="loadingProviderModels" class="text-xs text-muted-foreground">
            正在拉取该厂商可用模型...
          </p>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button
          v-if="showTestButton"
          type="button"
          variant="outline"
          :disabled="saving || testing"
          @click="emitTest"
        >
          <Loader2 v-if="testing" class="mr-1.5 h-4 w-4 animate-spin" />
          测试连接
        </Button>
        <Button
          type="button"
          variant="outline"
          :disabled="saving || testing"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          type="button"
          :disabled="saveButtonDisabled"
          @click="emitSave"
        >
          <Loader2 v-if="saving" class="mr-1.5 h-4 w-4 animate-spin" />
          {{ saveButtonText }}
        </Button>
      </DialogFooter>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Eye, EyeOff, Loader2 } from "lucide-vue-next";
import Button from "@/components/ui/button.vue";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import Input from "@/components/ui/input.vue";
import Label from "@/components/ui/label.vue";
import { luiApi } from "@/api/lui";

interface PresetProviderOption {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

interface ModelOption {
  id: string;
  providerId: string;
  label: string;
}

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description: string;
  presetProviders: PresetProviderOption[];
  modelOptions?: ModelOption[];
  initialProviderId?: string;
  initialApiKey?: string;
  initialModelId?: string;
  saving?: boolean;
  testing?: boolean;
  disableProviderSelection?: boolean;
  showTestButton?: boolean;
  saveButtonText?: string;
}>(), {
  initialProviderId: "",
  initialApiKey: "",
  initialModelId: "",
  modelOptions: () => [],
  saving: false,
  testing: false,
  disableProviderSelection: false,
  showTestButton: true,
  saveButtonText: "保存",
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "save", payload: { providerId: string; apiKey: string; modelId: string }): void;
  (e: "test", payload: { providerId: string; apiKey: string; modelId: string }): void;
}>();

const providerId = ref("");
const apiKey = ref("");
const selectedModelKey = ref("");
const showApiKey = ref(false);
const loadingProviderModels = ref(false);
const providerModelOptionsMap = ref<Record<string, ModelOption[]>>({});
let providerModelRequestSeq = 0;
let apiKeyRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function modelOptionKey(option: ModelOption): string {
  return `${option.providerId}::${option.id}`;
}

function parseModelOptionKey(value: string): { providerId: string; modelId: string } | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const separatorIndex = normalized.indexOf("::");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 2) {
    return null;
  }
  return {
    providerId: normalized.slice(0, separatorIndex),
    modelId: normalized.slice(separatorIndex + 2),
  };
}

function resolveInitialModelKey(nextProviderId: string, nextModelId: string): string {
  if (!nextModelId) {
    return "";
  }
  const preferredKey = `${nextProviderId}::${nextModelId}`;
  if (props.modelOptions.some((option) => modelOptionKey(option) === preferredKey)) {
    return preferredKey;
  }
  const fallbackOption = props.modelOptions.find((option) => option.id === nextModelId);
  return fallbackOption ? modelOptionKey(fallbackOption) : "";
}

function syncFromProps() {
  providerId.value = props.initialProviderId;
  apiKey.value = props.initialApiKey;
  selectedModelKey.value = resolveInitialModelKey(props.initialProviderId, props.initialModelId);
  showApiKey.value = false;
}

function fallbackProviderModelOptions(targetProviderId: string): ModelOption[] {
  return props.modelOptions.filter((option) => option.providerId === targetProviderId);
}

function buildProviderModelOptions(targetProviderId: string): ModelOption[] {
  const dynamicOptions = providerModelOptionsMap.value[targetProviderId];
  if (dynamicOptions && dynamicOptions.length > 0) {
    return dynamicOptions;
  }
  return fallbackProviderModelOptions(targetProviderId);
}

async function loadProviderModelOptions(targetProviderId: string) {
  const normalizedProviderId = targetProviderId.trim();
  if (!normalizedProviderId) {
    return;
  }

  const requestSeq = ++providerModelRequestSeq;
  loadingProviderModels.value = true;
  try {
    const data = await luiApi.listModels({
      providerId: normalizedProviderId,
      apiKey: apiKey.value.trim() || undefined,
    });

    if (requestSeq !== providerModelRequestSeq) {
      return;
    }

    const matchedProvider = data.providers.find((provider) => provider.id === normalizedProviderId);
    if (!matchedProvider) {
      providerModelOptionsMap.value = {
        ...providerModelOptionsMap.value,
        [normalizedProviderId]: fallbackProviderModelOptions(normalizedProviderId),
      };
      return;
    }

    const normalizedOptions = matchedProvider.models.map((model) => ({
      id: model.id,
      providerId: matchedProvider.id,
      label: `${matchedProvider.name} / ${model.displayName || model.name || model.id}`,
    }));

    providerModelOptionsMap.value = {
      ...providerModelOptionsMap.value,
      [normalizedProviderId]: normalizedOptions,
    };
  }
  catch (error) {
    void error;
    if (requestSeq !== providerModelRequestSeq) {
      return;
    }
    providerModelOptionsMap.value = {
      ...providerModelOptionsMap.value,
      [normalizedProviderId]: fallbackProviderModelOptions(normalizedProviderId),
    };
  }
  finally {
    if (requestSeq === providerModelRequestSeq) {
      loadingProviderModels.value = false;
    }
  }
}

watch(() => props.open, (open) => {
  if (open) {
    syncFromProps();
    if (providerId.value.trim()) {
      void loadProviderModelOptions(providerId.value);
    }
  }
}, { immediate: true });

watch(() => props.initialProviderId, () => {
  if (props.open) {
    providerId.value = props.initialProviderId;
  }
});

watch(() => props.initialApiKey, () => {
  if (props.open) {
    apiKey.value = props.initialApiKey;
  }
});

watch(() => props.initialModelId, () => {
  if (props.open) {
    selectedModelKey.value = resolveInitialModelKey(providerId.value, props.initialModelId);
  }
});

const selectedPresetProvider = computed(() => {
  return props.presetProviders.find((provider) => provider.id === providerId.value) ?? null;
});

const availableModelOptions = computed(() => {
  if (props.modelOptions.length === 0 && Object.keys(providerModelOptionsMap.value).length === 0) {
    return [] as ModelOption[];
  }

  const currentProviderId = providerId.value.trim();
  if (!currentProviderId) {
    return props.modelOptions;
  }

  return buildProviderModelOptions(currentProviderId);
});

watch(providerId, (nextProviderId, prevProviderId) => {
  if (!props.open) {
    return;
  }
  const normalizedNext = nextProviderId.trim();
  const normalizedPrev = prevProviderId.trim();
  if (!normalizedNext || normalizedNext === normalizedPrev) {
    return;
  }
  void loadProviderModelOptions(normalizedNext);
});

watch(apiKey, (nextApiKey, prevApiKey) => {
  if (!props.open) {
    return;
  }
  if (nextApiKey.trim() === prevApiKey.trim()) {
    return;
  }
  const currentProviderId = providerId.value.trim();
  if (!currentProviderId) {
    return;
  }
  if (apiKeyRefreshTimer) {
    clearTimeout(apiKeyRefreshTimer);
  }
  apiKeyRefreshTimer = setTimeout(() => {
    void loadProviderModelOptions(currentProviderId);
  }, 300);
});

watch(availableModelOptions, (options) => {
  if (selectedModelKey.value && !options.some((option) => modelOptionKey(option) === selectedModelKey.value)) {
    selectedModelKey.value = "";
  }
});

watch(selectedModelKey, (nextKey) => {
  const resolved = parseModelOptionKey(nextKey);
  if (!resolved) {
    return;
  }
  if (providerId.value !== resolved.providerId) {
    providerId.value = resolved.providerId;
  }
});

const selectedModelId = computed(() => {
  const resolved = parseModelOptionKey(selectedModelKey.value);
  return resolved?.modelId ?? "";
});

const saveButtonDisabled = computed(() => {
  if (props.saving || props.testing) {
    return true;
  }

  if (providerId.value.trim() && loadingProviderModels.value) {
    return true;
  }

  return false;
});

function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen && (props.saving || props.testing)) {
    return;
  }
  emit("update:open", nextOpen);
}

function emitSave() {
  emit("save", {
    providerId: providerId.value.trim(),
    apiKey: apiKey.value.trim(),
    modelId: selectedModelId.value.trim(),
  });
}

function emitTest() {
  emit("test", {
    providerId: providerId.value.trim(),
    apiKey: apiKey.value.trim(),
    modelId: selectedModelId.value.trim(),
  });
}
</script>
