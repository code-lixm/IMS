import { computed, ref } from "vue";

export type ThemeColor = "neutral" | "zinc" | "stone" | "slate";
export type ThemeRadius = 0 | 0.3 | 0.5 | 0.75 | 1;

const COLOR_STORAGE_KEY = "ims-theme-color";
const RADIUS_STORAGE_KEY = "ims-theme-radius";
const MODE_STORAGE_KEY = "ims-theme-mode";

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

const COLOR_THEME_MAP: Record<ThemeColor, { light: ThemeVariableSet; dark: ThemeVariableSet }> = {
  neutral: {
    light: {
      "--background": "0 0% 100%",
      "--foreground": "0 0% 3.9%",
      "--card": "0 0% 100%",
      "--card-foreground": "0 0% 3.9%",
      "--popover": "0 0% 100%",
      "--popover-foreground": "0 0% 3.9%",
      "--primary": "0 0% 9%",
      "--primary-foreground": "0 0% 98%",
      "--secondary": "0 0% 96.1%",
      "--secondary-foreground": "0 0% 9%",
      "--muted": "0 0% 96.1%",
      "--muted-foreground": "0 0% 45.1%",
      "--accent": "0 0% 96.1%",
      "--accent-foreground": "0 0% 9%",
      "--border": "0 0% 89.8%",
      "--input": "0 0% 89.8%",
      "--ring": "0 0% 3.9%",
    },
    dark: {
      "--background": "0 0% 3.9%",
      "--foreground": "0 0% 98%",
      "--card": "0 0% 3.9%",
      "--card-foreground": "0 0% 98%",
      "--popover": "0 0% 3.9%",
      "--popover-foreground": "0 0% 98%",
      "--primary": "0 0% 98%",
      "--primary-foreground": "0 0% 9%",
      "--secondary": "0 0% 14.9%",
      "--secondary-foreground": "0 0% 98%",
      "--muted": "0 0% 14.9%",
      "--muted-foreground": "0 0% 63.9%",
      "--accent": "0 0% 14.9%",
      "--accent-foreground": "0 0% 98%",
      "--border": "0 0% 14.9%",
      "--input": "0 0% 14.9%",
      "--ring": "0 0% 83.1%",
    },
  },
  zinc: {
    light: {
      "--background": "240 10% 98.5%",
      "--foreground": "240 10% 3.9%",
      "--card": "240 10% 99.2%",
      "--card-foreground": "240 10% 3.9%",
      "--popover": "240 10% 99.2%",
      "--popover-foreground": "240 10% 3.9%",
      "--primary": "240 5.9% 10%",
      "--primary-foreground": "0 0% 98%",
      "--secondary": "240 5% 94.8%",
      "--secondary-foreground": "240 5.9% 10%",
      "--muted": "240 5% 95.8%",
      "--muted-foreground": "240 3.8% 46.1%",
      "--accent": "240 5% 93.8%",
      "--accent-foreground": "240 5.9% 10%",
      "--border": "240 6% 88%",
      "--input": "240 6% 88%",
      "--ring": "240 5.9% 10%",
    },
    dark: {
      "--background": "240 10% 3.9%",
      "--foreground": "0 0% 98%",
      "--card": "240 10% 3.9%",
      "--card-foreground": "0 0% 98%",
      "--popover": "240 10% 3.9%",
      "--popover-foreground": "0 0% 98%",
      "--primary": "0 0% 98%",
      "--primary-foreground": "240 5.9% 10%",
      "--secondary": "240 3.7% 15.9%",
      "--secondary-foreground": "0 0% 98%",
      "--muted": "240 3.7% 15.9%",
      "--muted-foreground": "240 5% 64.9%",
      "--accent": "240 3.7% 15.9%",
      "--accent-foreground": "0 0% 98%",
      "--border": "240 3.7% 15.9%",
      "--input": "240 3.7% 15.9%",
      "--ring": "240 4.9% 83.9%",
    },
  },
  stone: {
    light: {
      "--background": "30 25% 98.2%",
      "--foreground": "20 14.3% 4.1%",
      "--card": "30 30% 99.2%",
      "--card-foreground": "20 14.3% 4.1%",
      "--popover": "30 30% 99.2%",
      "--popover-foreground": "20 14.3% 4.1%",
      "--primary": "24 9.8% 10%",
      "--primary-foreground": "60 9.1% 97.8%",
      "--secondary": "32 18% 93.8%",
      "--secondary-foreground": "24 9.8% 10%",
      "--muted": "32 18% 95%",
      "--muted-foreground": "25 5.3% 44.7%",
      "--accent": "28 20% 92.4%",
      "--accent-foreground": "24 9.8% 10%",
      "--border": "24 10% 86%",
      "--input": "24 10% 86%",
      "--ring": "24 9.8% 10%",
    },
    dark: {
      "--background": "20 14.3% 4.1%",
      "--foreground": "60 9.1% 97.8%",
      "--card": "20 14.3% 4.1%",
      "--card-foreground": "60 9.1% 97.8%",
      "--popover": "20 14.3% 4.1%",
      "--popover-foreground": "60 9.1% 97.8%",
      "--primary": "60 9.1% 97.8%",
      "--primary-foreground": "24 9.8% 10%",
      "--secondary": "12 6.5% 15.1%",
      "--secondary-foreground": "60 9.1% 97.8%",
      "--muted": "12 6.5% 15.1%",
      "--muted-foreground": "24 5.4% 63.9%",
      "--accent": "12 6.5% 15.1%",
      "--accent-foreground": "60 9.1% 97.8%",
      "--border": "12 6.5% 15.1%",
      "--input": "12 6.5% 15.1%",
      "--ring": "24 5.7% 82.9%",
    },
  },
  slate: {
    light: {
      "--background": "210 25% 97.8%",
      "--foreground": "222.2 84% 4.9%",
      "--card": "210 30% 99.1%",
      "--card-foreground": "222.2 84% 4.9%",
      "--popover": "210 30% 99.1%",
      "--popover-foreground": "222.2 84% 4.9%",
      "--primary": "222.2 47.4% 11.2%",
      "--primary-foreground": "210 40% 98%",
      "--secondary": "214 32% 93.6%",
      "--secondary-foreground": "222.2 47.4% 11.2%",
      "--muted": "214 30% 95.2%",
      "--muted-foreground": "215.4 16.3% 46.9%",
      "--accent": "214 28% 91.8%",
      "--accent-foreground": "222.2 47.4% 11.2%",
      "--border": "214 26% 86%",
      "--input": "214 26% 86%",
      "--ring": "222.2 84% 4.9%",
    },
    dark: {
      "--background": "222.2 84% 4.9%",
      "--foreground": "210 40% 98%",
      "--card": "222.2 84% 4.9%",
      "--card-foreground": "210 40% 98%",
      "--popover": "222.2 84% 4.9%",
      "--popover-foreground": "210 40% 98%",
      "--primary": "210 40% 98%",
      "--primary-foreground": "222.2 47.4% 11.2%",
      "--secondary": "217.2 32.6% 17.5%",
      "--secondary-foreground": "210 40% 98%",
      "--muted": "217.2 32.6% 17.5%",
      "--muted-foreground": "215 20.2% 65.1%",
      "--accent": "217.2 32.6% 17.5%",
      "--accent-foreground": "210 40% 98%",
      "--border": "217.2 32.6% 17.5%",
      "--input": "217.2 32.6% 17.5%",
      "--ring": "212.7 26.8% 83.9%",
    },
  },
};

// ── State ──────────────────────────────────────────────────────────────────────

const color = ref<ThemeColor>("neutral");
const radius = ref<ThemeRadius>(0.5);
let initialized = false;

function resolveStoredDark() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
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
  const isDark = resolveStoredDark();
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", isDark);
  }
  color.value = resolveStoredColor();
  radius.value = resolveStoredRadius();
  applyColorTheme(color.value);
  applyRadius(radius.value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(COLOR_STORAGE_KEY, color.value);
    window.localStorage.setItem(RADIUS_STORAGE_KEY, String(radius.value));
    window.localStorage.setItem(MODE_STORAGE_KEY, isDark ? "dark" : "light");
  }
  initialized = true;
}

// ── Public composable ──────────────────────────────────────────────────────────

export function useTheme() {
  if (!initialized) {
    initTheme();
  }

  const isDark = ref(document.documentElement.classList.contains("dark"));

  function toggleDark() {
    isDark.value = !isDark.value;
    document.documentElement.classList.toggle("dark", isDark.value);
    applyColorTheme(color.value);
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
