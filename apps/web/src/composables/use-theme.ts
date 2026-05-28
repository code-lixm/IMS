import { computed, ref } from "vue";

export type ThemeColor = "neutral" | "zinc" | "stone" | "slate";
export type ThemeRadius = 0 | 0.3 | 0.5 | 0.75 | 1;

const COLOR_STORAGE_KEY = "ims-theme-color";
const RADIUS_STORAGE_KEY = "ims-theme-radius";
const MODE_STORAGE_KEY = "ims-theme-mode";
const MODE_USER_SET_KEY = "ims-theme-mode-user-set";

const COLOR_STORAGE_KEY_LEGACY = "currentColor";
const RADIUS_STORAGE_KEY_LEGACY = "currentRadius";

const AVAILABLE_COLORS: ThemeColor[] = [
  "neutral",
  "zinc",
  "stone",
  "slate",
];

const AVAILABLE_RADII: ThemeRadius[] = [0, 0.3, 0.5, 0.75, 1];

type ThemeVariableSet = Record<string, string>;

const IMS_DESIGN_LIGHT_THEME: ThemeVariableSet = {
  "--background": "216 100% 98.4%",
  "--foreground": "0 0% 10.2%",
  "--card": "0 0% 100%",
  "--card-foreground": "0 0% 10.2%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "0 0% 10.2%",
  "--primary": "216.9 100% 50%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "218.8 100% 96.7%",
  "--secondary-foreground": "216.9 100% 35%",
  "--muted": "210 20% 98%",
  "--muted-foreground": "215 16.3% 46.9%",
  "--accent": "218.8 100% 96.7%",
  "--accent-foreground": "216.9 100% 35%",
  "--border": "216 100% 93.5%",
  "--input": "216 100% 91.8%",
  "--ring": "216.9 100% 50%",
};

const IMS_DESIGN_DARK_THEME: ThemeVariableSet = {
  "--background": "219 29% 22%",
  "--foreground": "214 40% 94%",
  "--card": "218 28% 27%",
  "--card-foreground": "214 40% 94%",
  "--popover": "218 28% 25%",
  "--popover-foreground": "214 40% 94%",
  "--primary": "216.9 100% 62%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "218 22% 32%",
  "--secondary-foreground": "214 40% 94%",
  "--muted": "218 22% 32%",
  "--muted-foreground": "216 20% 74%",
  "--accent": "217 24% 36%",
  "--accent-foreground": "214 40% 96%",
  "--border": "217 21% 38%",
  "--input": "217 21% 38%",
  "--ring": "216.9 100% 62%",
};

const COLOR_THEME_MAP: Record<ThemeColor, { light: ThemeVariableSet; dark: ThemeVariableSet }> = {
  neutral: { light: IMS_DESIGN_LIGHT_THEME, dark: IMS_DESIGN_DARK_THEME },
  zinc: { light: IMS_DESIGN_LIGHT_THEME, dark: IMS_DESIGN_DARK_THEME },
  stone: { light: IMS_DESIGN_LIGHT_THEME, dark: IMS_DESIGN_DARK_THEME },
  slate: { light: IMS_DESIGN_LIGHT_THEME, dark: IMS_DESIGN_DARK_THEME },
};

// ── State ──────────────────────────────────────────────────────────────────────

const color = ref<ThemeColor>("neutral");
const radius = ref<ThemeRadius>(0.5);
const isDark = ref(false);
let initialized = false;

function resolveStoredDark() {
  if (typeof window === "undefined") return false;
  const userSet = window.localStorage.getItem(MODE_USER_SET_KEY) === "1";
  if (!userSet) return false;
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return false;
}

function resolveStoredColor(): ThemeColor {
  if (typeof window === "undefined") return "neutral";
  const stored = window.localStorage.getItem(COLOR_STORAGE_KEY);
  if (stored && AVAILABLE_COLORS.includes(stored as ThemeColor)) {
    return stored as ThemeColor;
  }
  // 清理旧 key
  const legacy = window.localStorage.getItem(COLOR_STORAGE_KEY_LEGACY);
  if (legacy && AVAILABLE_COLORS.includes(legacy as ThemeColor)) {
    return legacy as ThemeColor;
  }
  if (stored) {
    window.localStorage.removeItem(COLOR_STORAGE_KEY);
  }
  if (legacy) {
    window.localStorage.removeItem(COLOR_STORAGE_KEY_LEGACY);
  }
  return "neutral";
}

function resolveStoredRadius(): ThemeRadius {
  if (typeof window === "undefined") return 0.5;
  const stored = window.localStorage.getItem(RADIUS_STORAGE_KEY);
  if (stored) {
    const n = Number(stored);
    if (AVAILABLE_RADII.includes(n as ThemeRadius)) return n as ThemeRadius;
  }
  const legacy = window.localStorage.getItem(RADIUS_STORAGE_KEY_LEGACY);
  if (legacy) {
    const n = Number(legacy);
    if (AVAILABLE_RADII.includes(n as ThemeRadius)) return n as ThemeRadius;
  }
  return 0.5;
}

function applyColorTheme(c: ThemeColor) {
  if (typeof document === "undefined") return;
  for (const old of AVAILABLE_COLORS) {
    document.documentElement.classList.remove(`theme-${old}`);
  }
  const isDark = document.documentElement.classList.contains("dark");
  const overrides = isDark ? COLOR_THEME_MAP[c].dark : COLOR_THEME_MAP[c].light;
  for (const [prop, value] of Object.entries(overrides)) {
    document.documentElement.style.setProperty(prop, value);
  }
  document.documentElement.classList.add(`theme-${c}`);
  document.documentElement.classList.toggle("dark", isDark);
}

function applyRadius(r: ThemeRadius) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--radius", `${r}rem`);
}

// ── Public init (called once from main.ts) ────────────────────────────────────

export function initTheme() {
  if (initialized) return;
  isDark.value = resolveStoredDark();
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", isDark.value);
  }
  color.value = resolveStoredColor();
  radius.value = resolveStoredRadius();
  applyColorTheme(color.value);
  applyRadius(radius.value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COLOR_STORAGE_KEY, color.value);
    window.localStorage.setItem(RADIUS_STORAGE_KEY, String(radius.value));
    window.localStorage.setItem(MODE_STORAGE_KEY, isDark.value ? "dark" : "light");
  }
  initialized = true;
}

// ── Public composable ──────────────────────────────────────────────────────────

export function useTheme() {
  if (!initialized) {
    initTheme();
  }

  isDark.value = document.documentElement.classList.contains("dark");

  function toggleDark() {
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle("dark", isDark.value);
    applyColorTheme(color.value);
    window.localStorage.setItem(MODE_USER_SET_KEY, "1");
    window.localStorage.setItem(MODE_STORAGE_KEY, isDark.value ? "dark" : "light");
  }

  function setColor(c: ThemeColor) {
    if (c === color.value) return;
    color.value = c;
    applyColorTheme(c);
    window.localStorage.setItem(COLOR_STORAGE_KEY, c);
  }

  function setRadius(r: ThemeRadius) {
    if (r === radius.value) return;
    radius.value = r;
    applyRadius(r);
    window.localStorage.setItem(RADIUS_STORAGE_KEY, String(r));
  }

  return {
    color: computed(() => color.value),
    radius: computed(() => radius.value),
    isDark: computed(() => isDark.value),
    AVAILABLE_COLORS,
    AVAILABLE_RADII,
    setColor,
    setRadius,
    toggleDark,
    toggleTheme: toggleDark,
  };
}
