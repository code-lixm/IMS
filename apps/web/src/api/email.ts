import { api } from "./client";
import type {
  CreateEmailConfigInput,
  CreateEmailTemplateInput,
  EmailConfigListData,
  EmailTemplateListData,
  SendEmailData,
  SendEmailInput,
  UpdateEmailConfigInput,
  UpdateEmailTemplateInput,
} from "../../../../packages/shared/src/api-types";
import type {
  EmailConfig,
  EmailTemplate,
} from "../../../../packages/shared/src/db-schema";

function withUserId(path: string, userId?: string): string {
  if (!userId) {
    return path;
  }
  const params = new URLSearchParams({ userId });
  return `${path}?${params.toString()}`;
}

export const emailApi = {
  listConfigs(userId?: string): Promise<EmailConfigListData> {
    return api<EmailConfigListData>(withUserId("/api/email/configs", userId));
  },

  createConfig(input: CreateEmailConfigInput): Promise<EmailConfig> {
    return api<EmailConfig>("/api/email/configs", {
      method: "POST",
      json: input,
    });
  },

  updateConfig(id: string, input: UpdateEmailConfigInput): Promise<EmailConfig> {
    return api<EmailConfig>(`/api/email/configs/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  deleteConfig(id: string): Promise<{ success: boolean; deletedId: string }> {
    return api<{ success: boolean; deletedId: string }>(`/api/email/configs/${id}`, {
      method: "DELETE",
    });
  },

  listTemplates(userId?: string): Promise<EmailTemplateListData> {
    return api<EmailTemplateListData>(withUserId("/api/email/templates", userId));
  },

  createTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    return api<EmailTemplate>("/api/email/templates", {
      method: "POST",
      json: input,
    });
  },

  updateTemplate(id: string, input: UpdateEmailTemplateInput): Promise<EmailTemplate> {
    return api<EmailTemplate>(`/api/email/templates/${id}`, {
      method: "PUT",
      json: input,
    });
  },

  deleteTemplate(id: string): Promise<{ success: boolean; deletedId: string }> {
    return api<{ success: boolean; deletedId: string }>(`/api/email/templates/${id}`, {
      method: "DELETE",
    });
  },

  send(input: SendEmailInput): Promise<SendEmailData> {
    return api<SendEmailData>("/api/email/send", {
      method: "POST",
      json: input,
    });
  },
};
