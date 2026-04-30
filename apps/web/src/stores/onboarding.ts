import { computed, ref } from "vue";
import { defineStore } from "pinia";

const STORAGE_KEY = "ims-onboarding";
const TOUR_VERSION = "2026-04-12";

export type OnboardingRunSource = "auto" | "manual";

interface PersistedOnboardingState {
  version: string;
  completed: boolean;
  completedAt: number | null;
}

function readPersistedState(): PersistedOnboardingState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedOnboardingState;
    if (parsed.version !== TOUR_VERSION) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function persistState(state: PersistedOnboardingState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useOnboardingStore = defineStore("onboarding", () => {
  const hydrated = ref(false);
  const completed = ref(false);
  const completedAt = ref<number | null>(null);
  const isActive = ref(false);
  const requestedRunId = ref(0);
  const lastRunSource = ref<OnboardingRunSource | null>(null);
  const initialSyncReady = ref(false);

  function hydrate() {
    if (hydrated.value) {
      return;
    }

    const persisted = readPersistedState();
    completed.value = persisted?.completed ?? false;
    completedAt.value = persisted?.completedAt ?? null;
    hydrated.value = true;
  }

  function save() {
    persistState({
      version: TOUR_VERSION,
      completed: completed.value,
      completedAt: completedAt.value,
    });
  }

  function setActive(value: boolean) {
    isActive.value = value;
  }

  function setInitialSyncReady(value: boolean) {
    initialSyncReady.value = value;
  }

  function setRunSource(value: OnboardingRunSource | null) {
    lastRunSource.value = value;
  }

  function requestStart(options?: { force?: boolean; source?: OnboardingRunSource }) {
    if (options?.force) {
      completed.value = false;
      completedAt.value = null;
      save();
    }

    lastRunSource.value = options?.source ?? "manual";
    requestedRunId.value += 1;
  }

  function markCompleted() {
    completed.value = true;
    completedAt.value = Date.now();
    isActive.value = false;
    save();
  }

  function dismiss() {
    markCompleted();
  }

  const canAutoStart = computed(() =>
    hydrated.value
    && !completed.value
    && (initialSyncReady.value || lastRunSource.value === "auto"),
  );

  return {
    hydrated,
    completed,
    completedAt,
    isActive,
    requestedRunId,
    lastRunSource,
    initialSyncReady,
    canAutoStart,
    hydrate,
    setActive,
    setInitialSyncReady,
    setRunSource,
    requestStart,
    markCompleted,
    dismiss,
  };
});
