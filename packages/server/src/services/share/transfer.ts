import { readFileSync } from "node:fs";
import { db } from "../../db";
import { shareRecords } from "../../schema";
import { eq } from "drizzle-orm";
import type { Device } from "./discovery";

export interface TransferResult {
  success: boolean; recordId: string; importedCandidateId?: string; error?: string;
}

export async function sendToDevice(candidateId: string, target: Device, imrPath: string): Promise<TransferResult> {
  const recordId = `share_${crypto.randomUUID()}`;
  await db.insert(shareRecords).values({ id: recordId, type: "send", candidateId, targetDeviceJson: JSON.stringify(target), exportFilePath: imrPath, status: "pending", createdAt: Date.now() });

  const targetUrl = `http://${target.ip}:${target.apiPort}/api/share/import`;
  const fileName = imrPath.split("/").pop() ?? "candidate.imr";
  const fileBuffer = readFileSync(imrPath);

  try {
    const res = await fetch(targetUrl, { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Filename": fileName, "X-Candidate-Id": candidateId }, body: fileBuffer, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const resultData = (await res.json()) as { result?: string; candidateId?: string };
    await db.update(shareRecords).set({ status: "success", resultJson: JSON.stringify(resultData), completedAt: Date.now() }).where(eq(shareRecords.id, recordId));
    return { success: true, recordId, importedCandidateId: resultData.candidateId };
  } catch (err) {
    const msg = (err as Error).message;
    await db.update(shareRecords).set({ status: "failed", resultJson: JSON.stringify({ error: msg }), completedAt: Date.now() }).where(eq(shareRecords.id, recordId));
    return { success: false, recordId, error: msg };
  }
}
