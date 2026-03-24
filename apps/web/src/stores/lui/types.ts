import type {
  ConversationData as ApiConversation,
  FileResourceData as ApiFileResource,
  MessageData as ApiMessage,
} from "@ims/shared";

export interface Conversation {
  id: string;
  title: string;
  candidateId: string | null;
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
    ...conversation,
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
