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
      },
    }),
  }),
  defineMock({
    url: '/api/indicator',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { status: 'green', reasons: [] },
    }),
  }),
]
