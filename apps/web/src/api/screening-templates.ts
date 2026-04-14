import { api } from "./client";
import type {
  MatchingTemplate,
  MatchingTemplateListData,
  CreateMatchingTemplateInput,
  UpdateMatchingTemplateInput,
} from "@ims/shared";

export const screeningTemplatesApi = {
  list() {
    return api<MatchingTemplateListData>("/api/screening/templates");
  },

  get(id: string) {
    return api<MatchingTemplate>(`/api/screening/templates/${id}`);
  },

  create(data: CreateMatchingTemplateInput) {
    return api<MatchingTemplate>("/api/screening/templates", {
      method: "POST",
      json: data,
    });
  },

  update(id: string, data: UpdateMatchingTemplateInput) {
    return api<MatchingTemplate>(`/api/screening/templates/${id}`, {
      method: "PUT",
      json: data,
    });
  },

  remove(id: string) {
    return api<{ id: string; deleted: boolean }>(`/api/screening/templates/${id}`, {
      method: "DELETE",
    });
  },
};
