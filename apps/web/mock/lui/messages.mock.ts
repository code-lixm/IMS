// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

// 模拟消息数据
const messagesData = {
  'conv-001': [
    {
      id: 'msg-001',
      conversationId: 'conv-001',
      role: 'user',
      content: '帮我筛选一下简历库中985毕业的候选人',
      createdAt: '2026-03-20T10:00:00Z',
    },
    {
      id: 'msg-002',
      conversationId: 'conv-001',
      role: 'assistant',
      content: '好的，我来帮你筛选985毕业的候选人。让我先查询一下简历库。',
      reasoning: '用户想要筛选985毕业生，我需要调用简历查询工具来完成这个任务。',
      createdAt: '2026-03-20T10:00:05Z',
    },
    {
      id: 'msg-003',
      conversationId: 'conv-001',
      role: 'assistant',
      content: '找到 12 位985毕业的候选人：\n\n| 姓名 | 学校 | 专业 | 工作经验 |\n|------|------|------|----------|\n| 张三 | 清华大学 | 计算机 | 5年 |\n| 李四 | 北京大学 | 软件工程 | 3年 |\n| ... | ... | ... | ... |\n\n需要我进一步筛选吗？',
      createdAt: '2026-03-20T10:00:10Z',
    },
  ],
  'conv-002': [
    {
      id: 'msg-004',
      conversationId: 'conv-002',
      role: 'user',
      content: '优化一下面试问题',
      createdAt: '2026-03-21T14:20:00Z',
    },
    {
      id: 'msg-005',
      conversationId: 'conv-002',
      role: 'assistant',
      content: '我来为你优化面试问题，请提供候选人基本信息',
      createdAt: '2026-03-21T14:20:05Z',
    },
  ],
}

export default [
  defineMock({
    url: '/api/lui/conversations/:id/messages',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const messages = messagesData[id] || []
      return {
        code: 0,
        message: 'success',
        data: messages,
      }
    },
  }),
  defineMock({
    url: '/api/lui/messages/:id',
    method: 'DELETE',
    response: () => {
      return {
        code: 0,
        message: 'success',
        data: true,
      }
    },
  }),
]
