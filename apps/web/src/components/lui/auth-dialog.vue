<template>
  <Dialog v-model:open="open">
    <template #content>
      <DialogHeader>
        <DialogTitle>授权 {{ providerName }}</DialogTitle>
        <DialogDescription>
          请输入您的 API Key 以使用 {{ providerName }} 模型
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="api-key">API Key</Label>
          <div class="relative">
            <Input
              id="api-key"
              v-model="apiKey"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-..."
              class="pr-10"
            />
            <Button
              variant="ghost"
              size="icon"
              class="absolute right-0 top-0 h-full px-3"
              @click="showKey = !showKey"
            >
              <Eye v-if="!showKey" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            API Key 将安全存储在系统密钥环中
          </p>
        </div>

        <Alert v-if="error" variant="destructive">
          <AlertCircle class="h-4 w-4" />
          <AlertTitle>授权失败</AlertTitle>
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">取消</Button>
        <Button :disabled="!apiKey || isLoading" @click="handleConfirm">
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          确认授权
        </Button>
      </DialogFooter>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-vue-next"
import Button from "@/components/ui/button.vue"
import Input from "@/components/ui/input.vue"
import Label from "@/components/ui/label.vue"
import Dialog from "@/components/ui/dialog.vue"
import DialogHeader from "@/components/ui/dialog-header.vue"
import DialogTitle from "@/components/ui/dialog-title.vue"
import DialogDescription from "@/components/ui/dialog-description.vue"
import DialogFooter from "@/components/ui/dialog-footer.vue"
import Alert from "@/components/ui/alert.vue"
import AlertTitle from "@/components/ui/alert-title.vue"
import AlertDescription from "@/components/ui/alert-description.vue"

interface AuthDialogProps {
  modelValue?: boolean
  provider?: string
  providerName?: string
}

const props = withDefaults(defineProps<AuthDialogProps>(), {
  modelValue: false,
  provider: "",
  providerName: "",
})

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void
  (e: "authorize", payload: { provider: string; apiKey: string }): void
}>()

const open = ref(props.modelValue)
const apiKey = ref("")
const showKey = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

watch(() => props.modelValue, (newVal) => {
  open.value = newVal
  if (newVal) {
    apiKey.value = ""
    error.value = null
    showKey.value = false
  }
})

watch(open, (newVal) => {
  emit("update:modelValue", newVal)
})

function handleCancel() {
  open.value = false
}

async function handleConfirm() {
  if (!apiKey.value.trim()) return

  isLoading.value = true
  error.value = null

  try {
    emit("authorize", {
      provider: props.provider,
      apiKey: apiKey.value.trim(),
    })
    open.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : "授权失败"
  } finally {
    isLoading.value = false
  }
}
</script>
