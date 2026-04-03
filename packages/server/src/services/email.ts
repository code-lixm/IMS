import { and, eq } from "drizzle-orm";
import type {
  CreateEmailConfigInput,
  CreateEmailTemplateInput,
  SendEmailData,
  SendEmailInput,
  UpdateEmailConfigInput,
  UpdateEmailTemplateInput,
} from "../../../shared/src/api-types";
import type { EmailConfig, EmailTemplate } from "../../../shared/src/db-schema";
import { db } from "../db";
import { emailConfigs, emailTemplates } from "../schema";

const DEFAULT_USER_ID = "anonymous";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_VAR_REGEX = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

type EmailConfigRow = typeof emailConfigs.$inferSelect;
type EmailTemplateRow = typeof emailTemplates.$inferSelect;
type TransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
};
type MailOptions = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
type MailResult = {
  messageId: string;
  accepted: Array<string | { address?: string }>;
  rejected: Array<string | { address?: string }>;
};
type MailTransporter = {
  verify(): Promise<void>;
  sendMail(options: MailOptions): Promise<MailResult>;
};
type NodemailerModule = {
  createTransport(options: TransportOptions): MailTransporter;
};

let nodemailerModulePromise: Promise<NodemailerModule> | null = null;

export class EmailServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EmailServiceError";
  }
}

async function loadNodemailer(): Promise<NodemailerModule> {
  if (!nodemailerModulePromise) {
    const importer = new Function("specifier", "return import(specifier);") as (specifier: string) => Promise<unknown>;
    nodemailerModulePromise = importer("nodemailer")
      .then((module) => {
        const candidate = ((module as { default?: unknown }).default ?? module) as Partial<NodemailerModule>;
        if (typeof candidate.createTransport !== "function") {
          throw new Error("nodemailer 模块格式不正确");
        }
        return candidate as NodemailerModule;
      })
      .catch((error) => {
        nodemailerModulePromise = null;
        throw new EmailServiceError(
          "INTERNAL_ERROR",
          `未检测到 nodemailer 依赖，无法发送邮件: ${error instanceof Error ? error.message : String(error)}`,
          500,
        );
      });
  }

  return nodemailerModulePromise;
}

function normalizeUserId(userId?: string): string {
  return userId?.trim() || DEFAULT_USER_ID;
}

function assertEmail(value: string, fieldName: string): void {
  if (!EMAIL_REGEX.test(value.trim())) {
    throw new EmailServiceError("VALIDATION_ERROR", `${fieldName} 格式不正确`, 422);
  }
}

