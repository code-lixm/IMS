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
          :disabled="saving || testing"
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

interface PresetProviderOption {
  id: string;
  name: string;
  icon: string;
  baseURL: string;
}

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description: string;
  presetProviders: PresetProviderOption[];
  initialProviderId?: string;
  initialApiKey?: string;
  saving?: boolean;
  testing?: boolean;
  disableProviderSelection?: boolean;
  showTestButton?: boolean;
  saveButtonText?: string;
}>(), {
  initialProviderId: "",
  initialApiKey: "",
  saving: false,
  testing: false,
  disableProviderSelection: false,
  showTestButton: true,
  saveButtonText: "保存",
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "save", payload: { providerId: string; apiKey: string }): void;
  (e: "test", payload: { providerId: string; apiKey: string }): void;
}>();

const providerId = ref("");
const apiKey = ref("");
const showApiKey = ref(false);

function syncFromProps() {
  providerId.value = props.initialProviderId;
  apiKey.value = props.initialApiKey;
  showApiKey.value = false;
}

watch(() => props.open, (open) => {
  if (open) {
    syncFromProps();
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

const selectedPresetProvider = computed(() => {
  return props.presetProviders.find((provider) => provider.id === providerId.value) ?? null;
});

function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen && (props.saving || props.testing)) {
    return;
  }
  emit("update:open", nextOpen);
}

function emitSave() {
  emit("save", { providerId: providerId.value.trim(), apiKey: apiKey.value.trim() });
}

function emitTest() {
  emit("test", { providerId: providerId.value.trim(), apiKey: apiKey.value.trim() });
}
</script>
