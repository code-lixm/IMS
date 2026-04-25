import { writeText as writeTauriText } from "@tauri-apps/plugin-clipboard-manager";

function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;

  try {
    await writeTauriText(text);
    return true;
  } catch (_tauriError) {
    // Desktop plugin is unavailable in the browser, or permissions are missing.
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_clipboardError) {
    // WebView may reject Clipboard API when focus/permission context is not acceptable.
  }

  return copyWithExecCommand(text);
}
