/**
 * Message API Client - 消息持久化 API 客户端
 *
 * 提供前端调用消息 CRUD 接口的能力
 */

import { api } from "./client";
import type { Message, MessageStatus } from "@ims/shared";

// API 响应类型
interface GetMessagesResponse {
  messages: Message[];
  total: number;
}

interface CreateMessageResponse {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: MessageStatus;
  createdAt: number;
}

interface UpdateMessageResponse {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: MessageStatus;
  createdAt: number;
}

interface DeleteMessageResponse {
  success: boolean;
  deletedId: string;
}

interface DeleteConversationMessagesResponse {
  success: boolean;
  deletedCount: number;
}

// 请求类型
interface UpdateMessageInput {
  content?: string;
  reasoning?: string;
  toolsJson?: string;
  status?: MessageStatus;
}

export const messageApi = {
  /**
   * 获取会话消息列表
   * @param conversationId 会话 ID
   * @param options 分页选项
   */
  async getMessages(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<GetMessagesResponse> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set("limit", String(options.limit));
    }
    if (options?.offset) {
      params.set("offset", String(options.offset));
    }

    const queryString = params.toString();
    const url = queryString
      ? `/api/messages/conversations/${conversationId}?${queryString}`
      : `/api/messages/conversations/${conversationId}`;

    return api<GetMessagesResponse>(url);
  },

  /**
   * 创建新消息
   * @param conversationId 会话 ID
   * @param input 消息内容
   */
  async createMessage(
    conversationId: string,
    input: {
      content: string;
      role: "user" | "assistant" | "system";
      reasoning?: string;
      toolsJson?: string;
    }
  ): Promise<CreateMessageResponse> {
    return api<CreateMessageResponse>(
      `/api/messages/conversations/${conversationId}`,
      {
        method: "POST",
        json: input,
      }
    );
  },

  /**
   * 获取单条消息
   * @param messageId 消息 ID
   */
  async getMessage(messageId: string): Promise<Message> {
    return api<Message>(`/api/messages/${messageId}`);
  },

  /**
   * 更新消息
   * @param messageId 消息 ID
   * @param input 更新内容
   */
  async updateMessage(
    messageId: string,
    input: UpdateMessageInput
  ): Promise<UpdateMessageResponse> {
    return api<UpdateMessageResponse>(`/api/messages/${messageId}`, {
      method: "PUT",
      json: input,
    });
  },

  /**
   * 标记消息完成
   * @param conversationId 会话 ID
   * @param messageId 消息 ID
   * @param finalContent 最终内容（可选）
   */
  async completeMessage(
    conversationId: string,
    messageId: string,
    finalContent?: string
  ): Promise<UpdateMessageResponse> {
    return api<UpdateMessageResponse>(
      `/api/messages/${conversationId}/${messageId}/complete`,
      {
        method: "POST",
        json: finalContent !== undefined ? { content: finalContent } : {},
      }
    );
  },

  /**
   * 删除单条消息
   * @param messageId 消息 ID
   */
  async deleteMessage(messageId: string): Promise<DeleteMessageResponse> {
    return api<DeleteMessageResponse>(`/api/messages/${messageId}`, {
      method: "DELETE",
    });
  },

  /**
   * 删除会话的所有消息
   * @param conversationId 会话 ID
   */
  async deleteConversationMessages(
    conversationId: string
  ): Promise<DeleteConversationMessagesResponse> {
    return api<DeleteConversationMessagesResponse>(
      `/api/messages/conversations/${conversationId}`,
      {
        method: "DELETE",
      }
    );
  },
};
