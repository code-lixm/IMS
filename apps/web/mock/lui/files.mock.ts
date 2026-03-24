// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

// 模拟文件资源
const filesData = {
  'conv-001': [
    {
      id: 'file-001',
      conversationId: 'conv-001',
      name: 'candidates.json',
      type: 'document',
      language: 'json',
      size: 1234,
      content: '{\n  "candidates": [\n    {"name": "张三", "school": "清华大学"},\n    {"name": "李四", "school": "北京大学"}\n  ]\n}',
      createdAt: '2026-03-20T10:05:00Z',
    },
    {
      id: 'file-002',
      conversationId: 'conv-001',
      name: 'summary.md',
      type: 'document',
      language: 'markdown',
      size: 567,
      content: '# 候选人筛选报告\n\n## 筛选条件\n- 985毕业\n- 计算机相关专业\n\n## 结果\n共12位候选人符合条件',
      createdAt: '2026-03-20T10:10:00Z',
    },
  ],
}

export default [
  defineMock({
    url: '/api/lui/files',
    method: 'GET',
    response: (req) => {
      const conversationId = req.query?.conversationId
      const files = conversationId ? (filesData[conversationId] || []) : Object.values(filesData).flat()
      return {
        code: 0,
        message: 'success',
        data: files,
      }
    },
  }),
  defineMock({
    url: '/api/lui/files',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const newFile = {
        id: `file-${Date.now()}`,
        conversationId: body.conversationId,
        name: body.name || 'untitled.txt',
        type: 'document',
        language: body.language || 'text',
        size: body.content?.length || 0,
        content: body.content || '',
        createdAt: new Date().toISOString(),
      }
      
      const conversationId = body.conversationId
      if (conversationId) {
        if (!filesData[conversationId]) {
          filesData[conversationId] = []
        }
        filesData[conversationId].push(newFile)
      }
      
      return {
        code: 0,
        message: 'success',
        data: newFile,
      }
    },
  }),
  defineMock({
    url: '/api/lui/files/:id',
    method: 'DELETE',
    response: (req) => {
      const { id } = req.params
      for (const convId of Object.keys(filesData)) {
        const index = filesData[convId].findIndex((f) => f.id === id)
        if (index !== -1) {
          filesData[convId].splice(index, 1)
          break
        }
      }
      return {
        code: 0,
        message: 'success',
        data: true,
      }
    },
  }),
]
