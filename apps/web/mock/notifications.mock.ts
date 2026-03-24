// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

const notifications = [
  { id: 'notif_001', type: 'import_completed', title: '导入完成', message: '批量导入已完成，成功 8 个，失败 2 个', readAt: null, createdAt: 1711000000000 },
  { id: 'notif_002', type: 'interview_scheduled', title: '面试安排', message: '张三的面试已安排在 2024-03-25 14:00', readAt: 1711000000000, createdAt: 1710900000000 },
]

export default [
  defineMock({
    url: '/api/notifications',
    method: 'GET',
    response: (req) => {
      const unreadOnly = req.query?.unreadOnly === 'true'
      let items = notifications
      if (unreadOnly) {
        items = items.filter(n => !n.readAt)
      }
      const unreadCount = notifications.filter(n => !n.readAt).length
      return { code: 0, message: 'success', data: { items, unreadCount } }
    },
  }),
  defineMock({
    url: '/api/notifications/:id/read',
    method: 'POST',
    response: (req) => {
      const { id } = req.params
      const notif = notifications.find(n => n.id === id)
      if (notif) notif.readAt = Date.now()
      return { code: 0, message: 'success', data: { id, readAt: Date.now() } }
    },
  }),
  defineMock({
    url: '/api/notifications/read-all',
    method: 'POST',
    response: () => {
      notifications.forEach(n => { n.readAt = n.readAt || Date.now() })
      return { code: 0, message: 'success', data: { status: 'ok' } }
    },
  }),
]
