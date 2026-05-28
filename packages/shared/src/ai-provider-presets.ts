/**
 * Built-in provider base URLs.
 *
 * Refreshed against https://models.dev/api.json.
 * MiniMax is intentionally pinned to the official CN endpoint because
 * `api.minimaxi.com/v1` is the working endpoint in this app environment.
 */
export const PRESET_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  minimax: "https://api.minimaxi.com/v1",
  moonshot: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  siliconflow: "https://api.siliconflow.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  grok: "https://api.x.ai/v1",
};

export function resolvePresetProviderBaseUrl(providerId: string, runtimeOverride?: string | null): string | null {
  const normalizedProviderId = providerId.trim();
  if (!normalizedProviderId) {
    return null;
  }

  if (normalizedProviderId === "minimax") {
    const override = runtimeOverride?.trim();
    if (override) {
      return `${override.replace(/\/+$/, "")}/v1`;
    }
  }

  return PRESET_PROVIDER_BASE_URLS[normalizedProviderId] ?? null;
}
