// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

const devices = [
  { id: 'device_001', name: 'MacBook Pro', userName: 'zhangsan', userDisplayName: '张三', ip: '192.168.1.100', port: 3000 },
  { id: 'device_002', name: 'iPhone 15', userName: 'lisi', userDisplayName: '李四', ip: '192.168.1.101', port: 3000 },
]

const records = [
  { id: 'record_001', direction: 'sent', candidateId: 'cand_001', targetDeviceJson: '{"name":"MacBook Pro"}', status: 'success', createdAt: 1711000000000 },
]

export default [
  defineMock({
    url: '/api/share/devices',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { recentContacts: [], onlineDevices: devices },
    }),
  }),
  defineMock({
    url: '/api/share/set-user-info',
    method: 'POST',
    response: () => ({ code: 0, message: 'success', data: { status: 'updated' } }),
  }),
  defineMock({
    url: '/api/share/discover/start',
    method: 'POST',
    response: () => ({ code: 0, message: 'success', data: { status: 'discovering' } }),
  }),
  defineMock({
    url: '/api/share/discover/stop',
    method: 'POST',
    response: () => ({ code: 0, message: 'success', data: { status: 'stopped' } }),
  }),
  defineMock({
    url: '/api/share/export',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { filePath: '/mock/exports/candidate.imr', fileSize: 12345 },
    }),
  }),
  defineMock({
    url: '/api/share/send',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { recordId: `record_${Date.now()}`, status: 'success', error: null, transferredAt: Date.now() },
    }),
  }),
  defineMock({
    url: '/api/share/import',
    method: 'POST',
    response: () => ({
      code: 0,
      message: 'success',
      data: { result: 'imported', candidateId: 'cand_imported', importedCount: 1 },
    }),
  }),
  defineMock({
    url: '/api/share/resolve',
    method: 'POST',
    response: (req) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      return { code: 0, message: 'success', data: { status: 'resolved', candidateId: body.candidateId, strategy: body.strategy } }
    },
  }),
  defineMock({
    url: '/api/share/records',
    method: 'GET',
    response: () => ({
      code: 0,
      message: 'success',
      data: { items: records },
    }),
  }),
]
