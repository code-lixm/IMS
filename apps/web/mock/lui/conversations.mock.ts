// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

// 模拟会话数据
const conversations = [
  {
    id: 'conv-001',
    title: '简历筛选讨论',
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-24T15:30:00Z',
  },
  {
    id: 'conv-002',
    title: '面试问题优化',
    createdAt: '2026-03-21T14:20:00Z',
    updatedAt: '2026-03-23T09:15:00Z',
  },
  {
    id: 'conv-003',
    title: '候选人评估',
    createdAt: '2026-03-22T08:45:00Z',
    updatedAt: '2026-03-22T08:45:00Z',
  },
]

export default [
  defineMock({
    url: '/api/lui/conversations',
    method: 'GET',
    response: () => {
      return {
        code: 0,
        message: 'success',
        data: conversations,
      }
    },
  }),
  defineMock({
    url: '/api/lui/conversations/:id',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const conversation = conversations.find((c) => c.id === id)
      if (!conversation) {
        return {
          code: 404,
          message: 'Conversation not found',
          data: null,
        }
      }
      return {
        code: 0,
        message: 'success',
        data: conversation,
      }
    },
  }),
  defineMock({
    url: '/api/lui/conversations',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const newConversation = {
        id: `conv-${Date.now()}`,
        title: body.title || '新会话',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      conversations.push(newConversation)
      return {
        code: 0,
        message: 'success',
        data: newConversation,
      }
    },
  }),
  defineMock({
    url: '/api/lui/conversations/:id',
    method: 'DELETE',
    response: (req) => {
      const { id } = req.params
      const index = conversations.findIndex((c) => c.id === id)
      if (index === -1) {
        return {
          code: 404,
          message: 'Conversation not found',
          data: null,
        }
      }
      conversations.splice(index, 1)
      return {
        code: 0,
        message: 'success',
        data: true,
      }
    },
  }),
]
