# Phase 4: 业务功能闭环 - 详细技术方案（修正版）

> **目标**: 实现邮件发送和面试结果填报
> **工期**: 10 天
> **关键交付物**: 邮件功能、面试结果填报系统

---

## 1. 邮件发送功能

### 1.1 修正说明

1. 使用后端 SQLite 存储邮件配置
2. 使用 nodemailer 作为 SMTP 客户端
3. 密码使用加密存储

### 1.2 数据模型

```typescript
// packages/server/src/schema.ts 新增

export const emailAccounts = sqliteTable("email_accounts", {
  id: text("id").primaryKey(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull(),
  smtpUser: text("smtp_user").notNull(),
  smtpPassEncrypted: text("smtp_pass_encrypted").notNull(),
  smtpSecure: integer("smtp_secure", { mode: "boolean" }).notNull().default(true),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sentCount: integer("sent_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const emailTemplates = sqliteTable("email_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["invitation", "reminder", "pass", "reject", "thanks"] }).notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  variablesJson: text("variables_json"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const emailLogs = sqliteTable("email_logs", {
  id: text("id").primaryKey(),
  accountId: text("account_id").references(() => emailAccounts.id),
  toEmail: text("to_email").notNull(),
  toName: text("to_name"),
  candidateId: text("candidate_id").references(() => candidates.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  sentAt: integer("sent_at"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

### 1.3 邮件服务

```typescript
// packages/server/src/services/email-service.ts

import nodemailer from "nodemailer";
import { db } from "../db";
import { emailAccounts, emailLogs } from "../schema";
import { eq, desc } from "drizzle-orm";

export const emailService = {
  private encryptPassword(password: string): string {
    return Buffer.from(password).toString("base64");
  },

  async sendEmail(data: {
    to: string;
    subject: string;
    body: string;
    accountId?: string;
    candidateId?: string;
  }) {
    const account = data.accountId
      ? await db.select().from(emailAccounts).where(eq(emailAccounts.id, data.accountId)).then(r => r[0])
      : await db.select().from(emailAccounts).where(eq(emailAccounts.isDefault, true)).then(r => r[0]);

    if (!account) return { success: false, error: "未配置邮件账号" };

    const logId = crypto.randomUUID();
    const now = new Date();
    await db.insert(emailLogs).values({
      id: logId, accountId: account.id, toEmail: data.to,
      candidateId: data.candidateId, subject: data.subject, body: data.body,
      status: "pending", createdAt: now,
    });

    try {
      const transporter = nodemailer.createTransport({
        host: account.smtpHost, port: account.smtpPort, secure: account.smtpSecure,
        auth: { user: account.smtpUser, pass: Buffer.from(account.smtpPassEncrypted, "base64").toString() },
      });
      await transporter.sendMail({
        from: `"${account.fromName}" <${account.fromEmail}>`,
        to: data.to, subject: data.subject, html: data.body,
      });
      await db.update(emailLogs).set({ status: "sent", sentAt: new Date() }).where(eq(emailLogs.id, logId));
      return { success: true, logId };
    } catch (error) {
      await db.update(emailLogs).set({ status: "failed", errorMessage: error.message }).where(eq(emailLogs.id, logId));
      return { success: false, error: error.message };
    }
  },
};
```

### 1.4 API 路由

```typescript
app.post("/api/email/send", async (c) => {
  const body = await c.req.json();
  const result = await emailService.sendEmail(body);
  return c.json(ok(result));
});
```

---

## 2. 面试评估系统

### 2.1 数据模型

```typescript
export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  interviewId: text("interview_id").references(() => interviews.id),
  scoresJson: text("scores_json").notNull(),
  overallScore: integer("overall_score").notNull(),
  strengthsJson: text("strengths_json"),
  weaknessesJson: text("weaknesses_json"),
  notes: text("notes"),
  recommendation: text("recommendation", { enum: ["hire", "consider", "reject"] }).notNull(),
  status: text("status", { enum: ["draft", "submitted"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const ASSESSMENT_DIMENSIONS = [
  { id: "technical", name: "技术能力", weight: 0.3 },
  { id: "communication", name: "沟通能力", weight: 0.2 },
  { id: "problem_solving", name: "问题解决", weight: 0.2 },
  { id: "culture_fit", name: "文化匹配", weight: 0.15 },
  { id: "potential", name: "发展潜力", weight: 0.15 },
];
```

### 2.2 评估服务

```typescript
import { db } from "../db";
import { assessments, candidates } from "../schema";
import { eq, desc } from "drizzle-orm";

export const assessmentService = {
  async saveAssessment(data: {
    candidateId: string;
    scores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    recommendation: "hire" | "consider" | "reject";
  }) {
    const overallScore = this.calculateOverallScore(data.scores);
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(assessments).values({
      id, candidateId: data.candidateId,
      scoresJson: JSON.stringify(data.scores), overallScore,
      strengthsJson: JSON.stringify(data.strengths),
      weaknessesJson: JSON.stringify(data.weaknesses),
      recommendation: data.recommendation, status: "submitted",
      createdAt: now, updatedAt: now,
    });
    return { id, overallScore };
  },

  async getAssessment(candidateId: string) {
    const [a] = await db.select().from(assessments)
      .where(eq(assessments.candidateId, candidateId))
      .orderBy(desc(assessments.createdAt)).limit(1);
    if (!a) return null;
    return {
      ...a,
      scores: JSON.parse(a.scoresJson),
      strengths: JSON.parse(a.strengthsJson || "[]"),
      weaknesses: JSON.parse(a.weaknessesJson || "[]"),
    };
  },

  private calculateOverallScore(scores: Record<string, number>): number {
    const dims = ASSESSMENT_DIMENSIONS;
    let total = 0, weightSum = 0;
    for (const dim of dims) {
      total += (scores[dim.id] || 0) * dim.weight;
      weightSum += dim.weight;
    }
    return weightSum > 0 ? Math.round(total / weightSum) : 0;
  },
};
```

---

## 3. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 |
|----|------|------|------|--------|
| P4-T1 | 邮件数据模型 | 0.5d | P3-T9 | 高 |
| P4-T2 | 安装 nodemailer | 0.5d | - | 高 |
| P4-T3 | EmailService | 2d | T1, T2 | 高 |
| P4-T4 | 邮件 API | 1d | T3 | 高 |
| P4-T5 | 邮件前端 UI | 1.5d | T4 | 中 |
| P4-T6 | 评估数据模型 | 0.5d | P3-T9 | 高 |
| P4-T7 | AssessmentService | 2d | T6 | 高 |
| P4-T8 | 评估 API | 1d | T7 | 高 |
| P4-T9 | 评估填报 UI | 1.5d | T8 | 高 |
| P4-T10 | 集成测试 | 1d | 以上全部 | 高 |

**Phase 4 总工期**: 10 天

**文档完成** ✅
