# Phase 4: 业务功能闭环 - 详细技术方案

> **目标**: 实现邮件发送和面试结果填报
> **工期**: 10 天
> **关键交付物**: 邮件功能、面试结果填报系统

---

## 1. 邮件发送功能

### 1.1 需求分析

**功能需求**:
- 从简历中自动提取邮箱地址
- 配置 SMTP 邮箱账号（支持多个）
- 配置邮件模板（支持变量替换）
- 一键发送面试相关邮件
- 配置面试官信息（姓名、职位、联系方式）

**场景**:
- 面试邀请邮件
- 面试提醒邮件
- 面试结果通知（通过/拒绝）
- 感谢信

### 1.2 数据模型

```typescript
// packages/shared/src/types/email.ts

// 邮件账号配置
export interface EmailAccount {
  id: string;
  userId: string;
  
  // SMTP 配置
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string; // 加密存储
  smtpSecure: boolean; // true for TLS, false for STARTTLS
  
  // 发件人信息
  fromName: string;
  fromEmail: string;
  
  // 状态
  isDefault: boolean;
  isActive: boolean;
  
  // 元数据
  lastUsedAt?: number;
  sentCount: number;
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 邮件模板
export type EmailTemplateType = 'invitation' | 'reminder' | 'pass' | 'reject' | 'thanks';

export interface EmailTemplate {
  id: string;
  userId: string;
  
  // 模板信息
  name: string;
  type: EmailTemplateType;
  subject: string;
  body: string; // 支持 HTML
  
  // 变量列表（用于提示）
  variables: string[];
  
  // 状态
  isDefault: boolean;
  isActive: boolean;
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 邮件发送记录
export interface EmailLog {
  id: string;
  userId: string;
  accountId: string;
  
  // 收件人
  toEmail: string;
  toName?: string;
  candidateId?: string;
  
  // 邮件内容
  subject: string;
  body: string;
  templateId?: string;
  
  // 发送状态
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  
  // 元数据
  sentAt?: number;
  createdAt: number;
}

// 面试官信息
export interface Interviewer {
  id: string;
  userId: string;
  
  // 基本信息
  name: string;
  title: string; // 职位
  department?: string;
  
  // 联系方式
  email?: string;
  phone?: string;
  
  // 专业领域（用于匹配候选人）
  expertise: string[];
  
  // 状态
  isActive: boolean;
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 发送邮件请求
export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  candidateId?: string;
  templateId?: string;
  accountId?: string; // 如未指定使用默认账号
}

// 默认模板变量
export const DEFAULT_EMAIL_VARIABLES = {
  candidate_name: '候选人姓名',
  candidate_email: '候选人邮箱',
  position: '应聘职位',
  interview_date: '面试日期',
  interview_time: '面试时间',
  interview_location: '面试地点',
  interviewer_name: '面试官姓名',
  interviewer_title: '面试官职位',
  company_name: '公司名称',
};
```

### 1.3 数据库 Schema

```typescript
// packages/server/src/schema.ts

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 邮件账号表
export const emailAccounts = sqliteTable('email_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpUser: text('smtp_user').notNull(),
  smtpPass: text('smtp_pass').notNull(), // 加密存储
  smtpSecure: integer('smtp_secure', { mode: 'boolean' }).notNull().default(true),
  
  fromName: text('from_name').notNull(),
  fromEmail: text('from_email').notNull(),
  
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  lastUsedAt: integer('last_used_at'),
  sentCount: integer('sent_count').notNull().default(0),
  
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
});

// 邮件模板表
export const emailTemplates = sqliteTable('email_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  
  name: text('name').notNull(),
  type: text('type', { 
    enum: ['invitation', 'reminder', 'pass', 'reject', 'thanks'] 
  }).notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  variablesJson: text('variables_json'), // JSON 数组
  
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
});

// 邮件发送记录表
export const emailLogs = sqliteTable('email_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  accountId: text('account_id').notNull(),
  
  toEmail: text('to_email').notNull(),
  toName: text('to_name'),
  candidateId: text('candidate_id'),
  
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  templateId: text('template_id'),
  
  status: text('status', { 
    enum: ['pending', 'sent', 'failed'] 
  }).notNull().default('pending'),
  errorMessage: text('error_message'),
  
  sentAt: integer('sent_at'),
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
}, (table) => ({
  candidateIdx: index('email_logs_candidate_id').on(table.candidateId),
  statusIdx: index('email_logs_status').on(table.status),
}));

// 面试官表
export const interviewers = sqliteTable('interviewers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  
  name: text('name').notNull(),
  title: text('title').notNull(),
  department: text('department'),
  email: text('email'),
  phone: text('phone'),
  expertiseJson: text('expertise_json'), // JSON 数组
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  
  createdAt: integer('created_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(strftime('%s', 'now') * 1000)`),
});
```

### 1.4 后端服务实现

```typescript
// packages/server/src/services/email.ts

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { db } from '../db';
import { emailAccounts, emailTemplates, emailLogs } from '../schema';
import { eq, and, desc } from 'drizzle-orm';
import type { 
  EmailAccount, 
  EmailTemplate, 
  EmailLog,
  SendEmailRequest 
} from '@ims/shared';

