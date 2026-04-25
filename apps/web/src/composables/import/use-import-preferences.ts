import { ref } from "vue";

const STORAGE_KEY = "ims.import.auto-screen";
const MANUALLY_DISABLED_KEY = "ims.import.screening.manually-disabled";
const autoScreen = ref(true);
const userManuallyDisabled = ref(false);
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "true" || stored === "false") {
    autoScreen.value = stored === "true";
  }
  const disabledStored = window.localStorage.getItem(MANUALLY_DISABLED_KEY);
  if (disabledStored === "true" || disabledStored === "false") {
    userManuallyDisabled.value = disabledStored === "true";
  }
}

function persist(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, String(value));
}

function persistDisabled(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MANUALLY_DISABLED_KEY, String(value));
}

export function useImportPreferences() {
  hydrate();

  function setAutoScreen(value: boolean) {
    autoScreen.value = value;
    persist(value);
  }

  /** 系统行为：自动根据可用性开关。不改变用户手动禁用标志 */
  function setAutoScreenSystem(value: boolean) {
    autoScreen.value = value;
    persist(value);
  }

  /** 用户手动操作：记录用户意图 */
  function setAutoScreenManual(value: boolean) {
    autoScreen.value = value;
    persist(value);
    // 用户手动关闭 → 标记为手动禁用
    // 用户手动打开 → 清除手动禁用标记
    userManuallyDisabled.value = !value;
    persistDisabled(userManuallyDisabled.value);
  }

  function resetManuallyDisabled() {
    userManuallyDisabled.value = false;
    persistDisabled(false);
  }

  return {
    autoScreen,
    userManuallyDisabled,
    setAutoScreen,
    setAutoScreenSystem,
    setAutoScreenManual,
    resetManuallyDisabled,
  };
}
