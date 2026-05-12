import type {
  CreateMatchingTemplateInput as BaseCreateMatchingTemplateInput,
  UpdateMatchingTemplateInput as BaseUpdateMatchingTemplateInput,
} from "../../../shared/src/api-types";
import { screeningTemplatesService } from "../services/screening-templates";
import { corsHeaders, fail, ok } from "../utils/http";

type CreateMatchingTemplateInput = BaseCreateMatchingTemplateInput & {
  matchHintsJson?: string | null;
  keywordsJson?: string | null;
};

type UpdateMatchingTemplateInput = BaseUpdateMatchingTemplateInput & {
  matchHintsJson?: string | null;
  keywordsJson?: string | null;
};

interface CreateScreeningTemplateGroupInput {
  name: string;
  description?: string;
  passThreshold?: number;
  reviewThreshold?: number;
  learningEnabled?: boolean;
  templateIds?: string[];
  defaultTemplateId?: string | null;
}

interface UpdateScreeningTemplateGroupInput {
  name?: string;
  description?: string;
  passThreshold?: number;
  reviewThreshold?: number;
  learningEnabled?: boolean;
}

interface UpdateScreeningTemplateGroupTemplatesInput {
  templateIds: string[];
  defaultTemplateId?: string | null;
}

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export async function screeningTemplatesRoute(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/api/screening/template-groups") {
    if (request.method === "GET") {
      const items = await screeningTemplatesService.listGroups();
      return ok(items);
    }

    if (request.method === "POST") {
      const body = await parseJson<CreateScreeningTemplateGroupInput>(request);
      const group = await screeningTemplatesService.createGroup(body);
      return ok(group, { status: 201 });
    }
  }

  const templateGroupTemplatesMatch = path.match(/^\/api\/screening\/template-groups\/([^/]+)\/templates$/);
  if (templateGroupTemplatesMatch && request.method === "PUT") {
    const id = templateGroupTemplatesMatch[1];
    const body = await parseJson<UpdateScreeningTemplateGroupTemplatesInput>(request);
    const group = await screeningTemplatesService.replaceGroupTemplates(id, body);
    if (!group) {
      return fail("NOT_FOUND", "模板组不存在", 404);
    }
    return ok(group);
  }

  const templateGroupMatch = path.match(/^\/api\/screening\/template-groups\/([^/]+)$/);
  if (templateGroupMatch) {
    const id = templateGroupMatch[1];

    if (request.method === "GET") {
      const group = await screeningTemplatesService.getGroup(id);
      if (!group) {
        return fail("NOT_FOUND", "模板组不存在", 404);
      }
      return ok(group);
    }

    if (request.method === "PUT") {
      const body = await parseJson<UpdateScreeningTemplateGroupInput>(request);
      const group = await screeningTemplatesService.updateGroup(id, body);
      if (!group) {
        return fail("NOT_FOUND", "模板组不存在", 404);
      }
      return ok(group);
    }

    if (request.method === "DELETE") {
      const existing = await screeningTemplatesService.getGroup(id);
      if (!existing) {
        return fail("NOT_FOUND", "模板组不存在", 404);
      }
      const deleted = await screeningTemplatesService.deleteGroup(id);
      if (!deleted) {
        return fail("CONFLICT", "模板组正在被导入批次引用，不能删除", 409);
      }
      return ok({ id, deleted: true });
    }
  }

  if (path === "/api/screening/templates") {
    if (request.method === "GET") {
      const items = await screeningTemplatesService.listTemplates();
      return ok({ items });
    }

    if (request.method === "POST") {
      const body = await parseJson<CreateMatchingTemplateInput>(request);
      const template = await screeningTemplatesService.createTemplate(body);
      return ok(template, { status: 201 });
    }
  }

  // POST /api/screening/templates/:id/default — must match before generic :id
  const defaultMatch = path.match(
    /^\/api\/screening\/templates\/([^/]+)\/default$/,
  );
  if (defaultMatch && request.method === "POST") {
    const id = defaultMatch[1];
    const template = await screeningTemplatesService.setDefaultTemplate(id);
    if (!template) {
      return fail("NOT_FOUND", "筛选模板不存在", 404);
    }
    return ok(template);
  }

  const templateMatch = path.match(/^\/api\/screening\/templates\/([^/]+)$/);
  if (templateMatch) {
    const id = templateMatch[1];

    if (request.method === "GET") {
      const template = await screeningTemplatesService.getTemplate(id);
      if (!template) {
        return fail("NOT_FOUND", "筛选模板不存在", 404);
      }
      return ok(template);
    }

    if (request.method === "PUT") {
      const body = await parseJson<UpdateMatchingTemplateInput>(request);
      const template = await screeningTemplatesService.updateTemplate(id, body);
      if (!template) {
        return fail("NOT_FOUND", "筛选模板不存在", 404);
      }
      return ok(template);
    }

    if (request.method === "DELETE") {
      const existing = await screeningTemplatesService.getTemplate(id);
      if (!existing) {
        return fail("NOT_FOUND", "筛选模板不存在", 404);
      }

      const usingGroups = await screeningTemplatesService.listGroupsUsingTemplate(id);
      if (usingGroups.length > 0) {
        const names = usingGroups.map((group) => `「${group.name}」`).join("、");
        return fail("CONFLICT", `模板仍被以下分组使用：${names}。请先调整分组中的模板绑定后再删除。`, 409);
      }

      const deleted = await screeningTemplatesService.deleteTemplate(id);
      if (!deleted) {
        return fail("NOT_FOUND", "筛选模板不存在", 404);
      }

      return ok({ id, deleted: true });
    }
  }

  return null;
}
