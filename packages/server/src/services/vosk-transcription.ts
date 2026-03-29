import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { config } from "../config";

const VOSK_MODEL_NAME = "vosk-model-small-cn-0.22";
const VOSK_MODEL_URL = `https://alphacephei.com/vosk/models/${VOSK_MODEL_NAME}.zip`;
const VOSK_ROOT_DIR = join(config.dataDir, "vosk");
const VOSK_MODEL_DIR = join(VOSK_ROOT_DIR, VOSK_MODEL_NAME);
const VOSK_MODEL_SENTINEL = join(VOSK_MODEL_DIR, "am", "final.mdl");
const VOSK_VENV_DIR = join(VOSK_ROOT_DIR, ".venv");
const VOSK_PYTHON_PATH = join(VOSK_VENV_DIR, "bin", "python");
const VOSK_WORKER_PATH = fileURLToPath(new URL("./vosk-worker.py", import.meta.url));

type PendingWorkerRequest = {
  resolve: (value: VoskTranscriptionResult) => void;
  reject: (reason?: unknown) => void;
};

export type VoskTranscriptionInput = {
  sessionId: string;
  audioBuffer: Uint8Array | null;
  sampleRate: number;
  finalize: boolean;
};

export type VoskTranscriptionResult = {
  sessionId: string;
  transcript: string;
  final: boolean;
};

let bootstrapPromise: Promise<void> | null = null;
let workerReadyPromise: Promise<void> | null = null;
let workerProcess: ChildProcessWithoutNullStreams | null = null;
let workerStdoutBuffer = "";
let requestCounter = 0;
const pendingRequests = new Map<string, PendingWorkerRequest>();

function fileExists(path: string) {
  return access(path, constants.F_OK).then(
    () => true,
    () => false,
  );
}

async function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function ensurePythonVenv() {
  if (await fileExists(VOSK_PYTHON_PATH)) {
    return;
  }

  await mkdir(VOSK_ROOT_DIR, { recursive: true });
  await runCommand("python3", ["-m", "venv", VOSK_VENV_DIR]);
}

async function ensurePythonVosk() {
  await ensurePythonVenv();
  await runCommand(VOSK_PYTHON_PATH, ["-c", "import vosk" ]).catch(async () => {
    await runCommand(VOSK_PYTHON_PATH, ["-m", "pip", "install", "--upgrade", "pip"]);
    await runCommand(VOSK_PYTHON_PATH, ["-m", "pip", "install", "vosk"]);
  });
}

async function ensureVoskModel() {
  if (await fileExists(VOSK_MODEL_SENTINEL)) {
    return;
  }

  await mkdir(VOSK_ROOT_DIR, { recursive: true });
  const response = await fetch(VOSK_MODEL_URL);
  if (!response.ok) {
    throw new Error(`failed to download Vosk model: ${response.status} ${response.statusText}`);
  }

  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(archiveBuffer);

  for (const [relativePath, entry] of Object.entries(zip.files)) {
    const targetPath = join(VOSK_ROOT_DIR, relativePath);
    if (entry.dir) {
      await mkdir(targetPath, { recursive: true });
      continue;
    }

    await mkdir(dirname(targetPath), { recursive: true });
    const data = await entry.async("nodebuffer");
    await writeFile(targetPath, data);
  }

  if (!(await fileExists(VOSK_MODEL_SENTINEL))) {
    throw new Error("downloaded Vosk model but final.mdl was not found");
  }
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensurePythonVosk();
      await ensureVoskModel();
    })();
  }
  await bootstrapPromise;
}

