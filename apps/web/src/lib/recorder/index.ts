import { FakeRecorderAdapter } from "./fake-adapter";
import { TauriRecorderAdapter } from "./adapter";
import type { IRecorderAdapter, RecorderDiagnosticsData } from "./types";

export type { IRecorderAdapter, RecorderDiagnosticsData };
export { FakeRecorderAdapter };
export { TauriRecorderAdapter };

const DESKTOP_FLAG = "__TAURI_INTERNALS__" as const;

function hasTauriInternals(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>)[DESKTOP_FLAG] !== "undefined"
  );
}

/**
 * Create the appropriate recorder adapter for the current runtime.
 *
 * - **Desktop (Tauri)**: returns a `TauriRecorderAdapter` wired to `invoke`
 *   and `listen`.
 * - **Browser / test**: returns a `FakeRecorderAdapter` that is fully
 *   controllable via its `emit*` methods.
 *
 * The store should call this once at setup and inject the adapter as a
 * constructor parameter, never reaching into Tauri internals directly.
 */
export function createRecorderAdapter(): IRecorderAdapter {
  if (hasTauriInternals()) {
    return new TauriRecorderAdapter();
  }
  return new FakeRecorderAdapter();
}
