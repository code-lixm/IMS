<template>
  <div class="flex items-center justify-between border-t bg-background px-4 py-2">
    <div class="flex items-center gap-2">
      <AgentSelector
        :model-value="selectedAgentId"
        @select="handleAgentSelect"
        @create="handleAgentCreate"
      />
    </div>

    <div class="flex items-center gap-2">
      <ModelSelector
        :providers="providers"
        :selected-id="selectedModelId"
        :authorized-providers="authorizedProviders"
        @select="handleModelSelect"
        @authorize="handleAuthorize"
      />

      <TemperatureControl
        v-model="temperature"
        @update:model-value="handleTemperatureChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import AgentSelector from "./agent-selector.vue"
import ModelSelector from "./model-selector.vue"
import TemperatureControl from "./temperature-control.vue"
import type { ModelProvider } from "@/stores/lui"

interface AgentInfo {
  id: string
  name: string
}

interface ModelConfig {
  id: string
  provider: string
}

interface AIGatewayToolbarProps {
  selectedAgentId?: string | null
  providers: ModelProvider[]
  selectedModelId?: string | null
  authorizedProviders?: string[]
  temperature?: number
}

withDefaults(defineProps<AIGatewayToolbarProps>(), {
  selectedAgentId: null,
  selectedModelId: null,
  authorizedProviders: () => [],
  temperature: 0.5,
})

const emit = defineEmits<{
  (e: "select-agent", agentId: string | null): void
  (e: "create-agent"): void
  (e: "select-model", modelId: string | null): void
  (e: "authorize", provider: string): void
  (e: "update:temperature", value: number): void
}>()

function handleAgentSelect(agent: AgentInfo | null) {
  emit("select-agent", agent?.id ?? null)
}

function handleAgentCreate() {
  emit("create-agent")
}

function handleModelSelect(model: ModelConfig | null) {
  emit("select-model", model?.id ?? null)
}

function handleAuthorize(provider: string) {
  emit("authorize", provider)
}

function handleTemperatureChange(value: number) {
  emit("update:temperature", value)
}
</script>
