import type { FileResource, Workflow, WorkflowArtifact } from "@/stores/lui"

const WECHAT_COPY_BLOCK_REGEX = /(^|\n)([^\n]+)\n面试轮次：[^\n]*\n面试评价：[^\n]*\n推荐职级：[^\n]*\n面试总结：[\s\S]*?(?=\n##\s|$)/

export function stripMarkdownFormat(text: string): string {
  if (!text) {
    return ""
  }

  let result = text

  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1")
  result = result.replace(/\*([^*]+)\*/g, "$1")
  result = result.replace(/~~([^~]+)~~/g, "$1")
  result = result.replace(/`([^`]+)`/g, "$1")
  result = result.replace(/^#{1,6}\s+/gm, "")
  result = result.replace(/^>\s+/gm, "")
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  result = result.replace(/```[\s\S]*?```/g, "")
  result = result.replace(/```[a-z]*\n?/gi, "")

  return result.trim()
}

export function getLatestS2Artifact(workflow: Workflow | null): WorkflowArtifact | null {
  if (!workflow) {
    return null
  }

  const artifacts = [...workflow.artifacts]
    .filter((artifact) => artifact.stage === "S2")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())

  return artifacts[0] ?? null
}

export function getArtifactContent(artifact: WorkflowArtifact | null, files: FileResource[]): string {
  if (!artifact?.fileResourceId) {
    return ""
  }

  return files.find((file) => file.id === artifact.fileResourceId)?.content ?? ""
}

export function extractWechatCopyText(content: string): string | null {
  const match = content.match(WECHAT_COPY_BLOCK_REGEX)
  return match?.[0]?.trim() || null
}

export function extractWechatField(content: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = content.match(new RegExp(`^${escapedLabel}\\s*：\\s*(.+)$`, "m"))
  return match?.[1]?.trim() || null
}

export function extractInterviewResultLabel(content: string): string | null {
  const value = extractWechatField(content, "面试评价")
  if (!value) {
    return null
  }

  return value.split("（")[0]?.trim() || value
}

export function extractRecommendedRank(content: string): string | null {
  return extractWechatField(content, "推荐职级")
}

export function extractInterviewRound(content: string): number | null {
  const value = extractWechatField(content, "面试轮次")
  if (!value) {
    return null
  }

  const match = value.match(/第\s*(\d+)\s*轮/)
  if (!match) {
    return null
  }

  const round = Number.parseInt(match[1], 10)
  return Number.isFinite(round) ? round : null
}
