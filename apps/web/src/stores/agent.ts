import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { agentHost } from '@/agents/host';
import type { AgentManifest } from '@/agents/host';

/**
 * Agent Store
 * 
 * 管理 Agent 相关的 UI 状态
 * 实际 Agent 实例由 AgentHost 管理
 */
export const useAgentStore = defineStore('agent', () => {
  // ==================== State ====================
  
  /** 当前选中的 Agent ID */
  const currentAgentId = ref<string>('resume-analyzer');
  
  /** 是否启用 Swarm 模式 */
  const isSwarmMode = ref(false);
  
  /** 最近使用的 Agent ID 列表（用于快捷选择） */
  const recentAgents = ref<string[]>([]);
  
  /** 用户收藏的 Agent */
  const favoriteAgents = ref<string[]>([]);
  
  // ==================== Getters ====================
  
  /** 所有可用 Agent */
  const allAgents = computed(() => agentHost.list());
  
  /** 当前 Agent 配置 */
  const currentAgent = computed(() => 
    agentHost.getManifest(currentAgentId.value)
  );
  
  /** 内置 Agent */
  const builtinAgents = computed(() => 
    agentHost.listByCategory('builtin')
  );
  
  /** 扩展 Agent */
  const extensionAgents = computed(() => 
    agentHost.listByCategory('extension')
  );
  
  /** 最近使用的 Agent 详情 */
  const recentAgentDetails = computed(() => 
    recentAgents.value
      .map(id => agentHost.getManifest(id))
      .filter((m): m is AgentManifest => m !== undefined)
  );
  
  /** 收藏的 Agent 详情 */
  const favoriteAgentDetails = computed(() => 
    favoriteAgents.value
      .map(id => agentHost.getManifest(id))
      .filter((m): m is AgentManifest => m !== undefined)
  );
  
  // ==================== Actions ====================
  
  function setCurrentAgent(id: string) {
    // 记录到最近使用
    if (currentAgentId.value !== id) {
      recentAgents.value = [
        id,
        ...recentAgents.value.filter(a => a !== id),
      ].slice(0, 5);
    }
    currentAgentId.value = id;
  }
  
  function toggleFavorite(id: string) {
    const index = favoriteAgents.value.indexOf(id);
    if (index === -1) {
      favoriteAgents.value.push(id);
    } else {
      favoriteAgents.value.splice(index, 1);
    }
  }
  
  function toggleSwarmMode() {
    isSwarmMode.value = !isSwarmMode.value;
  }
  
  function clearRecentAgents() {
    recentAgents.value = [];
  }
  
  function clearFavoriteAgents() {
    favoriteAgents.value = [];
  }
  
  return {
    // State
    currentAgentId,
    isSwarmMode,
    recentAgents,
    favoriteAgents,
    
    // Getters
    allAgents,
    currentAgent,
    builtinAgents,
    extensionAgents,
    recentAgentDetails,
    favoriteAgentDetails,
    
    // Actions
    setCurrentAgent,
    toggleFavorite,
    toggleSwarmMode,
    clearRecentAgents,
    clearFavoriteAgents,
  };
});