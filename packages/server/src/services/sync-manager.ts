import { db } from "../db";
import { candidates, interviews } from "../schema";
import { eq, and, isNull } from "drizzle-orm";
import { getBaobaoClient } from "./baobao-client";

const MAX_CONSECUTIVE_ERRORS = 3;

class SyncManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs = 5000;
  private enabled = false;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;
  private consecutiveErrors = 0;

  start(intervalMs = 5000) {
    if (this.enabled && this.intervalMs === intervalMs) return;
    this.stop();
    this.intervalMs = intervalMs;
    this.enabled = true;
    this.consecutiveErrors = 0;
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
    console.log(`[sync] polling started, interval=${intervalMs}ms`);
  }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.enabled = false;
    console.log("[sync] polling stopped");
  }

  isEnabled() { return this.enabled; }
  getLastSyncAt() { return this.lastSyncAt; }
  getLastError() { return this.lastError; }

  async runOnce(): Promise<{ syncedCandidates: number; syncedInterviews: number }> {
    const before = Date.now();
    try {
      const result = await this.doSync();
      this.lastSyncAt = Date.now();
      this.lastError = null;
      this.consecutiveErrors = 0;
      console.log(`[sync] done in ${this.lastSyncAt - before}ms, syncedCandidates=${result.syncedCandidates} syncedInterviews=${result.syncedInterviews}`);
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      this.lastError = msg;
      this.consecutiveErrors++;
      console.error(`[sync] error (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { console.error("[sync] too many errors, pausing polling"); this.stop(); }
      throw err;
    }
  }

  status() {
    return { enabled: this.enabled, intervalMs: this.intervalMs, lastSyncAt: this.lastSyncAt, lastError: this.lastError, consecutiveErrors: this.consecutiveErrors };
  }

  private async tick() {
    if (!this.enabled) return;
    try { await this.runOnce(); } catch {}
  }

  private async doSync(): Promise<{ syncedCandidates: number; syncedInterviews: number }> {
    const client = getBaobaoClient();
    if (!client) {
      throw new Error("Baobao client not initialized. Please connect via /api/auth/baobao/connect");
    }

    // Fetch all interviews from Baobao (paginated)
    let totalSynced = 0;
    let page = 1;
    const pageSize = 50;
    let hasMore = true;

    while (hasMore) {
      const response = await client.getApplicantInterviewAll({
        pageNum: page,
        pageSize: pageSize,
      });

      if (response.errno !== 0) {
        throw new Error(`Baobao API error: ${response.errmsg || response.errcode}`);
      }

      const list = response.data?.list || [];
      
      for (const applicant of list) {
        await this.syncApplicantToLocal(applicant);
        totalSynced++;
      }

      hasMore = list.length === pageSize;
      page++;
    }

    // Get interview count from count API
    const countResponse = await client.getInterviewCount();
    const interviewCount = countResponse.data?.today || 0;

    return {
      syncedCandidates: totalSynced,
      syncedInterviews: interviewCount,
    };
  }

  private async syncApplicantToLocal(applicant: {
    id: number;
    name: string;
    phone?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
    applyPosition?: string | null;
    applyPositionName?: string | null;
    organizationName?: string | null;
    orgAllParentName?: string | null;
    interviewId?: number;
    interviewType?: number;
    interviewResult?: number | null;
    interviewResultString?: string | null;
    interviewTime?: string | number | null;
    interviewPlace?: string | null;
    interviewUrl?: string | null;
    dockingHrName?: string | null;
    dockingHrbpName?: string | null;
    status?: string;
    recruitmentSourceName?: string | null;
    checkInTime?: number | null;
    arrivalDate?: string | null;
    eliminateReasonString?: string | null;
    remark?: string | null;
  }): Promise<void> {
    const now = Date.now();
    const remoteCandidateId = String(applicant.id);
    const positionName = applicant.applyPositionName ?? applicant.applyPosition ?? null;
    const phoneNumber = applicant.phoneNumber ?? applicant.phone ?? null;

    // Check if candidate exists by remoteId
    const existing = await db.select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.remoteId, remoteCandidateId), isNull(candidates.deletedAt)))
      .limit(1);

    const candidateId = existing.length ? existing[0].id : `cand_${crypto.randomUUID()}`;

    if (existing.length) {
      await db.update(candidates)
        .set({
          name: applicant.name,
          phone: phoneNumber,
          email: applicant.email || null,
          position: positionName,
          organizationName: applicant.organizationName || null,
          orgAllParentName: applicant.orgAllParentName || null,
          recruitmentSourceName: applicant.recruitmentSourceName || null,
          source: "remote",
          updatedAt: now,
        })
        .where(eq(candidates.id, candidateId));
    } else {
      await db.insert(candidates).values({
        id: candidateId,
        source: "remote",
        remoteId: remoteCandidateId,
        name: applicant.name,
        phone: phoneNumber,
        email: applicant.email || null,
        position: positionName,
        organizationName: applicant.organizationName || null,
        orgAllParentName: applicant.orgAllParentName || null,
        recruitmentSourceName: applicant.recruitmentSourceName || null,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (applicant.interviewId || applicant.interviewTime) {
      const remoteInterviewId = applicant.interviewId ? String(applicant.interviewId) : null;
      const scheduledAt = this.parseInterviewTime(applicant.interviewTime);
      const existingInterview = remoteInterviewId
        ? await db.select({ id: interviews.id })
          .from(interviews)
          .where(eq(interviews.remoteId, remoteInterviewId))
          .limit(1)
        : [];

      const interviewPayload = {
        candidateId,
        remoteId: remoteInterviewId,
        round: 1,
        status: this.mapInterviewStatus(applicant.status),
        statusRaw: applicant.status ?? null,
        interviewType: applicant.interviewType ?? null,
        interviewResult: applicant.interviewResult ?? null,
        interviewResultString: applicant.interviewResultString ?? null,
        scheduledAt,
        interviewPlace: applicant.interviewPlace ?? null,
        meetingLink: applicant.interviewUrl ?? null,
        dockingHrName: applicant.dockingHrName ?? null,
        dockingHrbpName: applicant.dockingHrbpName ?? null,
        checkInTime: applicant.checkInTime ?? null,
        arrivalDate: applicant.arrivalDate ?? null,
        eliminateReasonString: applicant.eliminateReasonString ?? null,
        remark: applicant.remark ?? null,
        updatedAt: now,
      };

      if (existingInterview.length) {
        await db.update(interviews)
          .set(interviewPayload)
          .where(eq(interviews.id, existingInterview[0].id));
      } else {
        await db.insert(interviews).values({
          id: `intv_${crypto.randomUUID()}`,
          ...interviewPayload,
          interviewerIdsJson: JSON.stringify([]),
          manualEvaluationJson: null,
          createdAt: now,
        });
      }
    }
  }

  private parseInterviewTime(interviewTime?: string | number | null): number | null {
    if (typeof interviewTime === "number") {
      return Number.isFinite(interviewTime) ? interviewTime : null;
    }

    if (typeof interviewTime === "string" && interviewTime.trim()) {
      const parsed = new Date(interviewTime).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private mapInterviewStatus(baobaoStatus?: string): string {
    const statusText = typeof baobaoStatus === "string" ? baobaoStatus : String(baobaoStatus ?? "");
    if (!statusText) return "scheduled";
    if (statusText.includes("待面试")) return "scheduled";
    if (statusText.includes("已面试")) return "completed";
    if (statusText.includes("已取消")) return "cancelled";
    return "scheduled";
  }
}

export const syncManager = new SyncManager();
