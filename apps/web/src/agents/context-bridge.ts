/**
 * IMS Context Bridge - 业务状态桥接
 * 
 * 文件位置: apps/web/src/agents/context-bridge.ts
 * 
 * 职责:
 * - 定义 IMS 业务上下文类型
 * - 提供工具中访问 IMS 状态的辅助函数
 * - Vue Composable 用于响应式上下文同步
 */

import { computed, type ComputedRef } from 'vue';
import type { IMSContext } from './host';

/**
 * 在工具函数中获取 IMS 上下文
 * 
 * 使用示例:
 * ```ts
 * const getResumeTool = tool({
 *   description: '获取当前候选人的简历',
 *   inputSchema: z.object({}),
 *   execute: async (_, options) => {
 *     const ctx = getIMSContext(options);
 *     return ctx.currentCandidate?.resumeData || null;
 *   },
 * });
 * ```
 */
export function getIMSContext(options: { state?: unknown }): IMSContext {
  if (!options.state) {
    throw new Error('IMS context not available in tool execution options');
  }
  return options.state as IMSContext;
}

/**
 * Vue Composable - 将 Pinia 状态转换为 Agent 上下文
 * 
 * 在 Vue 组件中使用,会自动保持响应式同步
 * 
 * 使用示例:
 * ```vue
 * <script setup>
 * const agentContext = useAgentContext();
 * 
 * // agentContext 是 ComputedRef<IMSContext>
 * // 当 Pinia store 更新时,会自动触发 Agent 上下文更新
 * </script>
 * ```
 */
export function useAgentContext(): ComputedRef<IMSContext> {
  // TODO: 导入实际的 Pinia stores
  // const candidateStore = useCandidateStore();
  // const viewStore = useViewStore();
  // const userStore = useUserStore();
  // const interviewStore = useInterviewStore();

  return computed<IMSContext>(() => ({
    // TODO: 从实际的 Pinia stores 获取数据
    // currentCandidate: candidateStore.current ? {
    //   id: candidateStore.current.id,
    //   name: candidateStore.current.name,
    //   email: candidateStore.current.email,
    //   phone: candidateStore.current.phone,
    //   resumeData: candidateStore.current.resumeData,
    //   status: candidateStore.current.status,
    //   tags: candidateStore.current.tags,
    //   createdAt: candidateStore.current.createdAt,
    //   updatedAt: candidateStore.current.updatedAt,
    // } : undefined,

    // view: {
    //   route: viewStore.currentRoute,
    //   selectedCandidateIds: viewStore.selectedIds,
    //   filters: viewStore.filters,
    //   sortBy: viewStore.sortBy,
    // },

    // currentUser: {
    //   id: userStore.id,
    //   name: userStore.name,
    //   role: userStore.role,
    //   preferences: userStore.preferences,
    // },

    // interviewContext: interviewStore.currentInterviewId ? {
    //   currentInterviewId: interviewStore.currentInterviewId,
    //   scheduledInterviews: interviewStore.scheduled,
    // } : undefined,

    // 临时返回默认值,等待实际的 Pinia stores 实现
    view: {
      route: '/',
      selectedCandidateIds: [],
      filters: {},
    },
    currentUser: {
      id: 'anonymous',
      name: 'Anonymous',
      role: 'recruiter',
      preferences: {
        language: 'zh',
        timezone: 'Asia/Shanghai',
        defaultModel: 'gpt-4o',
      },
    },
  }));
}

/**
 * 创建静态上下文(用于非 Vue 环境或测试)
 */
export function createStaticContext(partial: Partial<IMSContext> = {}): IMSContext {
  return {
    view: {
      route: '/',
      selectedCandidateIds: [],
      filters: {},
    },
    currentUser: {
      id: 'anonymous',
      name: 'Anonymous',
      role: 'recruiter',
      preferences: {
        language: 'zh',
        timezone: 'Asia/Shanghai',
        defaultModel: 'gpt-4o',
      },
    },
    ...partial,
  };
}