function handleWorkerStdout(data: string) {
  workerStdoutBuffer += data;
  const lines = workerStdoutBuffer.split("\n");
  workerStdoutBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const responseId = typeof payload.id === "string" ? payload.id : null;
    if (payload.type === "error" && !responseId) {
      const errorMessage = typeof payload.message === "string" ? payload.message : "vosk-worker-error";
      const error = new Error(errorMessage);
      for (const pending of pendingRequests.values()) {
        pending.reject(error);
      }
      pendingRequests.clear();
      continue;
    }

    if (!responseId) {
      continue;
    }

    const pending = pendingRequests.get(responseId);
    if (!pending) continue;
    pendingRequests.delete(responseId);

    if (typeof payload.error === "string") {
      pending.reject(new Error(payload.error));
      continue;
    }

    pending.resolve({
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : "",
      transcript: typeof payload.transcript === "string" ? payload.transcript : "",
      final: Boolean(payload.final),
    });
  }
}

async function ensureWorker() {
  await ensureBootstrap();
  if (workerProcess && workerReadyPromise) {
    await workerReadyPromise;
    return workerProcess;
  }

  workerProcess = spawn(VOSK_PYTHON_PATH, [VOSK_WORKER_PATH, VOSK_MODEL_DIR], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });

  workerStdoutBuffer = "";
  workerReadyPromise = new Promise<void>((resolve, reject) => {
    const handleReadyChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      workerStdoutBuffer += text;
      const lines = workerStdoutBuffer.split("\n");
      workerStdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const payload = JSON.parse(trimmed) as Record<string, unknown>;
          if (payload.type === "ready") {
            workerProcess?.stdout.off("data", handleReadyChunk);
            workerProcess?.stdout.on("data", (stdoutChunk) => handleWorkerStdout(stdoutChunk.toString()));
            resolve();
            return;
          }

          if (payload.type === "error") {
            workerProcess?.stdout.off("data", handleReadyChunk);
            reject(new Error(typeof payload.message === "string" ? payload.message : "vosk-worker-startup-error"));
            return;
          }
        } catch {
          // ignore malformed startup line
        }
      }
    };

    workerProcess?.stdout.on("data", handleReadyChunk);
    workerProcess?.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.warn("[vosk] worker stderr:", message);
      }
    });
    workerProcess?.once("error", reject);
    workerProcess?.once("exit", (code) => {
      const error = new Error(`vosk worker exited with code ${code ?? -1}`);
      workerProcess = null;
      workerReadyPromise = null;
      for (const pending of pendingRequests.values()) {
        pending.reject(error);
      }
      pendingRequests.clear();
      reject(error);
    });
  });

  await workerReadyPromise;
  return workerProcess;
}

function createRequestId() {
  requestCounter += 1;
  return `vosk_${requestCounter}`;
}

export async function transcribeVoskChunk(input: VoskTranscriptionInput) {
  const worker = await ensureWorker();
  const requestId = createRequestId();
  const payload = {
    type: "transcribe",
    id: requestId,
    sessionId: input.sessionId,
    sampleRate: input.sampleRate,
    final: input.finalize,
    audio: input.audioBuffer ? Buffer.from(input.audioBuffer).toString("base64") : "",
  };

  return new Promise<VoskTranscriptionResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    worker.stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

export function stripWavHeader(buffer: Uint8Array) {
  if (buffer.length < 44) {
    throw new Error("wav-payload-too-small");
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const riff = String.fromCharCode(...buffer.slice(0, 4));
  const wave = String.fromCharCode(...buffer.slice(8, 12));
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("invalid-wav-header");
  }

  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;

  while (offset + 8 <= buffer.length) {
    const chunkId = String.fromCharCode(
      buffer[offset],
      buffer[offset + 1],
      buffer[offset + 2],
      buffer[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) {
    throw new Error("wav-data-chunk-missing");
  }
  if (channels !== 1) {
    throw new Error("vosk-requires-mono-audio");
  }
  if (bitsPerSample !== 16) {
    throw new Error("vosk-requires-16bit-pcm");
  }

  return {
    sampleRate,
    pcmBuffer: buffer.slice(dataOffset, dataOffset + dataSize),
  };
}
