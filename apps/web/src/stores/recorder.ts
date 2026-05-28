import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { ApiError } from "@/api/client";
import { recorderApi } from "@/api/recorder";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { createRecorderAdapter } from "@/lib/recorder";
import type { IRecorderAdapter, RecorderDiagnosticsData } from "@/lib/recorder";
import type {
  RecorderDetailData,
  RecorderLevelUpdateEventPayload,
  RecorderListItem,
  RecorderLiveTranscriptSegmentUpdateEventPayload,
  RecorderStateData,
  RecorderStatus,
  RecorderTranscriptSegment,
  RecorderStateSnapshot,
} from "@ims/shared";

function upsertTranscriptSegment(
  segments: RecorderTranscriptSegment[],
  nextSegment: RecorderTranscriptSegment,
) {
  const nextSegments = [...segments];
  const index = nextSegments.findIndex((segment) => segment.id === nextSegment.id);

  if (index >= 0) {
    nextSegments[index] = nextSegment;
  } else {
    nextSegments.push(nextSegment);
  }

  nextSegments.sort((left, right) => left.sequence - right.sequence || left.startMs - right.startMs);
  return nextSegments;
}

function isRequestAborted(error: unknown) {
  return error instanceof ApiError && error.code === "REQUEST_ABORTED";
}

// ---------------------------------------------------------------------------
// Adapter injection point
// ---------------------------------------------------------------------------
// Exported so tests can replace the adapter without touching the Tauri runtime.
// Call `injectRecorderAdapter(new FakeRecorderAdapter())` before store setup.

let _adapter: IRecorderAdapter | null = null;

export function injectRecorderAdapter(adapter: IRecorderAdapter): void {
  _adapter = adapter;
}

function getAdapter(): IRecorderAdapter {
  if (!_adapter) {
    _adapter = createRecorderAdapter();
  }
  return _adapter;
}

