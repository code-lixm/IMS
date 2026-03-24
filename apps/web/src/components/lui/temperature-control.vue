<template>
  <div class="flex items-center gap-1">
    <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 gap-1.5 text-xs"
            @click="open = !open"
          >
            <Snowflake v-if="preset === 'precise'" class="h-3.5 w-3.5 text-blue-500" />
            <Scale v-else-if="preset === 'balanced'" class="h-3.5 w-3.5 text-green-500" />
            <Sun v-else class="h-3.5 w-3.5 text-orange-500" />
            <span class="hidden sm:inline">{{ label }}</span>
            <ChevronDown class="h-3 w-3 opacity-50" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>强度: {{ value.toFixed(1) }}</p>
          <p class="text-xs text-muted-foreground">{{ description }}</p>
        </TooltipContent>
      </Tooltip>

    <Popover v-model:open="open">
      <PopoverContent class="w-64" align="end">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">强度调节</span>
            <span class="text-sm text-muted-foreground">{{ value.toFixed(1) }}</span>
          </div>

          <div class="flex gap-1">
            <Button
              v-for="p in presets"
              :key="p.value"
              variant="outline"
              size="sm"
              class="flex-1 text-xs"
              :class="preset === p.value ? 'border-primary bg-primary/5' : ''"
              @click="handlePresetChange(p.value)"
            >
              <component :is="p.icon" class="mr-1 h-3 w-3" /
              {{ p.label }}
            </Button>
          </div>

          <div class="space-y-2">
            <Slider
              :model-value="[value]"
              :min="0"
              :max="1"
              :step="0.1"
              @update:model-value="handleSliderChange"
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>精确 (0.0)</span>
              <span>创意 (1.0)</span>
            </div>
          </div>

          <p class="text-xs text-muted-foreground">
            {{ description }}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue"
import { Snowflake, Scale, Sun, ChevronDown } from "lucide-vue-next"
import Button from "@/components/ui/button.vue"
import Slider from "@/components/ui/slider.vue"
import Popover from "@/components/ui/popover.vue"
import PopoverContent from "@/components/ui/popover-content.vue"
import Tooltip from "@/components/ui/tooltip.vue"
import TooltipContent from "@/components/ui/tooltip-content.vue"
import TooltipTrigger from "@/components/ui/tooltip-trigger.vue"

interface TemperatureControlProps {
  modelValue?: number
}

type Preset = "precise" | "balanced" | "creative"

const props = withDefaults(defineProps<TemperatureControlProps>(), {
  modelValue: 0.5,
})

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void
}>()

const open = ref(false)
const value = ref(props.modelValue)

const presets = [
  { value: "precise" as Preset, label: "精确", icon: Snowflake, temp: 0.0 },
  { value: "balanced" as Preset, label: "平衡", icon: Scale, temp: 0.5 },
  { value: "creative" as Preset, label: "创意", icon: Sun, temp: 1.0 },
]

const preset = computed((): Preset => {
  if (value.value <= 0.2) return "precise"
  if (value.value >= 0.8) return "creative"
  return "balanced"
})

const label = computed(() => {
  const p = presets.find((p) => p.value === preset.value)
  return p?.label ?? "平衡"
})

const description = computed(() => {
  switch (preset.value) {
    case "precise":
      return "输出更确定、更保守，适合事实性问答"
    case "balanced":
      return "平衡确定性和创造性"
    case "creative":
      return "输出更多样、更有创意，适合头脑风暴"
    default:
      return ""
  }
})

watch(() => props.modelValue, (newVal) => {
  value.value = newVal
})

function handlePresetChange(p: Preset) {
  const presetConfig = presets.find((item) => item.value === p)
  if (presetConfig) {
    value.value = presetConfig.temp
    emit("update:modelValue", presetConfig.temp)
  }
}

function handleSliderChange(v: number[] | undefined) {
  const newValue = v?.[0] ?? 0.5
  value.value = newValue
  emit("update:modelValue", newValue)
}
</script>
