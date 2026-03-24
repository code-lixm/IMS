// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

// Mock AI 响应
const mockAIResponses = [
  '好的，让我来处理这个任务。',
  '我已经分析了候选人数据，发现以下关键信息：\n\n1. 共有 156 份简历\n2. 985/211 毕业生占比 68%\n3. 平均工作经验 3.5年\n\n需要我进一步分析吗？',
  '根据筛选条件，我找到了 23 位匹配的候选人：\n\n| 姓名 | 学校 | 匹配度 |\n|------|------|--------|\n| 王五 | 清华大学 | 95% |\n| 赵六 | 北京大学 | 92% |\n| 钱七 | 复旦大学 | 88% |\n\n是否需要导出详细报告？',
  '正在执行搜索...\n\n```sql\nSELECT * FROM candidates \nWHERE school IN (SELECT name FROM schools_985)\nAND major LIKE "%计算机%"\n```\n\n查询完成，找到 45 条记录。',
]

let responseIndex = 0

export default [
  defineMock({
    url: '/api/lui/conversations/:id/messages',
    method: 'POST',
    response: (req, res) => {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const userMessage = body.message || '你好'
      void req.params?.id
      
      // 设置 SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      
      // 获取当前应回复的内容
      const responseText = mockAIResponses[responseIndex % mockAIResponses.length]
      responseIndex++
      
      // 使用模拟打字效果
      const chunks = responseText.split('')
      let index = 0
      
      // 立即发送用户消息确认
      const userMsgId = `msg-${Date.now()}-user`
      res.write(`data: ${JSON.stringify({ type: 'user_message', data: { id: userMsgId, role: 'user', content: userMessage } })}\n\n`)
      
      // 延迟发送 AI 响应
      setTimeout(() => {
        const sendChunk = () => {
          if (index < chunks.length) {
            const chunk = chunks[index]
            res.write(`data: ${JSON.stringify({ type: 'chunk', data: { content: chunk } })}\n\n`)
            index++
            setTimeout(sendChunk, 30)
          } else {
            res.write(`data: ${JSON.stringify({ type: 'done', data: { id: `msg-${Date.now()}-assistant` } })}\n\n`)
            res.end()
          }
        }
        sendChunk()
      }, 500)
      
      req.on('close', () => {})
    },
  }),
]
