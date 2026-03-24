// @ts-nocheck
import { defineMock } from 'vite-plugin-mock-dev-server'

const interviews = [
  {
    id: 'int_001',
    candidateId: 'cand_001',
    remoteId: null,
    round: 1,
    status: 'completed',
    scheduledAt: 1712000000000,
    meetingLink: 'https://meeting.example.com/abc123',
    interviewerIdsJson: '["user_001","user_002"]',
    manualEvaluationJson: '{"score":4,"pros":["技术扎实","表达清晰"],"cons":["经验稍浅"]}',
    createdAt: 1711000000000,
    updatedAt: 1712000000000,
  },
  {
    id: 'int_002',
    candidateId: 'cand_001',
    remoteId: null,
    round: 2,
    status: 'scheduled',
    scheduledAt: 1713000000000,
    meetingLink: 'https://meeting.example.com/def456',
    interviewerIdsJson: '["user_001"]',
    manualEvaluationJson: null,
    createdAt: 1711500000000,
    updatedAt: 1711500000000,
  },
]

export default [
  defineMock({
    url: '/api/candidates/:id/interviews',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const items = interviews.filter(i => i.candidateId === id).map(i => ({
        ...i,
        interviewerIds: i.interviewerIdsJson ? JSON.parse(i.interviewerIdsJson) : [],
        manualEvaluation: i.manualEvaluationJson ? JSON.parse(i.manualEvaluationJson) : null,
      }))
      return { code: 0, message: 'success', data: { items } }
    },
  }),
  defineMock({
    url: '/api/candidates/:id/interviews',
    method: 'POST',
    response: (req) => {
      const { id } = req.params
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const newInterview = {
        id: `int_${Date.now()}`,
        candidateId: id,
        remoteId: null,
        round: body.round || 1,
        status: 'scheduled',
        scheduledAt: body.scheduledAt || null,
        meetingLink: body.meetingLink || null,
        interviewerIdsJson: JSON.stringify(body.interviewerIds || []),
        manualEvaluationJson: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      interviews.push(newInterview)
      return { code: 0, message: 'success', data: { id: newInterview.id, candidateId: id } }
    },
  }),
  defineMock({
    url: '/api/interviews/:id',
    method: 'GET',
    response: (req) => {
      const { id } = req.params
      const interview = interviews.find(i => i.id === id)
      if (!interview) return { code: 404, message: 'not found', data: null }
      return {
        code: 0,
        message: 'success',
        data: {
          ...interview,
          interviewerIds: interview.interviewerIdsJson ? JSON.parse(interview.interviewerIdsJson) : [],
          manualEvaluation: interview.manualEvaluationJson ? JSON.parse(interview.manualEvaluationJson) : null,
        },
      }
    },
  }),
  defineMock({
    url: '/api/interviews/:id',
    method: 'PUT',
    response: (req) => {
      const { id } = req.params
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const index = interviews.findIndex(i => i.id === id)
      if (index === -1) return { code: 404, message: 'not found', data: null }
      if (body.manualEvaluation) {
        body.manualEvaluationJson = JSON.stringify(body.manualEvaluation)
        delete body.manualEvaluation
      }
      interviews[index] = { ...interviews[index], ...body, updatedAt: Date.now() }
      return {
        code: 0,
        message: 'success',
        data: {
          ...interviews[index],
          interviewerIds: interviews[index].interviewerIdsJson ? JSON.parse(interviews[index].interviewerIdsJson) : [],
          manualEvaluation: interviews[index].manualEvaluationJson ? JSON.parse(interviews[index].manualEvaluationJson) : null,
        },
      }
    },
  }),
]