// 加密/解密工具（简化版，实际使用更安全的方案）
function encrypt(text: string): string {
  // 使用环境变量中的密钥加密
  const key = process.env.EMAIL_ENCRYPTION_KEY || 'default-key';
  // 简化实现，实际应使用 crypto
  return Buffer.from(text).toString('base64');
}

function decrypt(text: string): string {
  const key = process.env.EMAIL_ENCRYPTION_KEY || 'default-key';
  return Buffer.from(text, 'base64').toString('utf-8');
}

export class EmailService {
  private transporters = new Map<string, Transporter>();
  
  // ========== 账号管理 ==========
  
  async createAccount(
    userId: string,
    data: Omit<EmailAccount, 'id' | 'userId' | 'sentCount' | 'createdAt' | 'updatedAt'>
  ): Promise<EmailAccount> {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    // 加密密码
    const encryptedPass = encrypt(data.smtpPass);
    
    // 如果设为默认，取消其他默认账号
    if (data.isDefault) {
      await db.update(emailAccounts)
        .set({ isDefault: false })
        .where(eq(emailAccounts.userId, userId));
    }
    
    const [record] = await db.insert(emailAccounts).values({
      id,
      userId,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPass: encryptedPass,
      smtpSecure: data.smtpSecure,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      isDefault: data.isDefault,
      isActive: data.isActive,
      sentCount: 0,
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return this.mapToAccount(record);
  }
  
  async getAccounts(userId: string): Promise<EmailAccount[]> {
    const records = await db.query.emailAccounts.findMany({
      where: eq(emailAccounts.userId, userId),
      orderBy: [desc(emailAccounts.isDefault), desc(emailAccounts.createdAt)],
    });
    
    return records.map(this.mapToAccount);
  }
  
  async getDefaultAccount(userId: string): Promise<EmailAccount | null> {
    const record = await db.query.emailAccounts.findFirst({
      where: and(
        eq(emailAccounts.userId, userId),
        eq(emailAccounts.isDefault, true),
        eq(emailAccounts.isActive, true)
      ),
    });
    
    return record ? this.mapToAccount(record) : null;
  }
  
  // ========== 模板管理 ==========
  
  async createTemplate(
    userId: string,
    data: Omit<EmailTemplate, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<EmailTemplate> {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    // 提取变量
    const variables = this.extractVariables(data.body);
    
    const [record] = await db.insert(emailTemplates).values({
      id,
      userId,
      name: data.name,
      type: data.type,
      subject: data.subject,
      body: data.body,
      variablesJson: JSON.stringify(variables),
      isDefault: data.isDefault,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return this.mapToTemplate(record);
  }
  
  async getTemplates(userId: string, type?: string): Promise<EmailTemplate[]> {
    let conditions = eq(emailTemplates.userId, userId);
    
    if (type) {
      conditions = and(conditions, eq(emailTemplates.type, type));
    }
    
    const records = await db.query.emailTemplates.findMany({
      where: conditions,
      orderBy: [desc(emailTemplates.isDefault)],
    });
    
    return records.map(this.mapToTemplate);
  }
  
  // ========== 发送邮件 ==========
  
  async sendEmail(
    userId: string,
    request: SendEmailRequest
  ): Promise<{ success: boolean; logId?: string; error?: string }> {
    try {
      // 1. 获取邮件账号
      let account: EmailAccount | null = null;
      
      if (request.accountId) {
        const record = await db.query.emailAccounts.findFirst({
          where: eq(emailAccounts.id, request.accountId),
        });
        if (record) account = this.mapToAccount(record);
      }
      
      if (!account) {
        account = await this.getDefaultAccount(userId);
      }
      
      if (!account) {
        return { success: false, error: '未配置邮件账号' };
      }
      
      // 2. 创建发送记录
      const logId = crypto.randomUUID();
      const now = Date.now();
      
      await db.insert(emailLogs).values({
        id: logId,
        userId,
        accountId: account.id,
        toEmail: request.to,
        candidateId: request.candidateId ?? null,
        subject: request.subject,
        body: request.body,
        templateId: request.templateId ?? null,
        status: 'pending',
        createdAt: now,
      });
      
      // 3. 获取或创建 transporter
      const transporter = await this.getTransporter(account);
      
      // 4. 发送邮件
      await transporter.sendMail({
        from: `"${account.fromName}" <${account.fromEmail}>`,
        to: request.to,
        subject: request.subject,
        html: request.body,
      });
      
      // 5. 更新记录为已发送
      await db.update(emailLogs)
        .set({ status: 'sent', sentAt: Date.now() })
        .where(eq(emailLogs.id, logId));
      
      // 6. 更新账号统计
      await db.update(emailAccounts)
        .set({ 
          sentCount: sql`${emailAccounts.sentCount} + 1`,
          lastUsedAt: Date.now(),
        })
        .where(eq(emailAccounts.id, account.id));
      
      return { success: true, logId };
    } catch (error) {
      console.error('发送邮件失败:', error);
      
      // 更新记录为失败
      if (request.candidateId) {
        await db.update(emailLogs)
          .set({ 
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : '未知错误',
          })
          .where(eq(emailLogs.candidateId, request.candidateId));
      }
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '发送失败' 
      };
    }
  }
  
  // 使用模板发送
  async sendWithTemplate(
    userId: string,
    templateId: string,
    to: string,
    variables: Record<string, string>,
    candidateId?: string
  ): Promise<{ success: boolean; logId?: string; error?: string }> {
    // 获取模板
    const template = await db.query.emailTemplates.findFirst({
      where: eq(emailTemplates.id, templateId),
    });
    
    if (!template) {
      return { success: false, error: '模板不存在' };
    }
    
    // 替换变量
    const subject = this.replaceVariables(template.subject, variables);
    const body = this.replaceVariables(template.body, variables);
    
    return this.sendEmail(userId, {
      to,
      subject,
      body,
      candidateId,
      templateId,
    });
  }
  
  // ========== 辅助方法 ==========
  
  private async getTransporter(account: EmailAccount): Promise<Transporter> {
    const key = account.id;
    
    if (!this.transporters.has(key)) {
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        auth: {
          user: account.smtpUser,
          pass: decrypt(account.smtpPass),
        },
      });
      
      this.transporters.set(key, transporter);
    }
    
    return this.transporters.get(key)!;
  }
  
  private extractVariables(text: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = text.matchAll(regex);
    const variables = new Set<string>();
    
    for (const match of matches) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }
  
  private replaceVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] ?? match;
    });
  }
  
  private mapToAccount(record: typeof emailAccounts.$inferSelect): EmailAccount {
    return {
      id: record.id,
      userId: record.userId,
      smtpHost: record.smtpHost,
      smtpPort: record.smtpPort,
      smtpUser: record.smtpUser,
      smtpPass: record.smtpPass, // 保持加密状态
      smtpSecure: record.smtpSecure,
      fromName: record.fromName,
      fromEmail: record.fromEmail,
      isDefault: record.isDefault,
      isActive: record.isActive,
      lastUsedAt: record.lastUsedAt ?? undefined,
      sentCount: record.sentCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
  
  private mapToTemplate(record: typeof emailTemplates.$inferSelect): EmailTemplate {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      type: record.type as EmailTemplate['type'],
      subject: record.subject,
      body: record.body,
      variables: record.variablesJson ? JSON.parse(record.variablesJson) : [],
      isDefault: record.isDefault,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const emailService = new EmailService();
```

### 1.5 前端组件

```vue
<!-- apps/web/src/components/settings/EmailConfig.vue -->

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { emailApi } from '@/api/email';
import { useToast } from '@/components/ui/toast';
import type { EmailAccount, EmailTemplate } from '@ims/shared';

const { toast } = useToast();

// 账号配置
const accounts = ref<EmailAccount[]>([]);
const showAccountForm = ref(false);
const accountForm = ref({
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpSecure: false,
  fromName: '',
  fromEmail: '',
  isDefault: false,
});

// 模板配置
const templates = ref<EmailTemplate[]>([]);
const showTemplateForm = ref(false);
const templateForm = ref({
  name: '',
  type: 'invitation' as const,
  subject: '',
  body: '',
  isDefault: false,
});

// 加载数据
async function loadData() {
  accounts.value = await emailApi.getAccounts();
  templates.value = await emailApi.getTemplates();
}

// 保存账号
async function saveAccount() {
  try {
    await emailApi.createAccount(accountForm.value);
    toast({ title: '账号添加成功' });
    showAccountForm.value = false;
    await loadData();
  } catch (error) {
    toast({ 
      title: '添加失败', 
      description: error instanceof Error ? error.message : '未知错误',
      variant: 'destructive',
    });
  }
}

// 保存模板
async function saveTemplate() {
  try {
    await emailApi.createTemplate(templateForm.value);
    toast({ title: '模板添加成功' });
    showTemplateForm.value = false;
    await loadData();
  } catch (error) {
    toast({ 
      title: '添加失败', 
      description: error instanceof Error ? error.message : '未知错误',
      variant: 'destructive',
    });
  }
}

// 测试发送
async function testSend(accountId: string) {
  try {
    await emailApi.testSend(accountId);
    toast({ title: '测试邮件已发送' });
  } catch (error) {
    toast({ 
      title: '发送失败', 
      description: error instanceof Error ? error.message : '未知错误',
      variant: 'destructive',
    });
  }
}

onMounted(loadData);
</script>

<template>
  <div class="email-config space-y-8">
    <!-- 邮件账号配置 -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>邮件账号</CardTitle>
            <CardDescription>配置 SMTP 邮箱用于发送面试邮件</CardDescription>
          </div>
          <Button @click="showAccountForm = true">
            <Plus class="h-4 w-4 mr-2" />
            添加账号
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>发件人</TableHead>
              <TableHead>SMTP 服务器</TableHead>
              <TableHead>默认</TableHead>
              <TableHead>发送数</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="account in accounts" :key="account.id">
              <TableCell>
                <div>
                  <div class="font-medium">{{ account.fromName }}</div>
                  <div class="text-sm text-muted-foreground">{{ account.fromEmail }}</div>
                </div>
              </TableCell>
              <TableCell>
                {{ account.smtpHost }}:{{ account.smtpPort }}
              </TableCell>
              <TableCell>
                <Badge v-if="account.isDefault" variant="default">默认</Badge>
              </TableCell>
              <TableCell>{{ account.sentCount }}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" @click="testSend(account.id)">
                  测试
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    
    <!-- 邮件模板配置 -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>邮件模板</CardTitle>
            <CardDescription>配置各类面试邮件的模板</CardDescription>
          </div>
          <Button @click="showTemplateForm = true">
            <Plus class="h-4 w-4 mr-2" />
            添加模板
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div class="grid gap-4">
          <Card v-for="template in templates" :key="template.id">
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <CardTitle class="text-base">{{ template.name }}</CardTitle>
                  <Badge variant="secondary">{{ template.type }}</Badge>
                  <Badge v-if="template.isDefault" variant="default">默认</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent class="pt-0">
              <p class="text-sm font-medium">{{ template.subject }}</p>
              <p class="text-sm text-muted-foreground line-clamp-2">{{ template.body }}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
```

---

## 2. 面试结果填报系统

### 2.1 数据模型

```typescript
// packages/shared/src/types/interview-assessment.ts

// 评分维度
export interface AssessmentDimension {
  id: string;
  name: string;
  weight: number; // 权重（0-1）
  maxScore: number; // 满分
}

// 面试评估
export interface InterviewAssessment {
  id: string;
  candidateId: string;
  interviewId: string; // 关联面试会话
  interviewerId?: string;
  
  // 评分
  scores: Record<string, number>; // dimensionId -> score
  overallScore: number; // 综合得分（自动计算）
  
  // 评价
  strengths: string[];
  weaknesses: string[];
  notes: string;
  
  // 结论
  recommendation: 'hire' | 'consider' | 'reject';
  confidence: number; // 置信度（0-100）
  
  // 状态
  status: 'draft' | 'submitted';
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// 面试维度定义（可配置）
export const DEFAULT_ASSESSMENT_DIMENSIONS: AssessmentDimension[] = [
  {
    id: 'technical',
    name: '技术能力',
    weight: 0.3,
    maxScore: 100,
  },
  {
    id: 'communication',
    name: '沟通能力',
    weight: 0.2,
    maxScore: 100,
  },
  {
    id: 'problem_solving',
    name: '问题解决',
    weight: 0.2,
    maxScore: 100,
  },
  {
    id: 'culture_fit',
    name: '文化匹配',
    weight: 0.15,
    maxScore: 100,
  },
  {
    id: 'potential',
    name: '发展潜力',
    weight: 0.15,
    maxScore: 100,
  },
];

// 创建评估请求
export interface CreateAssessmentRequest {
  candidateId: string;
  interviewId: string;
  scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  notes: string;
  recommendation: 'hire' | 'consider' | 'reject';
}

// 评估报告
export interface AssessmentReport {
  candidate: {
    id: string;
    name: string;
    position: string;
  };
  assessment: InterviewAssessment;
  dimensions: AssessmentDimension[];
  summary: string;
  generatedAt: number;
}
```

### 2.2 后端服务

```typescript
// packages/server/src/services/assessment.ts

import { db } from '../db';
import { assessments } from '../schema';
import { eq, and, desc } from 'drizzle-orm';
import type { 
  InterviewAssessment, 
  CreateAssessmentRequest,
  AssessmentReport,
  AssessmentDimension 
} from '@ims/shared';

// 评估维度配置
const DIMENSIONS: AssessmentDimension[] = [
  { id: 'technical', name: '技术能力', weight: 0.3, maxScore: 100 },
  { id: 'communication', name: '沟通能力', weight: 0.2, maxScore: 100 },
  { id: 'problem_solving', name: '问题解决', weight: 0.2, maxScore: 100 },
  { id: 'culture_fit', name: '文化匹配', weight: 0.15, maxScore: 100 },
  { id: 'potential', name: '发展潜力', weight: 0.15, maxScore: 100 },
];

export class AssessmentService {
  // 创建或更新评估
  async saveAssessment(
    userId: string,
    data: CreateAssessmentRequest
  ): Promise<InterviewAssessment> {
    // 计算综合得分
    const overallScore = this.calculateOverallScore(data.scores);
    
    // 检查是否已存在
    const existing = await db.query.assessments.findFirst({
      where: and(
        eq(assessments.candidateId, data.candidateId),
        eq(assessments.interviewId, data.interviewId)
      ),
    });
    
    if (existing) {
      // 更新
      const [record] = await db.update(assessments)
        .set({
          scoresJson: JSON.stringify(data.scores),
          overallScore,
          strengthsJson: JSON.stringify(data.strengths),
          weaknessesJson: JSON.stringify(data.weaknesses),
          notes: data.notes,
          recommendation: data.recommendation,
          status: 'submitted',
          updatedAt: Date.now(),
        })
        .where(eq(assessments.id, existing.id))
        .returning();
      
      return this.mapToAssessment(record);
    }
    
    // 创建新评估
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const [record] = await db.insert(assessments).values({
      id,
      candidateId: data.candidateId,
      interviewId: data.interviewId,
      scoresJson: JSON.stringify(data.scores),
      overallScore,
      strengthsJson: JSON.stringify(data.strengths),
      weaknessesJson: JSON.stringify(data.weaknesses),
      notes: data.notes,
      recommendation: data.recommendation,
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    }).returning();
    
    return this.mapToAssessment(record);
  }
  
  // 获取评估
  async getAssessment(
    candidateId: string,
    interviewId: string
  ): Promise<InterviewAssessment | null> {
    const record = await db.query.assessments.findFirst({
      where: and(
        eq(assessments.candidateId, candidateId),
        eq(assessments.interviewId, interviewId)
      ),
    });
    
    return record ? this.mapToAssessment(record) : null;
  }
  
  // 获取候选人的所有评估
  async getCandidateAssessments(candidateId: string): Promise<InterviewAssessment[]> {
    const records = await db.query.assessments.findMany({
      where: eq(assessments.candidateId, candidateId),
      orderBy: [desc(assessments.createdAt)],
    });
    
    return records.map(this.mapToAssessment);
  }
  
  // 生成评估报告
  async generateReport(
    candidateId: string,
    interviewId: string
  ): Promise<AssessmentReport> {
    // 获取评估数据
    const assessment = await this.getAssessment(candidateId, interviewId);
    if (!assessment) {
      throw new Error('评估不存在');
    }
    
    // 获取候选人信息
    const candidate = await db.query.candidates.findFirst({
      where: eq(candidates.id, candidateId),
    });
    
    if (!candidate) {
      throw new Error('候选人不存在');
    }
    
    // 生成总结
    const summary = this.generateSummary(assessment);
    
    return {
      candidate: {
        id: candidate.id,
        name: candidate.name,
        position: candidate.position ?? '',
      },
      assessment,
      dimensions: DIMENSIONS,
      summary,
      generatedAt: Date.now(),
    };
  }
  
  // ========== 辅助方法 ==========
  
  private calculateOverallScore(scores: Record<string, number>): number {
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const dim of DIMENSIONS) {
      const score = scores[dim.id] ?? 0;
      weightedSum += score * dim.weight;
      totalWeight += dim.weight;
    }
    
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }
  
  private generateSummary(assessment: InterviewAssessment): string {
    const parts: string[] = [];
    
    // 总体评价
    const level = this.getScoreLevel(assessment.overallScore);
    parts.push(`综合评分：${assessment.overallScore}分（${level}）`);
    
    // 推荐结论
    const recommendationText = {
      hire: '建议录用',
      consider: '建议考虑',
      reject: '建议不录用',
    };
    parts.push(`推荐结论：${recommendationText[assessment.recommendation]}`);
    
    // 主要亮点
    if (assessment.strengths.length > 0) {
      parts.push(`主要亮点：${assessment.strengths.join('；')}`);
    }
    
    // 待提升项
    if (assessment.weaknesses.length > 0) {
      parts.push(`待提升项：${assessment.weaknesses.join('；')}`);
    }
    
    return parts.join('\n');
  }
  
  private getScoreLevel(score: number): string {
    if (score >= 90) return '优秀';
    if (score >= 80) return '良好';
    if (score >= 70) return '合格';
    if (score >= 60) return '待观察';
    return '不合格';
  }
  
  private mapToAssessment(record: typeof assessments.$inferSelect): InterviewAssessment {
    return {
      id: record.id,
      candidateId: record.candidateId,
      interviewId: record.interviewId,
      interviewerId: record.interviewerId ?? undefined,
      scores: record.scoresJson ? JSON.parse(record.scoresJson) : {},
      overallScore: record.overallScore,
      strengths: record.strengthsJson ? JSON.parse(record.strengthsJson) : [],
      weaknesses: record.weaknessesJson ? JSON.parse(record.weaknessesJson) : [],
      notes: record.notes ?? '',
      recommendation: record.recommendation as InterviewAssessment['recommendation'],
      confidence: record.confidence ?? 0,
      status: record.status as InterviewAssessment['status'],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const assessmentService = new AssessmentService();
```

### 2.3 前端评估填报组件

```vue
<!-- apps/web/src/components/assessment/AssessmentForm.vue -->

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { assessmentApi } from '@/api/assessment';
import { useToast } from '@/components/ui/toast';
import type { InterviewAssessment, AssessmentDimension } from '@ims/shared';

interface Props {
  candidateId: string;
  interviewId: string;
  initialData?: InterviewAssessment;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  submit: [assessment: InterviewAssessment];
}>();

const { toast } = useToast();

// 评估维度
const dimensions: AssessmentDimension[] = [
  { id: 'technical', name: '技术能力', weight: 0.3, maxScore: 100 },
  { id: 'communication', name: '沟通能力', weight: 0.2, maxScore: 100 },
  { id: 'problem_solving', name: '问题解决', weight: 0.2, maxScore: 100 },
  { id: 'culture_fit', name: '文化匹配', weight: 0.15, maxScore: 100 },
  { id: 'potential', name: '发展潜力', weight: 0.15, maxScore: 100 },
];

// 表单数据
const scores = ref<Record<string, number>>({});
const strengths = ref<string[]>(['']);
const weaknesses = ref<string[]>(['']);
const notes = ref('');
const recommendation = ref<'hire' | 'consider' | 'reject'>('consider');

// 初始化数据
watch(() => props.initialData, (data) => {
  if (data) {
    scores.value = { ...data.scores };
    strengths.value = data.strengths.length > 0 ? [...data.strengths] : [''];
    weaknesses.value = data.weaknesses.length > 0 ? [...data.weaknesses] : [''];
    notes.value = data.notes;
    recommendation.value = data.recommendation;
  }
}, { immediate: true });

// 计算综合得分
const overallScore = computed(() => {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const dim of dimensions) {
    const score = scores.value[dim.id] ?? 0;
    weightedSum += score * dim.weight;
    totalWeight += dim.weight;
  }
  
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
});

// 得分等级
const scoreLevel = computed(() => {
  const score = overallScore.value;
  if (score >= 90) return { text: '优秀', color: 'text-green-500' };
  if (score >= 80) return { text: '良好', color: 'text-blue-500' };
  if (score >= 70) return { text: '合格', color: 'text-yellow-500' };
  if (score >= 60) return { text: '待观察', color: 'text-orange-500' };
  return { text: '不合格', color: 'text-red-500' };
});

// 添加/删除优缺点
function addStrength() {
  strengths.value.push('');
}

function removeStrength(index: number) {
  strengths.value.splice(index, 1);
}

function addWeakness() {
  weaknesses.value.push('');
}

function removeWeakness(index: number) {
  weaknesses.value.splice(index, 1);
}

// 提交评估
async function submitAssessment() {
  try {
    const assessment = await assessmentApi.save({
      candidateId: props.candidateId,
      interviewId: props.interviewId,
      scores: scores.value,
      strengths: strengths.value.filter(s => s.trim()),
      weaknesses: weaknesses.value.filter(w => w.trim()),
      notes: notes.value,
      recommendation: recommendation.value,
    });
    
    toast({ title: '评估提交成功' });
    emit('submit', assessment);
  } catch (error) {
    toast({ 
      title: '提交失败', 
      description: error instanceof Error ? error.message : '未知错误',
      variant: 'destructive',
    });
  }
}
</script>

<template>
  <div class="assessment-form space-y-6">
    <!-- 评分维度 -->
    <Card>
      <CardHeader>
        <CardTitle>能力评分</CardTitle>
        <CardDescription>对各维度进行评分（0-100）</CardDescription>
      </CardHeader>
      
      <CardContent class="space-y-4">
        <div v-for="dim in dimensions" :key="dim.id" class="dimension-item">
          <div class="flex items-center justify-between mb-2">
            <Label>{{ dim.name }}</Label>
            <span class="text-sm text-muted-foreground">权重 {{ (dim.weight * 100).toFixed(0) }}%</span>
          </div>
          <div class="flex items-center gap-4">
            <Slider
              v-model="scores[dim.id]"
              :default-value="[0]"
              :max="100"
              :step="1"
              class="flex-1"
            />
            <Input
              v-model.number="scores[dim.id]"
              type="number"
              min="0"
              max="100"
              class="w-20"
            />
          </div>
        </div>
        
        <!-- 综合得分 -->
        <div class="pt-4 border-t">
          <div class="flex items-center justify-between">
            <span class="font-medium">综合得分</span>
            <div class="flex items-center gap-2">
              <span class="text-2xl font-bold" :class="scoreLevel.color">
                {{ overallScore }}
              </span>
              <Badge :variant="overallScore >= 80 ? 'default' : 'secondary'">
                {{ scoreLevel.text }}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    
    <!-- 亮点与不足 -->
    <Card>
      <CardHeader>
        <CardTitle>综合评价</CardTitle>
      </CardHeader>
      
      <CardContent class="space-y-4">
        <!-- 亮点 -->
        <div>
          <Label class="mb-2 block">主要亮点</Label>
          <div v-for="(strength, index) in strengths" :key="index" class="flex gap-2 mb-2">
            <Input v-model="strengths[index]" placeholder="输入亮点..." />
            <Button variant="ghost" size="icon" @click="removeStrength(index)">
              <X class="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" @click="addStrength">
            <Plus class="h-4 w-4 mr-2" />
            添加亮点
          </Button>
        </div>
        
        <!-- 不足 -->
        <div>
          <Label class="mb-2 block">待提升项</Label>
          <div v-for="(weakness, index) in weaknesses" :key="index" class="flex gap-2 mb-2">
            <Input v-model="weaknesses[index]" placeholder="输入待提升项..." />
            <Button variant="ghost" size="icon" @click="removeWeakness(index)">
              <X class="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" @click="addWeakness">
            <Plus class="h-4 w-4 mr-2" />
            添加待提升项
          </Button>
        </div>
        
        <!-- 备注 -->
        <div>
          <Label class="mb-2 block">备注</Label>
          <Textarea v-model="notes" placeholder="补充说明..." rows="3" />
        </div>
      </CardContent>
    </Card>
    
    <!-- 推荐结论 -->
    <Card>
      <CardHeader>
        <CardTitle>推荐结论</CardTitle>
      </CardHeader>
      
      <CardContent>
        <RadioGroup v-model="recommendation" class="flex gap-4">
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="hire" value="hire" />
            <Label for="hire" class="text-green-600">建议录用</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="consider" value="consider" />
            <Label for="consider" class="text-yellow-600">建议考虑</Label>
          </div>
          <div class="flex items-center space-x-2">
            <RadioGroupItem id="reject" value="reject" />
            <Label for="reject" class="text-red-600">建议不录用</Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
    
    <!-- 提交按钮 -->
    <div class="flex justify-end">
      <Button size="lg" @click="submitAssessment">
        提交评估
      </Button>
    </div>
  </div>
</template>
```

---

## 3. 任务清单

| ID | 任务 | 工期 | 依赖 | 优先级 | 验收标准 |
|----|------|------|------|--------|----------|
| P4-T1 | 设计邮件系统数据模型 | 0.5d | - | 高 | Schema 定义完成 |
| P4-T2 | 安装 nodemailer 依赖 | 0.5d | - | 高 | 依赖安装成功 |
| P4-T3 | 实现 EmailService | 2d | T1, T2 | 高 | 邮件发送成功 |
| P4-T4 | 实现邮件账号管理 UI | 1d | T3 | 中 | 可配置 SMTP |
| P4-T5 | 实现邮件模板管理 UI | 1d | T3 | 中 | 可配置模板 |
| P4-T6 | 设计面试评估数据模型 | 0.5d | - | 高 | Schema 定义完成 |
| P4-T7 | 实现 AssessmentService | 1.5d | T6 | 高 | 评估 CRUD 完整 |
| P4-T8 | 实现评估填报 UI | 1.5d | T7 | 高 | 可填报评估 |
| P4-T9 | 实现评估报告生成 | 1d | T7 | 中 | 可生成报告 |
| P4-T10 | 集成测试 | 1d | 以上全部 | 高 | 所有功能测试通过 |

**Phase 4 总工期**: 10.5 天

---

## 4. 依赖关系图

```
Phase 4 任务依赖
├── P4-T1 (邮件数据模型)
│   └── P4-T3 (EmailService)
│       ├── P4-T4 (账号管理 UI)
│       └── P4-T5 (模板管理 UI)
├── P4-T2 (安装依赖)
│   └── P4-T3 (EmailService)
├── P4-T6 (评估数据模型)
│   └── P4-T7 (AssessmentService)
│       ├── P4-T8 (评估填报 UI)
│       └── P4-T9 (报告生成)
└── P4-T3, T4, T5, T7, T8, T9
    └── P4-T10 (集成测试)

关键路径: T1 → T3 → T4/T5 → T10 = 5d
        T6 → T7 → T8 → T10 = 4d
邮件和评估可并行开发
```

---

**文档完成** ✅
