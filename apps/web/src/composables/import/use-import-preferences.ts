import { ref } from "vue";

const STORAGE_KEY = "ims.import.auto-screen";
const autoScreen = ref(true);
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
}

function persist(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, String(value));
}

export function useImportPreferences() {
  hydrate();

  function setAutoScreen(value: boolean) {
    autoScreen.value = value;
    persist(value);
  }

  return {
    autoScreen,
    setAutoScreen,
  };
}
