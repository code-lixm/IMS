import type {
  RecorderDetailData,
  RecorderListData,
  UpdateRecorderOrganisedTextInput,
} from "@ims/shared";
import { api } from "./client";

interface RecorderListOptions {
  limit?: number;
  offset?: number;
}

interface RequestOptions {
  signal?: AbortSignal;
}

function buildListPath(options?: RecorderListOptions) {
  const query = new URLSearchParams();

  if (typeof options?.limit === "number") {
    query.set("limit", String(options.limit));
  }

  if (typeof options?.offset === "number") {
    query.set("offset", String(options.offset));
  }

  const search = query.toString();
  return search ? `/api/recordings?${search}` : "/api/recordings";
}

export const recorderApi = {
  list(options?: RecorderListOptions, requestOptions?: RequestOptions) {
    return api<RecorderListData>(buildListPath(options), {
      signal: requestOptions?.signal,
    });
  },
  get(recordingId: string, requestOptions?: RequestOptions) {
    return api<RecorderDetailData>(`/api/recordings/${recordingId}`, {
      signal: requestOptions?.signal,
    });
  },
  saveOrganisedText(recordingId: string, payload: UpdateRecorderOrganisedTextInput) {
    return api<RecorderDetailData>(`/api/recordings/${recordingId}/organised-text`, {
      method: "PUT",
      json: payload,
    });
  },
  remove(recordingId: string) {
    return api<{ success: boolean; deletedId: string }>(`/api/recordings/${recordingId}`, {
      method: "DELETE",
    });
  },
};