export const useRecorderStore = defineStore("recorder", () => {
  const { notifyError } = useAppNotifications();
  const isSupported = ref(false);
  const status = ref<RecorderStatus>("idle");
  const activeRecordingId = ref<string | null>(null);
  const durationMs = ref(0);
  const level = ref(0);
  const peakLevel = ref(0);
  const muted = ref(false);
  const liveTranscriptText = ref("");
  const finalTranscriptText = ref("");
  const organisedText = ref<string | null>(null);
  const liveTranscriptSegments = ref<RecorderTranscriptSegment[]>([]);
  const history = ref<RecorderListItem[]>([]);
  const total = ref(0);
  const current = ref<RecorderDetailData | null>(null);
  const errorCode = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);
  const updatedAt = ref<number | null>(null);
  const panelOpen = ref(false);
  const historyOpen = ref(false);
  const historyLoading = ref(false);
  const detailLoading = ref(false);
  const savingOrganised = ref(false);
  const deletingRecordingId = ref<string | null>(null);
  const pendingRecordingId = ref<string | null>(null);
  const diagnostics = ref<RecorderDiagnosticsData | null>(null);
  const diagnosticsLoading = ref(false);
  let historyRequestId = 0;
  let detailRequestId = 0;
  let completionRefreshPromise: Promise<void> | null = null;

  const hasActiveRecording = computed(() => Boolean(activeRecordingId.value));

  // --- Event subscription handles (for teardown) ---
  const unsubscribeLevel = ref<(() => void) | null>(null);
  const unsubscribeLiveSegment = ref<(() => void) | null>(null);
  const unsubscribeStateUpdate = ref<(() => void) | null>(null);

  function clearSubscriptions(): void {
    unsubscribeLevel.value?.();
    unsubscribeLevel.value = null;
    unsubscribeLiveSegment.value?.();
    unsubscribeLiveSegment.value = null;
    unsubscribeStateUpdate.value?.();
    unsubscribeStateUpdate.value = null;
  }

  function applyStateSnapshot(snapshot: RecorderStateSnapshot) {
    status.value = snapshot.status;
    activeRecordingId.value = snapshot.activeRecordingId;
    durationMs.value = snapshot.durationMs;
    liveTranscriptText.value = snapshot.liveTranscriptText;
    finalTranscriptText.value = snapshot.finalTranscriptText;
    organisedText.value = snapshot.organisedText;
    liveTranscriptSegments.value = [...snapshot.liveTranscriptSegments];
    level.value = snapshot.level;
    peakLevel.value = snapshot.peakLevel;
    muted.value = snapshot.muted;
    errorCode.value = snapshot.errorCode;
    errorMessage.value = snapshot.errorMessage;
    updatedAt.value = snapshot.updatedAt;

    if ((snapshot.status === "completed" || snapshot.status === "error") && pendingRecordingId.value) {
      void refreshCompletedRecording(pendingRecordingId.value, snapshot.status === "completed");
    }
  }

  function setSupported(nextSupported: boolean) {
    isSupported.value = nextSupported;
  }

  function setPanelOpen(nextOpen: boolean) {
    panelOpen.value = nextOpen;
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value;
  }

  function setHistoryOpen(nextOpen: boolean) {
    historyOpen.value = nextOpen;
  }

  function hydrateState(payload: RecorderStateData) {
    applyStateSnapshot(payload.state);
  }

  function applyLevelUpdate(payload: RecorderLevelUpdateEventPayload) {
    activeRecordingId.value = payload.recordingId;
    level.value = payload.level;
    peakLevel.value = payload.peakLevel;
    muted.value = payload.muted;
    updatedAt.value = payload.timestamp;
  }

  function applyLiveTranscriptSegmentUpdate(payload: RecorderLiveTranscriptSegmentUpdateEventPayload) {
    activeRecordingId.value = payload.recordingId;
    liveTranscriptText.value = payload.liveTranscriptText;
    liveTranscriptSegments.value = upsertTranscriptSegment(liveTranscriptSegments.value, payload.segment);
    updatedAt.value = payload.updatedAt;
  }

  function setHistory(items: RecorderListItem[], nextTotal = items.length) {
    history.value = [...items];
    total.value = nextTotal;
  }

  function setCurrent(detail: RecorderDetailData | null) {
    current.value = detail;
  }

  function resetSession() {
    clearSubscriptions();
    pendingRecordingId.value = null;
    completionRefreshPromise = null;
    applyStateSnapshot({
      status: "idle",
      activeRecordingId: null,
      durationMs: 0,
      liveTranscriptText: "",
      finalTranscriptText: "",
      organisedText: null,
      liveTranscriptSegments: [],
      level: 0,
      peakLevel: 0,
      muted: false,
      errorCode: null,
      errorMessage: null,
      updatedAt: Date.now(),
    });
  }

  async function startRecording() {
    const adapter = getAdapter();
    const { recordingId } = await adapter.startRecording();
    pendingRecordingId.value = recordingId;

    // Subscribe to real-time events from the adapter
    unsubscribeLevel.value = adapter.subscribeLevel(applyLevelUpdate);
    unsubscribeLiveSegment.value = adapter.subscribeLiveSegment(applyLiveTranscriptSegmentUpdate);
    unsubscribeStateUpdate.value = adapter.subscribeStateUpdate((snapshot) => {
      applyStateSnapshot(snapshot);
    });

    // Pull the initial state snapshot so the store reflects the backend
    // immediately even before the first event fires.
    try {
      const initialState = await adapter.getStatus();
      applyStateSnapshot(initialState);
    } catch {
      // Fallback: at least reflect that we are now recording
      status.value = "recording";
      activeRecordingId.value = recordingId;
      updatedAt.value = Date.now();
    }
  }

  async function stopRecording() {
    const adapter = getAdapter();
    if (status.value === "recording") {
      status.value = "stopping";
      updatedAt.value = Date.now();
    }
    await adapter.stopRecording();
    // Listeners stay alive here — the backend may push a final segment /
    // level snapshot before the "completed" state transition.
  }

  async function refreshCompletedRecording(recordingId: string, shouldLoadDetail: boolean) {
    if (completionRefreshPromise) {
      return completionRefreshPromise;
    }

    completionRefreshPromise = (async () => {
      try {
        await loadRecordings();
        if (shouldLoadDetail) {
          await loadRecordingDetail(recordingId);
        }
      } catch {
        // keep the terminal recorder state; the API error toast is emitted by loaders
      } finally {
        if (pendingRecordingId.value === recordingId) {
          pendingRecordingId.value = null;
        }
        completionRefreshPromise = null;
      }
    })();

    return completionRefreshPromise;
  }

  async function runDiagnostics() {
    diagnosticsLoading.value = true;
    try {
      const result = await getAdapter().runDiagnostics();
      diagnostics.value = result;
      return result;
    } catch (error) {
      diagnostics.value = {
        checkedAt: Date.now(),
        desktopRuntime: isSupported.value,
        activeRecording: false,
        deviceAvailable: false,
        deviceName: null,
        configAvailable: false,
        sampleRate: null,
        channels: null,
        permissionGranted: null,
        inputSignalDetected: null,
        peakLevel: null,
        muted: null,
        errorCode: "DIAGNOSTICS_FAILED",
        errorMessage: error instanceof Error ? error.message : "诊断执行失败",
        notes: ["无法完成录音自检，请检查桌面运行时和本地设备状态。"],
      };
      notifyError(reportAppError("recorder-store/run-diagnostics", error, {
        title: "录音自检失败",
        fallbackMessage: "暂时无法完成录音设备检测",
      }));
      throw error;
    } finally {
      diagnosticsLoading.value = false;
    }
  }

  async function loadRecordings(options?: { signal?: AbortSignal }) {
    const requestId = ++historyRequestId;
    historyLoading.value = true;

    try {
      const data = await recorderApi.list(undefined, options);

      if (requestId === historyRequestId) {
        setHistory(data.items, data.total);

        if (current.value && !data.items.some((item) => item.id === current.value?.recording.id)) {
          current.value = null;
        }
      }

      return data;
    } catch (error) {
      if (!isRequestAborted(error)) {
        notifyError(reportAppError("recorder-store/load-recordings", error, {
          title: "录音历史加载失败",
          fallbackMessage: "暂时无法读取录音历史",
        }));
      }

      throw error;
    } finally {
      if (requestId === historyRequestId) {
        historyLoading.value = false;
      }
    }
  }

  async function loadRecordingDetail(recordingId: string, options?: { signal?: AbortSignal }) {
    const requestId = ++detailRequestId;
    detailLoading.value = true;

    try {
      const detail = await recorderApi.get(recordingId, options);

      if (requestId === detailRequestId) {
        setCurrent(detail);
      }

      return detail;
    } catch (error) {
      if (!isRequestAborted(error)) {
        notifyError(reportAppError("recorder-store/load-recording-detail", error, {
          title: "录音详情加载失败",
          fallbackMessage: "暂时无法读取这条录音详情",
        }));
      }

      throw error;
    } finally {
      if (requestId === detailRequestId) {
        detailLoading.value = false;
      }
    }
  }

  async function saveOrganisedText(recordingId: string, nextOrganisedText: string) {
    savingOrganised.value = true;

    try {
      const detail = await recorderApi.saveOrganisedText(recordingId, {
        organisedText: nextOrganisedText.trim(),
      });

      setCurrent(detail);
      organisedText.value = detail.recording.organisedText;
      setHistory(
        history.value.map((item) => item.id === detail.recording.id
          ? {
              ...item,
              organisedText: detail.recording.organisedText,
              updatedAt: detail.recording.updatedAt,
            }
          : item),
        total.value,
      );

      return detail;
    } catch (error) {
      notifyError(reportAppError("recorder-store/save-organised-text", error, {
        title: "整理结果保存失败",
        fallbackMessage: "暂时无法保存整理结果",
      }));
      throw error;
    } finally {
      savingOrganised.value = false;
    }
  }

  async function deleteRecording(recordingId: string) {
    deletingRecordingId.value = recordingId;

    try {
      const result = await recorderApi.remove(recordingId);

      if (current.value?.recording.id === recordingId) {
        current.value = null;
      }

      if (
        activeRecordingId.value === recordingId
        && status.value !== "recording"
        && status.value !== "stopping"
        && status.value !== "transcribing"
        && status.value !== "finalizing"
      ) {
        activeRecordingId.value = null;
        durationMs.value = 0;
        liveTranscriptText.value = "";
        finalTranscriptText.value = "";
        organisedText.value = null;
        liveTranscriptSegments.value = [];
        updatedAt.value = Date.now();
      }

      await loadRecordings();
      return result;
    } catch (error) {
      notifyError(reportAppError("recorder-store/delete-recording", error, {
        title: "录音删除失败",
        fallbackMessage: "暂时无法删除这条录音记录",
      }));
      throw error;
    } finally {
      if (deletingRecordingId.value === recordingId) {
        deletingRecordingId.value = null;
      }
    }
  }

  return {
    isSupported,
    status,
    activeRecordingId,
    durationMs,
    level,
    peakLevel,
    muted,
    liveTranscriptText,
    finalTranscriptText,
    organisedText,
    liveTranscriptSegments,
    history,
    total,
    current,
    errorCode,
    errorMessage,
    updatedAt,
    panelOpen,
    historyOpen,
    historyLoading,
    detailLoading,
    savingOrganised,
    deletingRecordingId,
    diagnostics,
    diagnosticsLoading,
    hasActiveRecording,
    setSupported,
    setPanelOpen,
    togglePanel,
    setHistoryOpen,
    hydrateState,
    applyLevelUpdate,
    applyLiveTranscriptSegmentUpdate,
    setHistory,
    setCurrent,
    resetSession,
    startRecording,
    stopRecording,
    runDiagnostics,
    loadRecordings,
    loadRecordingDetail,
    saveOrganisedText,
    deleteRecording,
  };
});
