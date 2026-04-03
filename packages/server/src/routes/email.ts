import type {
  CreateEmailConfigInput,
  CreateEmailTemplateInput,
  SendEmailInput,
  UpdateEmailConfigInput,
  UpdateEmailTemplateInput,
} from "../../../shared/src/api-types";
import { emailService, EmailServiceError } from "../services/email";
import { corsHeaders, fail, ok } from "../utils/http";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function toErrorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof EmailServiceError) {
    return fail(error.code, error.message, error.status);
  }

  console.error("[email]", fallbackMessage, error);
  return fail("INTERNAL_ERROR", fallbackMessage, 500);
}

export async function emailRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/api/email/configs") {
    if (request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId") ?? undefined;
        const items = await emailService.listConfigs(userId);
        return ok({ items });
      } catch (error) {
        return toErrorResponse(error, "获取邮件配置失败");
      }
    }

    if (request.method === "POST") {
      try {
        const body = await parseJson<CreateEmailConfigInput>(request);
        const config = await emailService.createConfig(body);
        return ok(config, { status: 201 });
      } catch (error) {
        return toErrorResponse(error, "创建邮件配置失败");
      }
    }
  }

  const configMatch = path.match(/^\/api\/email\/configs\/([^/]+)$/);
  if (configMatch) {
    const id = configMatch[1];

    if (request.method === "PUT") {
      try {
        const body = await parseJson<UpdateEmailConfigInput>(request);
        const config = await emailService.updateConfig(id, body);
        if (!config) {
          return fail("NOT_FOUND", "邮件配置不存在", 404);
        }
        return ok(config);
      } catch (error) {
        return toErrorResponse(error, "更新邮件配置失败");
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await emailService.deleteConfig(id);
        if (!deleted) {
          return fail("NOT_FOUND", "邮件配置不存在", 404);
        }
        return ok({ success: true, deletedId: id });
      } catch (error) {
        return toErrorResponse(error, "删除邮件配置失败");
      }
    }
  }

  if (path === "/api/email/templates") {
    if (request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId") ?? undefined;
        const items = await emailService.listTemplates(userId);
        return ok({ items });
      } catch (error) {
        return toErrorResponse(error, "获取邮件模板失败");
      }
    }

    if (request.method === "POST") {
      try {
        const body = await parseJson<CreateEmailTemplateInput>(request);
        const template = await emailService.createTemplate(body);
        return ok(template, { status: 201 });
      } catch (error) {
        return toErrorResponse(error, "创建邮件模板失败");
      }
    }
  }

  const templateMatch = path.match(/^\/api\/email\/templates\/([^/]+)$/);
  if (templateMatch) {
    const id = templateMatch[1];

    if (request.method === "PUT") {
      try {
        const body = await parseJson<UpdateEmailTemplateInput>(request);
        const template = await emailService.updateTemplate(id, body);
        if (!template) {
          return fail("NOT_FOUND", "邮件模板不存在", 404);
        }
        return ok(template);
      } catch (error) {
        return toErrorResponse(error, "更新邮件模板失败");
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await emailService.deleteTemplate(id);
        if (!deleted) {
          return fail("NOT_FOUND", "邮件模板不存在", 404);
        }
        return ok({ success: true, deletedId: id });
      } catch (error) {
        return toErrorResponse(error, "删除邮件模板失败");
      }
    }
  }

  if (path === "/api/email/send" && request.method === "POST") {
    try {
      const body = await parseJson<SendEmailInput>(request);
      const result = await emailService.sendEmail(body);
      return ok(result, { status: 201 });
    } catch (error) {
      return toErrorResponse(error, "发送邮件失败");
    }
  }

  return null;
}
