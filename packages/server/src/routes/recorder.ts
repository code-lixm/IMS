import { recorderService } from "../services/recorder";
import { corsHeaders, fail, ok } from "../utils/http";
import type { RecorderStatus } from "@ims/shared";

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export async function recorderRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/api/recordings" && request.method === "GET") {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
      const result = await recorderService.listRecordings({ limit, offset });
      return ok(result);
    } catch (error) {
      console.error("[recorder] failed to list recordings", error);
      return fail("INTERNAL_ERROR", "Failed to list recordings", 500);
    }
  }

  if (path === "/api/recordings/storage" && request.method === "GET") {
    try {
      return ok(await recorderService.getStorageUsage());
    } catch (error) {
      console.error("[recorder] failed to get storage usage", error);
      return fail("INTERNAL_ERROR", "Failed to get recorder storage usage", 500);
    }
  }

  if (path === "/api/recordings" && request.method === "POST") {
    try {
      const body = await parseJson<{
        id?: string;
        status: string;
        filePath: string;
        durationMs?: number;
        fileSizeBytes?: number;
        language?: string | null;
        liveTranscriptText?: string | null;
        finalTranscriptText?: string | null;
        transcriptJson?: string | null;
      }>(request);
      const recording = await recorderService.createRecording({
        id: body.id,
        status: (body.status || "completed") as RecorderStatus,
        filePath: body.filePath,
        durationMs: body.durationMs,
        fileSizeBytes: body.fileSizeBytes,
        language: body.language,
        liveTranscriptText: body.liveTranscriptText,
        finalTranscriptText: body.finalTranscriptText,
        transcriptJson: body.transcriptJson,
      });
      return ok({ recording }, { status: 201 });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return fail("VALIDATION_ERROR", "invalid recorder payload", 422);
      }
      console.error("[recorder] failed to create recording", error);
      return fail("INTERNAL_ERROR", "Failed to create recording", 500);
    }
  }

  const recordingMatch = path.match(/^\/api\/recordings\/([^/]+)$/);
  if (recordingMatch) {
    const recordingId = recordingMatch[1];

    if (request.method === "GET" && path.endsWith("/file")) {
      return null;
    }

    if (request.method === "GET") {
      try {
        const recording = await recorderService.getRecordingById(recordingId);
        if (!recording) {
          return fail("RECORDING_NOT_FOUND", "Recording not found", 404);
        }

        return ok({ recording });
      } catch (error) {
        console.error("[recorder] failed to get recording", error);
        return fail("INTERNAL_ERROR", "Failed to get recording", 500);
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await recorderService.deleteRecording(recordingId);
        if (!deleted) {
          return fail("RECORDING_NOT_FOUND", "Recording not found", 404);
        }

        return ok({ success: true, deletedId: recordingId });
      } catch (error) {
        console.error("[recorder] failed to delete recording", error);
        return fail("INTERNAL_ERROR", "Failed to delete recording", 500);
      }
    }
  }

  const recordingFileMatch = path.match(/^\/api\/recordings\/([^/]+)\/file$/);
  if (recordingFileMatch && request.method === "GET") {
    const recordingId = recordingFileMatch[1];

    try {
      const recording = await recorderService.getRecordingById(recordingId);
      if (!recording?.filePath) {
        return fail("RECORDING_NOT_FOUND", "Recording file not found", 404);
      }

      const file = Bun.file(recording.filePath);
      if (!(await file.exists())) {
        return fail("RECORDING_FILE_MISSING", "Recording file is missing", 404);
      }

      return new Response(file, {
        status: 200,
        headers: corsHeaders({
          "Content-Type": file.type || "audio/wav",
          "Content-Disposition": `inline; filename="${recordingId}.wav"`,
          "Cache-Control": "no-store",
        }),
      });
    } catch (error) {
      console.error("[recorder] failed to stream recording file", error);
      return fail("INTERNAL_ERROR", "Failed to stream recording file", 500);
    }
  }

  const organisedTextMatch = path.match(/^\/api\/recordings\/([^/]+)\/organised-text$/);
  if (organisedTextMatch && request.method === "PUT") {
    const recordingId = organisedTextMatch[1];

    try {
      const body = await parseJson<{ organisedText?: string }>(request);
      if (typeof body.organisedText !== "string" || !body.organisedText.trim()) {
        return fail("VALIDATION_ERROR", "organisedText is required", 422);
      }

      const recording = await recorderService.saveOrganisedText(recordingId, body.organisedText.trim());
      if (!recording) {
        return fail("RECORDING_NOT_FOUND", "Recording not found", 404);
      }

      return ok({ recording });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return fail("VALIDATION_ERROR", "invalid recorder payload", 422);
      }

      console.error("[recorder] failed to save organised text", error);
      return fail("INTERNAL_ERROR", "Failed to save organised text", 500);
    }
  }

  return null;
}
