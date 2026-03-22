/**
 * Online transfer — sends an .imr file to a discovered LAN device.
 *
 * Strategy:
 *  1. POST the .imr file to target's /api/share/import endpoint
 *  2. Target responds with import result
 *  3. Return success/failure to caller
 */

import { readFileSync } from "node:fs";
import type { Device } from "./discovery";
import { db } from "../../db";
import { shareRecords } from "../../schema";
import { eq } from "drizzle-orm";

export interface TransferResult {
  success: boolean;
  recordId: string;
  importedCandidateId?: string;
  error?: string;
}

/**
 * Send a candidate .imr export to a target device.
 *
 * @param candidateId  local candidate to send
 * @param target       discovered device info
 * @param imrPath      path to the .imr file on disk
 */
export async function sendToDevice(
  candidateId: string,
  target: Device,
  imrPath: string
): Promise<TransferResult> {
  const recordId = `share_${crypto.randomUUID()}`;
  const fileName = imrPath.split("/").pop() ?? "candidate.imr";
  const fileBuffer = readFileSync(imrPath);

  await db.insert(shareRecords).values({
    id: recordId,
    type: "send",
    candidateId,
    targetDeviceJson: JSON.stringify(target),
    exportFilePath: imrPath,
    status: "pending",
    createdAt: Date.now(),
  });

  const targetUrl = `http://${target.ip}:${target.apiPort}/api/share/import`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": fileName,
        "X-Candidate-Id": candidateId,
      },
      body: fileBuffer,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      await db
        .update(shareRecords)
        .set({ status: "failed", resultJson: JSON.stringify({ error: errText }), completedAt: Date.now() })
        .where(eq(shareRecords.id, recordId));

      return { success: false, recordId, error: `HTTP ${res.status}: ${errText}` };
    }

    let resultData: { result?: string; candidateId?: string } = {};
    try {
      resultData = (await res.json()) as { result?: string; candidateId?: string };
    } catch {}

    await db
      .update(shareRecords)
      .set({
        status: "success",
        resultJson: JSON.stringify(resultData),
        completedAt: Date.now(),
      })
      .where(eq(shareRecords.id, recordId));

    return {
      success: true,
      recordId,
      importedCandidateId: resultData.candidateId,
    };
  } catch (err) {
    const msg = (err as Error).message;
    await db
      .update(shareRecords)
      .set({ status: "failed", resultJson: JSON.stringify({ error: msg }), completedAt: Date.now() })
      .where(eq(shareRecords.id, recordId));

    return { success: false, recordId, error: msg };
  }
}
