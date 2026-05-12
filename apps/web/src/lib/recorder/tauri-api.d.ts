/**
 * Ambient declarations for the Tauri APIs used by TauriRecorderAdapter.
 *
 * These are only needed at compile time — `@tauri-apps/api` is not a
 * dependency of `@ims/web`. At runtime in the Tauri webview these modules
 * are injected by the framework; in a standalone browser this adapter is
 * never instantiated (the factory in index.ts checks for `__TAURI_INTERNALS__`
 * first).
 */

declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export function listen<T>(
    event: string,
    handler: (event: { payload: T }) => void,
  ): Promise<() => void>;
}
