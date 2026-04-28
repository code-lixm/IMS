import { computed, ref } from "vue";
import type { WhatsNewEntry } from "@ims/shared";
import whatsNew from "@/assets/whats-new.json";

const LAST_SEEN_VERSION_STORAGE_KEY = "ims_last_seen_whats_new_version";

const whatsNewData = whatsNew as WhatsNewEntry;
const currentVersion = whatsNewData.version;

const dialogVisible = ref(false);
const shouldShowWhatsNewState = ref(false);

let initialized = false;

declare global {
  interface Window {
    __test_showWhatsNew?: () => void;
  }
}

export function resolveShouldShowWhatsNew() {
  if (typeof window === "undefined") {
    return false;
  }

  const lastSeenVersion = window.localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
  return lastSeenVersion !== currentVersion;
}

export function initWhatsNew() {
  if (initialized) {
    return;
  }

  const shouldShow = resolveShouldShowWhatsNew();
  shouldShowWhatsNewState.value = import.meta.env.DEV ? false : shouldShow;
  dialogVisible.value = shouldShowWhatsNewState.value;

  if (typeof window !== "undefined" && import.meta.env.DEV) {
    window.__test_showWhatsNew = showWhatsNew;
  }

  initialized = true;
}

function showWhatsNew() {
  dialogVisible.value = true;
}

function dismissWhatsNew() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, currentVersion);
  }

  shouldShowWhatsNewState.value = false;
  dialogVisible.value = false;
}

export function useWhatsNew() {
  initWhatsNew();

  return {
    shouldShowWhatsNew: computed(() => shouldShowWhatsNewState.value),
    dialogVisible,
    showWhatsNew,
    dismissWhatsNew,
    whatsNewData,
  };
}
