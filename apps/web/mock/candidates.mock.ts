// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

// 模拟候选人数据
const candidates = [
  {
    id: 'cand_001',
    source: 'local',
    remoteId: null,
    name: '张三',
    phone: '13800138000',
    email: 'zhangsan@example.com',
    position: '高级前端工程师',
    yearsOfExperience: 5,
    tagsJson: '["985","前端","React"]',
    createdAt: 1710000000000,
    updatedAt: 1711000000000,
    deletedAt: null,
  },
  {
    id: 'cand_002',
    source: 'remote',
    remoteId: 'remote_123',
    name: '李四',
    phone: '13900139000',
    email: 'lisi@example.com',
    position: '后端工程师',
    yearsOfExperience: 3,
    tagsJson: '["211","后端","Java"]',
    createdAt: 1710100000000,
    updatedAt: 1711100000000,
    deletedAt: null,
  },
  {
    id: 'cand_003',
    source: 'local',
    remoteId: null,
    name: '王五',
    phone: '13700137000',
    email: 'wangwu@example.com',
    position: '全栈工程师',
    yearsOfExperience: 4,
    tagsJson: '["985","全栈","Vue"]',
    createdAt: 1710200000000,
    updatedAt: 1711200000000,
    deletedAt: null,
  },
]

export default [
  defineMock({
    url: '/api/candidates',
    method: 'GET',
    response: (req) => {
      const search = req.query?.search as string
      const source = req.query?.source as string
      let items = candidates.filter(c => !c.deletedAt)
      if (search) {
        items = items.filter(c => c.name.includes(search))
      }
      if (source) {
        items = items.filter(c => c.source === source)
      }
      return {
        code: 0,
        message: 'success',
        data: {
          items: items.map(c => ({ ...c, tags: c.tagsJson ? JSON.parse(c.tagsJson) : [] })),
          total: items.length,
          page: 1,
          pageSize: 20,
        },
      }
    },
  }),
  defineMock({
    url: '/api/candidates',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const newCandidate = {
        id: `cand_${Date.now()}`,
        source: body.source || 'local',
        remoteId: null,
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        position: body.position || null,
        yearsOfExperience: body.yearsOfExperience || null,
        tagsJson: JSON.stringify(body.tags || []),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      }
      candidates.push(newCandidate)
      return {
        code: 0,
        message: 'success',
        data: { ...newCandidate, tags: body.tags || [] },
      }
    },
  }),
  defineMock({
    url: '/api/candidates/:id',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const candidate = candidates.find(c => c.id === id && !c.deletedAt)
      if (!candidate) {
        return { code: 404, message: 'not found', data: null }
      }
      return {
        code: 0,
        message: 'success',
        data: {
          candidate: { ...candidate, tags: candidate.tagsJson ? JSON.parse(candidate.tagsJson) : [] },
          resumes: [],
          interviews: [],
          artifactsSummary: [],
          workspace: null,
        },
      }
    },
  }),
  defineMock({
    url: '/api/candidates/:id',
    method: 'PUT',
    response: (req) => {
      const { id } = req.params
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const index = candidates.findIndex(c => c.id === id)
      if (index === -1) {
        return { code: 404, message: 'not found', data: null }
      }
      const updates = { ...body, updatedAt: Date.now() }
      if (updates.tags) {
        updates.tagsJson = JSON.stringify(updates.tags)
        delete updates.tags
      }
      candidates[index] = { ...candidates[index], ...updates }
      return {
        code: 0,
        message: 'success',
        data: { ...candidates[index], tags: candidates[index].tagsJson ? JSON.parse(candidates[index].tagsJson) : [] },
      }
    },
  }),
  defineMock({
    url: '/api/candidates/:id',
    method: 'DELETE',
    response: (req) => {
      const { id } = req.params
      const index = candidates.findIndex(c => c.id === id)
      if (index === -1) {
        return { code: 404, message: 'not found', data: null }
      }
      candidates[index].deletedAt = Date.now()
      return { code: 0, message: 'success', data: { id, deletedAt: Date.now() } }
    },
  }),
]
