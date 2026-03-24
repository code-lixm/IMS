// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

export default [
  defineMock({
    url: '/api/me',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: {
        user: { id: 'user_001', name: '测试用户', email: 'test@example.com', tokenStatus: 'valid', lastSyncAt: null, settings: {} },
        syncEnabled: false,
        opencodeReady: true,
        opencodeVersion: '0.1.0',
      },
    }),
  }),
  defineMock({
    url: '/api/indicator',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { status: 'green', reasons: ['opencode_ready'] },
    }),
  }),
  defineMock({
    url: '/api/system/opencode/status',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { running: true, version: '0.1.0', pid: 12345 },
    }),
  }),
  defineMock({
    url: '/api/system/opencode/start',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { running: true, version: '0.1.0', pid: 12345 },
    }),
  }),
  defineMock({
    url: '/api/system/opencode/stop',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { running: false },
    }),
  }),
]
