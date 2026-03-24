// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

export default [
  defineMock({
    url: '/api/sync/status',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { enabled: false, intervalMs: 5000, lastSyncAt: null, syncing: false },
    }),
  }),
  defineMock({
    url: '/api/sync/toggle',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      return {
        code: 0,
        message: 'success',
        data: { enabled: body.enabled, intervalMs: 5000 },
      }
    },
  }),
  defineMock({
    url: '/api/sync/run',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { syncedAt: Date.now(), added: 5, updated: 3, errors: [] },
    }),
  }),
]
