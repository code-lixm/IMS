// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

const batches = [
  {
    id: 'batch_001',
    status: 'completed',
    sourceType: 'local',
    currentStage: 'completed',
    totalFiles: 10,
    processedFiles: 10,
    successFiles: 8,
    failedFiles: 2,
    autoScreen: false,
    createdAt: 1711000000000,
    startedAt: 1711000000000,
    completedAt: 1711003600000,
  },
  {
    id: 'batch_002',
    status: 'processing',
    sourceType: 'local',
    currentStage: 'parsing',
    totalFiles: 5,
    processedFiles: 2,
    successFiles: 2,
    failedFiles: 0,
    autoScreen: true,
    createdAt: 1711100000000,
    startedAt: 1711100000000,
    completedAt: null,
  },
]

const tasks = [
  { id: 'task_001', batchId: 'batch_001', originalPath: '/path/to/resume1.pdf', fileType: 'pdf', status: 'completed', stage: null },
  { id: 'task_002', batchId: 'batch_001', originalPath: '/path/to/resume2.pdf', fileType: 'pdf', status: 'failed', stage: 'parsing', errorMessage: 'Invalid PDF' },
]

export default [
  defineMock({
    url: '/api/import/batches',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { items: batches },
    }),
  }),
  defineMock({
    url: '/api/import/batches',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const newBatch = {
        id: `batch_${Date.now()}`,
        status: 'processing',
        sourceType: null,
        currentStage: 'processing',
        totalFiles: body.paths?.length || 0,
        processedFiles: 0,
        successFiles: 0,
        failedFiles: 0,
        autoScreen: body.autoScreen || false,
        createdAt: Date.now(),
        startedAt: Date.now(),
        completedAt: null,
      }
      batches.unshift(newBatch)
      return { code: 0, message: 'success', data: newBatch }
    },
  }),
  defineMock({
    url: '/api/import/batches/:id',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const batch = batches.find(b => b.id === id)
      if (!batch) return { code: 404, message: 'not found', data: null }
      return { code: 0, message: 'success', data: batch }
    },
  }),
  defineMock({
    url: '/api/import/batches/:id/files',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const items = tasks.filter(t => t.batchId === id)
      return { code: 0, message: 'success', data: { items } }
    },
  }),
  defineMock({
    url: '/api/import/batches/:id/cancel',
    method: 'POST',
    response: (req) => {
      const { id } = req.params
      const batch = batches.find(b => b.id === id)
      if (batch) batch.status = 'cancelled'
      return { code: 0, message: 'success', data: { id, status: 'cancelled' } }
    },
  }),
]
