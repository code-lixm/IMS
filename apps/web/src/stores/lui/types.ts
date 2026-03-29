import type {
  ConversationData as ApiConversation,
  FileResourceData as ApiFileResource,
  MessageData as ApiMessage,
} from "@ims/shared";

export interface Conversation {
  id: string;
  title: string;
  candidateId: string | null;
  agentId: string | null;
  modelProvider: string | null;
  modelId: string | null;
  temperature: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string | null;
  tools?: unknown[] | null;
  status: "streaming" | "error" | "complete";
  createdAt: Date;
}

export interface FileResource {
  id: string;
  name: string;
  type: "code" | "document" | "image";
  content: string;
  language?: string | null;
  size?: number;
  createdAt: Date;
}

export function convertConversation(conversation: ApiConversation): Conversation {
  return {
    id: conversation.id,
    title: conversation.title,
    candidateId: conversation.candidateId,
    agentId: conversation.agentId ?? null,
    modelProvider: conversation.modelProvider ?? null,
    modelId: conversation.modelId ?? null,
    temperature: conversation.temperature ?? 0.5,
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
  };
}

export function convertMessage(message: ApiMessage): Message {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning ?? undefined,
    tools: message.tools ?? undefined,
    status: message.status,
    createdAt: new Date(message.createdAt),
  };
}

export function convertFileResource(file: ApiFileResource): FileResource {
  return {
    ...file,
    createdAt: new Date(file.createdAt),
  };
}

// ==================== AI Gateway Types ====================

/**
 * 智能体配置
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  defaultModel: string;
  defaultTemperature: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI 模型配置
 */
export interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  requiresAuth: boolean;
}

/**
 * 模型提供商
 */
export interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  models: ModelConfig[];
}

/**
 * 授权凭证（仅状态，密钥存储在 OS Keyring）
 */
export interface Credential {
  provider: string;
  type: "api_key" | "oauth";
  isValid: boolean;
  expiresAt?: Date;
}

/**
 * 聊天配置
 */
export interface ChatConfig {
  agentId: string | null;
  modelId: string | null;
  temperature: number;
  maxTokens?: number;
}

/**
 * AI 任务
 */
export interface Task {
  id: string;
  type: "chat" | "tool" | "file_process";
  status: "pending" | "running" | "completed" | "failed";
  description: string;
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Slash 命令
 */
export interface SlashCommand {
  value: string;
  label: string;
}
