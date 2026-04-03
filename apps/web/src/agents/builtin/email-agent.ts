import { tool } from "ai";
import { z } from "zod";
import { emailApi } from "@/api/email";
import { getIMSContext } from "../context-bridge";
import { agentHost, type AgentManifest } from "../host";

export const emailAgentManifest: AgentManifest = {
  id: "email-agent",
  name: "邮件助手",
  description: "发送面试通知、补充说明和反馈邮件",
  capabilities: ["email-sending", "template-management"],
  model: "gpt-4o",
  category: "builtin",
  permissions: ["candidate:read", "interview:read"],
  handoffTargets: ["interview-coordinator"],
  ui: {
    icon: "mail",
    color: "#2563eb",
  },
};

const sendEmailTool = tool({
  description: "发送邮件给候选人或其他收件人",
  inputSchema: z.object({
    to: z.string().email().optional().describe("收件人邮箱，默认使用当前候选人邮箱"),
    configId: z.string().optional().describe("指定邮件配置 ID"),
    subject: z.string().optional().describe("邮件主题"),
    body: z.string().optional().describe("邮件正文，支持 HTML"),
    templateId: z.string().optional().describe("邮件模板 ID"),
    variables: z.record(z.string(), z.string()).optional().describe("模板变量键值对"),
  }),
  execute: async ({ to, configId, subject, body, templateId, variables }, options) => {
    const ctx = getIMSContext(options as { state?: unknown });
    const targetEmail = to ?? ctx.currentCandidate?.email;

    if (!targetEmail) {
      throw new Error("缺少收件人邮箱，且当前上下文没有候选人邮箱");
    }

    const mergedVariables = {
      candidateName: ctx.currentCandidate?.name ?? "候选人",
      ...(variables ?? {}),
    };

    return emailApi.send({
      userId: ctx.currentUser.id,
      configId,
      to: targetEmail,
      subject,
      body,
      templateId,
      variables: mergedVariables,
    });
  },
});

const listTemplatesTool = tool({
  description: "获取当前用户可用的邮件模板列表",
  inputSchema: z.object({}),
  execute: async (_params, options) => {
    const ctx = getIMSContext(options as { state?: unknown });
    return emailApi.listTemplates(ctx.currentUser.id);
  },
});

export function createEmailAgent(): any {
  return {
    id: emailAgentManifest.id,
    model: emailAgentManifest.model,
    systemPrompt: `你是一个邮件助手，负责生成并发送面试相关邮件。

你的工作原则：
1. 优先使用模板发送结构化邮件
2. 没有模板时再直接发送自由文本
3. 如果用户没有明确收件人，优先使用当前候选人邮箱
4. 保持措辞专业、清晰、简洁

请使用提供的工具完成任务。`,
    tools: {
      sendEmail: sendEmailTool,
      listTemplates: listTemplatesTool,
    },
  };
}

agentHost.register(emailAgentManifest, createEmailAgent);
