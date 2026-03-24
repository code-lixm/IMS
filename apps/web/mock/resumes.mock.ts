// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

const resumes = [
  {
    id: 'res_001',
    candidateId: 'cand_001',
    fileName: '张三_简历.pdf',
    filePath: '/mock/resumes/zhangsan.pdf',
    fileType: 'pdf',
    parsedDataJson: '{"name":"张三","school":"清华大学","major":"计算机","experience":"5年"}',
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: 'res_002',
    candidateId: 'cand_002',
    fileName: '李四_简历.pdf',
    filePath: '/mock/resumes/lisi.pdf',
    fileType: 'pdf',
    parsedDataJson: '{"name":"李四","school":"北京大学","major":"软件工程","experience":"3年"}',
    createdAt: 1710100000000,
    updatedAt: 1710100000000,
  },
]

export default [
  defineMock({
    url: '/api/candidates/:id/resumes',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const items = resumes.filter(r => r.candidateId === id).map(r => ({
        ...r,
        parsedData: r.parsedDataJson ? JSON.parse(r.parsedDataJson) : null,
      }))
      return { code: 0, message: 'success', data: { items } }
    },
  }),
  defineMock({
    url: '/api/resumes/:id',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const resume = resumes.find(r => r.id === id)
      if (!resume) return { code: 404, message: 'not found', data: null }
      return {
        code: 0,
        message: 'success',
        data: { ...resume, parsedData: resume.parsedDataJson ? JSON.parse(resume.parsedDataJson) : null },
      }
    },
  }),
  defineMock({
    url: '/api/resumes/:id/download',
    method: 'GET',
    response: (_req, res) => {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"')
      res.write(Buffer.from('Mock PDF content'))
      res.end()
    },
  }),
]
