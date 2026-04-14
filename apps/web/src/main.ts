import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { pinia } from "./stores";
import { initTheme } from "./composables/use-theme";
import "./styles/main.css";

const WEB_RESET_QUERY_KEY = "ims-reset-state";

function shouldClearLocalStorageKey(key: string): boolean {
  return key === "currentColor"
    || key === "currentRadius"
    || key.startsWith("ims-")
    || key.startsWith("ims:")
    || key.startsWith("lui-");
}

function clearPersistedWebStateForInitTest(): void {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (shouldClearLocalStorageKey(key)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    window.localStorage.removeItem(key);
  }
  window.sessionStorage.clear();
}

function maybeHandleWebStateResetQuery(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(WEB_RESET_QUERY_KEY) !== "1") {
    return;
  }

  clearPersistedWebStateForInitTest();

  url.searchParams.delete(WEB_RESET_QUERY_KEY);
  const nextPath = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
  window.history.replaceState(null, "", nextPath);
}

maybeHandleWebStateResetQuery();
initTheme();

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount("#app");
