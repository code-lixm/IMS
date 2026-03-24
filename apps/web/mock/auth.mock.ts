// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

export default [
  defineMock({
    url: '/api/auth/status',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { authenticated: false, provider: null },
    }),
  }),
  defineMock({
    url: '/api/auth/start',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { loginUrl: 'http://mock-login.example.com', requestId: 'req_123' },
    }),
  }),
  defineMock({
    url: '/api/auth/complete',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { status: 'valid', user: { id: 'user_001', name: 'Mock User' } },
    }),
  }),
  defineMock({
    url: '/api/auth/baobao/qr',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { provider: 'baobao', imageSrc: 'data:image/png;base64,mock', source: 'mock', refreshed: false, fetchedAt: Date.now() },
    }),
  }),
  defineMock({
    url: '/api/auth/baobao/login-status',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { provider: 'baobao', status: 'idle', currentUrl: '', lastCheckedAt: Date.now(), error: null, authenticated: false, user: null },
    }),
  }),
  defineMock({
    url: '/api/auth/logout',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { status: 'logged_out' },
    }),
  }),
]