function parseVariables(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function extractVariables(subject: string, body: string): string[] {
  const found = new Set<string>();
  for (const source of [subject, body]) {
    TEMPLATE_VAR_REGEX.lastIndex = 0;
    for (const match of source.matchAll(TEMPLATE_VAR_REGEX)) {
      const variableName = match[1]?.trim();
      if (variableName) {
        found.add(variableName);
      }
    }
  }
  return Array.from(found);
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(TEMPLATE_VAR_REGEX, (_, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      throw new EmailServiceError("VALIDATION_ERROR", `缺少模板变量: ${key}`, 422);
    }
    return value;
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toEmailConfig(row: EmailConfigRow): EmailConfig {
  return {
    id: row.id,
    userId: row.userId,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUser: row.smtpUser,
    smtpPass: row.smtpPass,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEmailTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    subject: row.subject,
    body: row.body,
    variables: parseVariables(row.variables),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class EmailService {
  private transporterCache = new Map<string, MailTransporter>();

  private async createTransporter(config: EmailConfig): Promise<MailTransporter> {
    const cached = this.transporterCache.get(config.id);
    if (cached) {
      return cached;
    }

    const nodemailer = await loadNodemailer();
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    this.transporterCache.set(config.id, transporter);
    return transporter;
  }

  private invalidateTransporter(configId: string): void {
    this.transporterCache.delete(configId);
  }

  private async unsetOtherDefaults(userId: string, keepId?: string): Promise<void> {
    const rows = await db
      .select({ id: emailConfigs.id, isDefault: emailConfigs.isDefault })
      .from(emailConfigs)
      .where(eq(emailConfigs.userId, userId));

    for (const row of rows) {
      if (keepId && row.id === keepId) {
        continue;
      }

      if (row.isDefault) {
        await db
          .update(emailConfigs)
          .set({ isDefault: false, updatedAt: Date.now() })
          .where(eq(emailConfigs.id, row.id));
      }
    }
  }

  private async validateConfigInput(input: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    fromName: string;
    fromEmail: string;
  }): Promise<void> {
    if (!input.smtpHost.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "smtpHost 不能为空", 422);
    }
    if (!Number.isInteger(input.smtpPort) || input.smtpPort <= 0 || input.smtpPort > 65535) {
      throw new EmailServiceError("VALIDATION_ERROR", "smtpPort 必须是 1-65535 之间的整数", 422);
    }
    if (!input.smtpUser.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "smtpUser 不能为空", 422);
    }
    if (!input.smtpPass.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "smtpPass 不能为空", 422);
    }
    if (!input.fromName.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "fromName 不能为空", 422);
    }

    assertEmail(input.fromEmail, "fromEmail");

    const nodemailer = await loadNodemailer();
    const probe = nodemailer.createTransport({
      host: input.smtpHost,
      port: input.smtpPort,
      secure: input.smtpPort === 465,
      auth: {
        user: input.smtpUser,
        pass: input.smtpPass,
      },
    });

    try {
      await probe.verify();
    } catch (error) {
      throw new EmailServiceError(
        "VALIDATION_ERROR",
        `SMTP 配置验证失败: ${error instanceof Error ? error.message : String(error)}`,
        422,
      );
    }
  }

  async listConfigs(userId?: string): Promise<EmailConfig[]> {
    const rows = await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.userId, normalizeUserId(userId)));

    return rows.map(toEmailConfig);
  }

  async createConfig(input: CreateEmailConfigInput): Promise<EmailConfig> {
    const userId = normalizeUserId(input.userId);
    const now = Date.now();

    await this.validateConfigInput({
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpUser: input.smtpUser,
      smtpPass: input.smtpPass,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    });

    const existing = await this.listConfigs(userId);
    const shouldSetDefault = input.isDefault ?? existing.length === 0;
    if (shouldSetDefault) {
      await this.unsetOtherDefaults(userId);
    }

    const [row] = await db
      .insert(emailConfigs)
      .values({
        id: `emailcfg_${crypto.randomUUID()}`,
        userId,
        smtpHost: input.smtpHost.trim(),
        smtpPort: input.smtpPort,
        smtpUser: input.smtpUser.trim(),
        smtpPass: input.smtpPass,
        fromName: input.fromName.trim(),
        fromEmail: input.fromEmail.trim(),
        isDefault: shouldSetDefault,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toEmailConfig(row);
  }

  async updateConfig(id: string, input: UpdateEmailConfigInput): Promise<EmailConfig | null> {
    const [existingRow] = await db.select().from(emailConfigs).where(eq(emailConfigs.id, id)).limit(1);
    if (!existingRow) {
      return null;
    }

    const existing = toEmailConfig(existingRow);
    const nextConfig = {
      userId: normalizeUserId(input.userId ?? existing.userId),
      smtpHost: input.smtpHost ?? existing.smtpHost,
      smtpPort: input.smtpPort ?? existing.smtpPort,
      smtpUser: input.smtpUser ?? existing.smtpUser,
      smtpPass: input.smtpPass ?? existing.smtpPass,
      fromName: input.fromName ?? existing.fromName,
      fromEmail: input.fromEmail ?? existing.fromEmail,
    };

    await this.validateConfigInput(nextConfig);

    const shouldSetDefault = input.isDefault ?? existing.isDefault;
    if (shouldSetDefault) {
      await this.unsetOtherDefaults(nextConfig.userId, id);
    }

    const [row] = await db
      .update(emailConfigs)
      .set({
        ...nextConfig,
        isDefault: shouldSetDefault,
        updatedAt: Date.now(),
      })
      .where(eq(emailConfigs.id, id))
      .returning();

    this.invalidateTransporter(id);
    return row ? toEmailConfig(row) : null;
  }

  async deleteConfig(id: string): Promise<boolean> {
    const [existing] = await db.select().from(emailConfigs).where(eq(emailConfigs.id, id)).limit(1);
    if (!existing) {
      return false;
    }

    await db.delete(emailConfigs).where(eq(emailConfigs.id, id));
    this.invalidateTransporter(id);

    if (existing.isDefault) {
      const [replacement] = await db
        .select()
        .from(emailConfigs)
        .where(eq(emailConfigs.userId, existing.userId))
        .limit(1);

      if (replacement) {
        await db
          .update(emailConfigs)
          .set({ isDefault: true, updatedAt: Date.now() })
          .where(eq(emailConfigs.id, replacement.id));
      }
    }

    return true;
  }

  async listTemplates(userId?: string): Promise<EmailTemplate[]> {
    const rows = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.userId, normalizeUserId(userId)));

    return rows.map(toEmailTemplate);
  }

  async createTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    const userId = normalizeUserId(input.userId);
    if (!input.name.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板名称不能为空", 422);
    }
    if (!input.subject.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板主题不能为空", 422);
    }
    if (!input.body.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板内容不能为空", 422);
    }

    const now = Date.now();
    const [row] = await db
      .insert(emailTemplates)
      .values({
        id: `emailtpl_${crypto.randomUUID()}`,
        userId,
        name: input.name.trim(),
        subject: input.subject,
        body: input.body,
        variables: JSON.stringify(extractVariables(input.subject, input.body)),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toEmailTemplate(row);
  }

  async updateTemplate(id: string, input: UpdateEmailTemplateInput): Promise<EmailTemplate | null> {
    const [existingRow] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id)).limit(1);
    if (!existingRow) {
      return null;
    }

    const nextName = input.name ?? existingRow.name;
    const nextSubject = input.subject ?? existingRow.subject;
    const nextBody = input.body ?? existingRow.body;
    if (!nextName.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板名称不能为空", 422);
    }
    if (!nextSubject.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板主题不能为空", 422);
    }
    if (!nextBody.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "模板内容不能为空", 422);
    }

    const [row] = await db
      .update(emailTemplates)
      .set({
        userId: normalizeUserId(input.userId ?? existingRow.userId),
        name: nextName.trim(),
        subject: nextSubject,
        body: nextBody,
        variables: JSON.stringify(extractVariables(nextSubject, nextBody)),
        updatedAt: Date.now(),
      })
      .where(eq(emailTemplates.id, id))
      .returning();

    return row ? toEmailTemplate(row) : null;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const [deleted] = await db.delete(emailTemplates).where(eq(emailTemplates.id, id)).returning();
    return Boolean(deleted);
  }

  private async resolveSendConfig(userId: string, configId?: string): Promise<EmailConfig> {
    if (configId) {
      const [row] = await db
        .select()
        .from(emailConfigs)
        .where(and(eq(emailConfigs.id, configId), eq(emailConfigs.userId, userId)))
        .limit(1);
      if (!row) {
        throw new EmailServiceError("NOT_FOUND", "邮件配置不存在", 404);
      }
      return toEmailConfig(row);
    }

    const [defaultRow] = await db
      .select()
      .from(emailConfigs)
      .where(and(eq(emailConfigs.userId, userId), eq(emailConfigs.isDefault, true)))
      .limit(1);

    if (defaultRow) {
      return toEmailConfig(defaultRow);
    }

    const [firstRow] = await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.userId, userId))
      .limit(1);

    if (!firstRow) {
      throw new EmailServiceError("NOT_FOUND", "未找到可用的邮件配置", 404);
    }

    return toEmailConfig(firstRow);
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailData> {
    const userId = normalizeUserId(input.userId);
    assertEmail(input.to, "to");

    const config = await this.resolveSendConfig(userId, input.configId);
    let subject = input.subject?.trim() ?? "";
    let body = input.body ?? "";
    let templateId: string | null = null;

    if (input.templateId) {
      const [templateRow] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.id, input.templateId), eq(emailTemplates.userId, userId)))
        .limit(1);

      if (!templateRow) {
        throw new EmailServiceError("NOT_FOUND", "邮件模板不存在", 404);
      }

      const template = toEmailTemplate(templateRow);
      const variables = input.variables ?? {};
      subject = renderTemplate(template.subject, variables);
      body = renderTemplate(template.body, variables);
      templateId = template.id;
    }

    if (!subject) {
      throw new EmailServiceError("VALIDATION_ERROR", "邮件主题不能为空", 422);
    }
    if (!body.trim()) {
      throw new EmailServiceError("VALIDATION_ERROR", "邮件内容不能为空", 422);
    }

    const transporter = await this.createTransporter(config);
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to.trim(),
      subject,
      text: stripHtml(body),
      html: body,
    });

    return {
      messageId: info.messageId,
      configId: config.id,
      templateId,
      accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
      subject,
      body,
      sentAt: Date.now(),
    };
  }
}

export const emailService = new EmailService();
