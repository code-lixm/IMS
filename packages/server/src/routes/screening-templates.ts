import type {
  CreateMatchingTemplateInput,
  UpdateMatchingTemplateInput,
} from "../../../shared/src/api-types";
import { screeningTemplatesService } from "../services/screening-templates";
import { corsHeaders, fail, ok } from "../utils/http";

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
      const deleted = await screeningTemplatesService.deleteTemplate(id);
      if (!deleted) {
        return fail("NOT_FOUND", "筛选模板不存在", 404);
      }
      return ok({ id, deleted: true });
    }
  }

  return null;
}
