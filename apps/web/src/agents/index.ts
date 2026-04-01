/**
 * Agent Extension System - Unified Export
 * 
 * This module provides the core infrastructure for the Agent Extension System.
 * It includes:
 * - AgentHost: Core agent management and execution
 * - Context Bridge: IMS context integration
 * - Permissions: Permission checking and enforcement
 */

// Core Infrastructure
export { AgentHost } from './host'
export type { 
  AgentManifest,
  AgentPermission,
  AgentTool,
  AgentConfig,
  AgentFactory,
  IMSContext,
  SwarmChunk
} from './host'

export { 
  getIMSContext, 
  useAgentContext, 
  createStaticContext
} from './context-bridge'

export { 
  PermissionChecker, 
  PermissionDeniedError,
  withPermission
} from './permissions'

// Re-export useful types from Vercel AI SDK
export { type Tool } from 'ai'