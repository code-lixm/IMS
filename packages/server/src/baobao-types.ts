/**
 * Baobao (getui) API types — from HAR capture
 * Base URL: https://baobao.getui.com
 * Auth: x-token header with JWT
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface BaobaoTokenPayload {
  exp: number;
  username: string;
}

export interface BaobaoUser {
  id: string;
  name: string;
  username: string;
  email: string;
  empno: string;
  department: {
    id: string;
    name: string;
    reporterId: string | null;
  };
  department_id: string;
  position_name: string;
  reporter_id: string;
}

export interface BaobaoLoginResponse {
  errno: 0;
  errcode: string;
  errmsg: string;
  data: {
    result: number;
    data: BaobaoUser;
  };
}

// ---------------------------------------------------------------------------
// Interview APIs
// ---------------------------------------------------------------------------

export interface BaobaoInterviewCount {
  today: number;
  future: number;
  pastTimes: number;
}

export interface BaobaoInterviewCountResponse {
  errno: 0;
  errcode: string;
  errmsg: string | null;
  data: BaobaoInterviewCount;
}

export interface BaobaoApplicant {
  id: number;
  interviewId?: number;
  testNo?: number;
  interviewType?: number;
  interviewResult?: number | null;
  interviewResultString?: string | null;
  name: string;
  organizationName?: string | null;
  orgAllParentName?: string | null;
  applyPosition?: string | null;
  applyPositionName?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  interviewPlace?: string | null;
  interviewUrl?: string | null;
  interviewTime?: string | number | null;
  dockingHrName?: string | null;
  dockingHrbpName?: string | null;
  status: "待面试" | "已面试" | "已取消" | string;
  resumeId?: string | null;
  recruitmentSourceName?: string | null;
  checkInTime?: number | null;
  eliminateReasonString?: string | null;
  arrivalDate?: string | null;
  remark?: string;
  resumeUrl?: string;
  interviewerNames?: string;
}

export interface BaobaoApplicantListResponse {
  errno: 0;
  errcode: string;
  errmsg: string;
  data: {
    total: number;
    pageNum: number;
    pageSize: number;
    list: BaobaoApplicant[];
  };
}

export interface BaobaoInterviewInfo {
  id: number | string;
  name: string;
  organizationName: string | null;
  applyPositionName: string | null;
  interviewTime: number | null;
  interviewType: number | null;
  interviewPlace: string | null;
  interviewResultString: string | null;
  status: string | number | null;
  interviewResult: number | null;
  positionRank: string | null;
  interviewEvaluation: string | null;
  eliminateReason: number[] | null;
  currentSalary: string | null;
  expectSalary: string | null;
  suggestSalary: string | null;
  resumeUrl?: string | null;
}

export interface BaobaoInterviewInfoResponse {
  errno: 0;
  errcode: string;
  errmsg: string | null;
  data: BaobaoInterviewInfo;
}

// ---------------------------------------------------------------------------
// Common APIs
// ---------------------------------------------------------------------------

export interface BaobaoOrganization {
  id: string;
  name: string;
  parentId?: string;
  children?: BaobaoOrganization[];
}

export interface BaobaoOrganizationResponse {
  errno: 0;
  errcode: string;
  errmsg: string;
  data: BaobaoOrganization[];
}

export interface BaobaoJobPosition {
  id: string;
  name: string;
  organizationId: string;
}

export interface BaobaoJobPositionResponse {
  errno: 0;
  errcode: string;
  errmsg: string;
  data: BaobaoJobPosition[];
}

export interface BaobaoPositionRank {
  id: string | number;
  name: string;
  level?: number | null;
}

export interface BaobaoPositionRankResponse {
  errno: 0;
  errcode: string;
  errmsg: string;
  data: BaobaoPositionRank[];
}

export interface BaobaoDictItem {
  id: string | number;
  sort?: number | null;
  type: string;
  name: string;
  code?: string | null;
  remark?: string | null;
  disabled?: boolean;
}

export interface BaobaoDictResponse {
  errno: 0;
  errcode: string;
  errmsg: string | null;
  data: BaobaoDictItem[];
}

// 淘汰原因选项（type: eliminate_reason）
export interface BaobaoEliminateReasonOption {
  id: number;
  sort: number;
  type: "eliminate_reason";
  name: string;
  code: string | null;
  remark: string | null;
  disabled: boolean;
}

export interface BaobaoEliminateReasonResponse {
  errno: 0;
  errcode: string;
  errmsg: string | null;
  data: BaobaoEliminateReasonOption[];
}

export interface BaobaoSaveInterviewRecordPayload extends Omit<BaobaoInterviewInfo, "eliminateReason"> {
  eliminateReason: number[] | null;
}

export interface BaobaoSaveInterviewRecordResponse {
  errno: number;
  errcode?: string;
  errmsg: string | null;
  data: null;
}

// ---------------------------------------------------------------------------
// File Download
// ---------------------------------------------------------------------------

export type BaobaoResumeDownloadResponse = ArrayBuffer;

// ---------------------------------------------------------------------------
// Request/Response Types
// ---------------------------------------------------------------------------

export interface BaobaoRequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown> | null;
  token: string;
}

export interface BaobaoPaginationParams {
  name?: string | null;
  organizationId?: string | null;
  applyPosition?: string | null;
  startTime?: string | null;
  status?: string | null;
  pageNum?: number;
  pageSize?: number;
}
