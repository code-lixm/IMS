import { ref, computed } from 'vue';
import { agentHost } from '@/agents/host';
import { useAgentContext } from '@/agents/context-bridge';
import { useAgentStore } from '@/stores/agent';
import type { AgentManifest } from '@/agents/host';

/**
 * useAgent Composable
 * 
 * 封装 Agent 相关的逻辑，提供便捷的方法来执行 Agent
 */
export function useAgent() {
  const agentStore = useAgentStore();
  const agentContext = useAgentContext();
  
  // ==================== State ====================
  
  const isStreaming = ref(false);
  const streamingContent = ref('');
  const error = ref<string | null>(null);
  const activeAgent = ref<AgentManifest | null>(null);
  
  // 用于中断流式响应
  const abortController = ref<AbortController | null>(null);
  
  // ==================== Computed ====================
  
  const currentAgent = computed(() => agentStore.currentAgent);
  const currentAgentId = computed(() => agentStore.currentAgentId);
  const isSwarmMode = computed(() => agentStore.isSwarmMode);
  const allAgents = computed(() => agentStore.allAgents);
  
  // ==================== Methods ====================
  
  /**
   * 执行单个 Agent
   */
  async function executeAgent(
    message: string,
    options?: {
      agentId?: string;
      onChunk?: (chunk: string) => void;
      onComplete?: (result: string) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<string> {
    const agentId = options?.agentId || currentAgentId.value;
    
    isStreaming.value = true;
    streamingContent.value = '';
    error.value = null;
    abortController.value = new AbortController();
    
    try {
      const stream = agentHost.stream(
        agentId,
        message,
        agentContext.value
      );
      
      let result = '';
      
      for await (const chunk of stream) {
        if (abortController.value?.signal.aborted) {
          throw new Error('AbortError');
        }
        
        result += chunk;
        streamingContent.value = result;
        options?.onChunk?.(chunk);
      }
      
      options?.onComplete?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      error.value = errorMessage;
      options?.onError?.(err instanceof Error ? err : new Error(errorMessage));
      throw err;
    } finally {
      isStreaming.value = false;
      streamingContent.value = '';
      abortController.value = null;
    }
  }
  
  /**
   * 执行 Swarm 模式
   * 
   * 注意：Swarm 模式需要 Agent 支持 handoffs
   * 当前实现为简化版本，后续需要根据实际需求完善
   */
  async function executeSwarm(
    message: string,
    options?: {
      agentId?: string;
      onChunk?: (chunk: string) => void;
      onHandoff?: (from: string, to: string, reason: string) => void;
      onComplete?: (result: string) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<string> {
    // 当前简化实现：直接执行单个 Agent
    // TODO: 后续需要实现真正的 Swarm 模式
    console.warn('Swarm mode is not fully implemented yet, falling back to single agent execution');
    return executeAgent(message, options);
  }
  
  /**
   * 中断当前执行
   */
  function abort() {
    abortController.value?.abort();
  }
  
  /**
   * 切换 Agent
   */
  function switchAgent(agentId: string) {
    agentStore.setCurrentAgent(agentId);
  }
  
  /**
   * 切换 Swarm 模式
   */
  function toggleSwarmMode() {
    agentStore.toggleSwarmMode();
  }
  
  return {
    // State
    isStreaming,
    streamingContent,
    error,
    activeAgent,
    
    // Computed
    currentAgent,
    currentAgentId,
    isSwarmMode,
    allAgents,
    
    // Methods
    executeAgent,
    executeSwarm,
    abort,
    switchAgent,
    toggleSwarmMode,
  };
}