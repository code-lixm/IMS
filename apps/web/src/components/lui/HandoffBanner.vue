<template>
  <div class="handoff-banner flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 px-4 py-2 text-sm">
    <ArrowRight class="h-4 w-4 text-blue-600 dark:text-blue-400" />
    <span class="text-blue-900 dark:text-blue-100">
      任务移交: <strong>{{ fromAgentName }}</strong> → <strong>{{ toAgentName }}</strong>
    </span>
    <span v-if="reason" class="text-blue-700 dark:text-blue-300">
      ({{ reason }})
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import { agentHost } from '@/agents/host';

interface HandoffBannerProps {
  from: string;
  to: string;
  reason?: string;
}

const props = defineProps<HandoffBannerProps>();

const fromAgentName = computed(() => {
  const agent = agentHost.getManifest(props.from);
  return agent?.name || props.from;
});

const toAgentName = computed(() => {
  const agent = agentHost.getManifest(props.to);
  return agent?.name || props.to;
});
</script>