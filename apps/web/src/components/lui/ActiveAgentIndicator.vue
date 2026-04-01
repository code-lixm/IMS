<template>
  <div class="active-agent-indicator flex items-center gap-2 rounded-full bg-green-100 dark:bg-green-900 px-3 py-1 text-xs">
    <div class="h-2 w-2 animate-pulse rounded-full bg-green-600 dark:bg-green-400" />
    <span class="text-green-900 dark:text-green-100">
      {{ agent?.name || 'Agent' }} 正在处理...
    </span>
  </div>
</template>

<script setup lang="ts">
import type { AgentManifest } from '@/agents/host';

interface ActiveAgentIndicatorProps {
  agent: AgentManifest;
}

defineProps<ActiveAgentIndicatorProps>();
</script>