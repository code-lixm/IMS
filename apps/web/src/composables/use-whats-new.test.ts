import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Control version via mocked whats-new.json
vi.mock("@/assets/whats-new.json", () => ({
  default: {
    version: "1.0.0",
    date: "2024-06-15",
    sections: [{ title: "新增", items: ["test item"] }],
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ims_last_seen_whats_new_version";
const CURRENT_VERSION = "1.0.0";

function createLocalStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] ?? null;
    }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("useWhatsNew", () => {
  let localStorageMock: Storage;

  beforeEach(async () => {
    vi.resetModules();

    localStorageMock = createLocalStorageMock();

    // Override both global scope and window.localStorage (happy-dom
    // has its own localStorage on the window prototype)
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // resolveShouldShowWhatsNew — pure localStorage logic, no import.meta
  // -----------------------------------------------------------------------

  // 1. 全新安装：localStorage 无记录 → true
  test("resolveShouldShowWhatsNew: null means fresh install → true", async () => {
    const { resolveShouldShowWhatsNew } = await import("./use-whats-new");

    vi.mocked(localStorageMock.getItem).mockReturnValue(null);

    expect(resolveShouldShowWhatsNew()).toBe(true);
  });

  // 2. 升级：localStorage 有旧版本 → true
  test("resolveShouldShowWhatsNew: older version → true (upgrade)", async () => {
    const { resolveShouldShowWhatsNew } = await import("./use-whats-new");

    vi.mocked(localStorageMock.getItem).mockReturnValue("0.9.0");

    expect(resolveShouldShowWhatsNew()).toBe(true);
  });

  // 3. 同版本：localStorage 有当前版本 → false
  test("resolveShouldShowWhatsNew: same version → false", async () => {
    const { resolveShouldShowWhatsNew } = await import("./use-whats-new");

    vi.mocked(localStorageMock.getItem).mockReturnValue(CURRENT_VERSION);

    expect(resolveShouldShowWhatsNew()).toBe(false);
  });

  // 5. 降级：localStorage 有更高版本 → true（版本不匹配即触发）
  test("resolveShouldShowWhatsNew: higher version → true (downgrade)", async () => {
    const { resolveShouldShowWhatsNew } = await import("./use-whats-new");

    vi.mocked(localStorageMock.getItem).mockReturnValue("2.0.0");

    expect(resolveShouldShowWhatsNew()).toBe(true);
  });

  // -----------------------------------------------------------------------
  // useWhatsNew composable (DEV=true in this Vitest + happy-dom env)
  // -----------------------------------------------------------------------

  // 4. DEV 模式：import.meta.env.DEV=true → shouldShowWhatsNew 始终为 false
  test("shouldShowWhatsNew is always false in DEV mode (even fresh install)", async () => {
    vi.mocked(localStorageMock.getItem).mockReturnValue(null);

    const { useWhatsNew } = await import("./use-whats-new");
    const api = useWhatsNew();

    expect(api.shouldShowWhatsNew.value).toBe(false);
    expect(api.dialogVisible.value).toBe(false);
  });

  // DEV 模式：__test_showWhatsNew 暴露在 window 上
  test("DEV mode: __test_showWhatsNew is exposed on window", async () => {
    const { useWhatsNew } = await import("./use-whats-new");
    useWhatsNew();

    expect(typeof (window as unknown as Record<string, unknown>).__test_showWhatsNew).toBe(
      "function",
    );
  });

  // 6. dismissWhatsNew：写入当前版本 + 隐藏
  test("dismissWhatsNew: saves current version and hides dialog", async () => {
    const { useWhatsNew } = await import("./use-whats-new");
    const api = useWhatsNew();

    // Open dialog first so we can verify dismiss
    api.showWhatsNew();
    expect(api.dialogVisible.value).toBe(true);

    api.dismissWhatsNew();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      CURRENT_VERSION,
    );
    expect(api.shouldShowWhatsNew.value).toBe(false);
    expect(api.dialogVisible.value).toBe(false);
  });

  // 7. showWhatsNew：手动调用 → dialogVisible=true
  test("showWhatsNew: manually opens the dialog", async () => {
    const { useWhatsNew } = await import("./use-whats-new");
    const api = useWhatsNew();

    expect(api.dialogVisible.value).toBe(false);

    api.showWhatsNew();

    expect(api.dialogVisible.value).toBe(true);
  });

  // Bonus: whatsNewData 通过 api 暴露
  test("whatsNewData: returns the mocked changelog data", async () => {
    const { useWhatsNew } = await import("./use-whats-new");
    const api = useWhatsNew();

    expect(api.whatsNewData).toEqual({
      version: "1.0.0",
      date: "2024-06-15",
      sections: [{ title: "新增", items: ["test item"] }],
    });
  });
});
