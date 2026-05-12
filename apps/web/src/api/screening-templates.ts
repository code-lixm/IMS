import { api } from "./client";
import type {
  MatchingTemplate,
  MatchingTemplateListData,
  CreateMatchingTemplateInput,
  UpdateMatchingTemplateInput,
  ScreeningTemplateGroupListData,
  ScreeningTemplateGroupDetailData,
  CreateScreeningTemplateGroupInput,
  UpdateScreeningTemplateGroupInput,
  UpdateScreeningTemplateGroupTemplatesInput,
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

  setDefault(id: string) {
    return api<MatchingTemplate>(`/api/screening/templates/${id}/default`, {
      method: "POST",
    });
  },
  listGroups() {
    return api<ScreeningTemplateGroupListData>("/api/screening/template-groups");
  },

  getGroup(id: string) {
    return api<ScreeningTemplateGroupDetailData>(`/api/screening/template-groups/${id}`);
  },

  createGroup(data: CreateScreeningTemplateGroupInput) {
    return api<ScreeningTemplateGroupDetailData>("/api/screening/template-groups", {
      method: "POST",
      json: data,
    });
  },

  updateGroup(id: string, data: UpdateScreeningTemplateGroupInput) {
    return api<ScreeningTemplateGroupDetailData>(`/api/screening/template-groups/${id}`, {
      method: "PUT",
      json: data,
    });
  },

  updateGroupTemplates(id: string, data: UpdateScreeningTemplateGroupTemplatesInput) {
    return api<ScreeningTemplateGroupDetailData>(`/api/screening/template-groups/${id}/templates`, {
      method: "PUT",
      json: data,
    });
  },

  deleteGroup(id: string) {
    return api<{ id: string; deleted: boolean }>(`/api/screening/template-groups/${id}`, {
      method: "DELETE",
    });
  },
};
