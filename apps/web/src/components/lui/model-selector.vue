<template>
  <div class="relative">
    <DropdownMenu v-model:open="open">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="h-8 gap-1.5 text-xs">
          <Cpu class="h-3.5 w-3.5" />
          <span class="max-w-24 truncate">{{ selectedModel?.displayName ?? "选择模型" }}</span>
          <ChevronDown class="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" class="w-64">
        <template v-for="provider in providers" :key="provider.id">
          <DropdownMenuLabel>{{ provider.name }}</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem
              v-for="model in provider.models"
              :key="model.id"
              class="flex items-center justify-between"
              @click="handleSelect(model)"
            >
              <div class="flex flex-col">
                <span class="font-medium">{{ model.displayName }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ model.supportsTools ? '支持工具' : '仅聊天' }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <Badge
                  v-if="model.requiresAuth"
                  :variant="isAuthorized(model.provider) ? 'default' : 'secondary'"
                  class="text-[10px]"
                >
                  {{ isAuthorized(model.provider) ? '已授权' : '未授权' }}
                </Badge>
                <Check v-if="selectedId === model.id" class="h-4 w-4 text-primary" />
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </template>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue"
import { Cpu, ChevronDown, Check } from "lucide-vue-next"
import Button from "@/components/ui/button.vue"
import Badge from "@/components/ui/badge.vue"
import DropdownMenu from "@/components/ui/dropdown-menu.vue"
import DropdownMenuContent from "@/components/ui/dropdown-menu-content.vue"
import DropdownMenuGroup from "@/components/ui/dropdown-menu-group.vue"
import DropdownMenuItem from "@/components/ui/dropdown-menu-item.vue"
import DropdownMenuLabel from "@/components/ui/dropdown-menu-label.vue"
import DropdownMenuSeparator from "@/components/ui/dropdown-menu-separator.vue"
import DropdownMenuTrigger from "@/components/ui/dropdown-menu-trigger.vue"
import type { ModelConfig, ModelProvider } from "@/stores/lui"

interface ModelSelectorProps {
  providers: ModelProvider[]
  selectedId?: string | null
  authorizedProviders?: string[]
}

const props = defineProps<ModelSelectorProps>()
const emit = defineEmits<{
  (e: "select", model: ModelConfig | null): void
  (e: "authorize", provider: string): void
}>()

const open = ref(false)

const selectedModel = computed(() => {
  for (const provider of props.providers) {
    const model = provider.models.find((m) => m.id === props.selectedId)
    if (model) return model
  }
  return null
})

function isAuthorized(provider: string): boolean {
  return props.authorizedProviders?.includes(provider) ?? false
}

function handleSelect(model: ModelConfig) {
  if (model.requiresAuth && !isAuthorized(model.provider)) {
    emit("authorize", model.provider)
    open.value = false
    return
  }
  emit("select", model)
  open.value = false
}
</script>
