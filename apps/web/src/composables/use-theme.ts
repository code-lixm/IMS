import { computed, ref, watch } from "vue";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "ims-theme";
const theme = ref<ThemeMode>("light");
const initialized = ref(false);

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initTheme() {
  const resolvedTheme = resolveInitialTheme();
  theme.value = resolvedTheme;
  applyTheme(resolvedTheme);
  initialized.value = true;
}

watch(theme, (mode) => {
  if (!initialized.value) return;
  applyTheme(mode);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  }
});

export function useTheme() {
  if (!initialized.value) {
    initTheme();
  }

  const isDark = computed(() => theme.value === "dark");

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  return { theme, isDark, toggleTheme };
}
