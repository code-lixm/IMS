export type ModelsDevLocalDataset = Record<string, readonly string[]>;

/**
 * Primary snapshot from https://models.dev/api.json
 * Captured at build-time and bundled for offline/blocked-network fallback.
 */
export const MODELS_DEV_LOCAL_DATA_PRIMARY: ModelsDevLocalDataset =
{
  "openai": [
    "chatgpt-image-latest",
    "codex-mini-latest",
    "gpt-3.5-turbo",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-2024-05-13",
    "gpt-4o-2024-08-06",
    "gpt-4o-2024-11-20",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5-chat-latest",
    "gpt-5-codex",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-pro",
    "gpt-5.1"
  ],
  "anthropic": [
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-sonnet-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6"
  ],
  "minimax": [
    "MiniMax-M2",
    "MiniMax-M2.1",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed"
  ],
  "moonshot": [
    "kimi-k2-0711-preview",
    "kimi-k2-0905-preview",
    "kimi-k2-thinking",
    "kimi-k2-thinking-turbo",
    "kimi-k2-turbo-preview",
    "kimi-k2.5"
  ],
  "deepseek": [
    "deepseek-chat",
    "deepseek-reasoner"
  ],
  "gemini": [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-flash-lite-preview-09-2025",
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash-preview-09-2025",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro",
    "gemini-2.5-pro-preview-05-06",
    "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-pro-preview-tts",
    "gemini-3-flash-preview"
  ],
  "siliconflow": [
    "ByteDance-Seed/Seed-OSS-36B-Instruct",
    "MiniMaxAI/MiniMax-M2.1",
    "MiniMaxAI/MiniMax-M2.5",
    "Qwen/QwQ-32B",
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-32B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct-128K",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "Qwen/Qwen2.5-VL-32B-Instruct",
    "Qwen/Qwen2.5-VL-72B-Instruct",
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "Qwen/Qwen3-14B",
    "Qwen/Qwen3-235B-A22B",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "Qwen/Qwen3-235B-A22B-Thinking-2507",
    "Qwen/Qwen3-30B-A3B-Instruct-2507",
    "Qwen/Qwen3-30B-A3B-Thinking-2507",
    "Qwen/Qwen3-32B"
  ],
  "openrouter": [
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-3.7-sonnet",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-opus-4",
    "anthropic/claude-opus-4.1",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-sonnet-4.6",
    "arcee-ai/trinity-large-preview:free",
    "arcee-ai/trinity-large-thinking",
    "arcee-ai/trinity-mini:free",
    "black-forest-labs/flux.2-flex",
    "black-forest-labs/flux.2-klein-4b",
    "black-forest-labs/flux.2-max",
    "black-forest-labs/flux.2-pro",
    "bytedance-seed/seedream-4.5",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    "deepseek/deepseek-chat-v3-0324"
  ],
  "grok": [
    "grok-2",
    "grok-2-1212",
    "grok-2-latest",
    "grok-2-vision",
    "grok-2-vision-1212",
    "grok-2-vision-latest",
    "grok-3",
    "grok-3-fast",
    "grok-3-fast-latest",
    "grok-3-latest",
    "grok-3-mini",
    "grok-3-mini-fast",
    "grok-3-mini-fast-latest",
    "grok-3-mini-latest",
    "grok-4",
    "grok-4-1-fast",
    "grok-4-1-fast-non-reasoning",
    "grok-4-fast",
    "grok-4-fast-non-reasoning",
    "grok-4.20-0309-non-reasoning"
  ]
} as const;

/**
 * Secondary backup snapshot (same source, reduced subset) to guard against
 * accidental corruption or provider-level empty data in the primary snapshot.
 */
export const MODELS_DEV_LOCAL_DATA_BACKUP: ModelsDevLocalDataset =
{
  "openai": [
    "chatgpt-image-latest",
    "codex-mini-latest",
    "gpt-3.5-turbo",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-2024-05-13"
  ],
  "anthropic": [
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001"
  ],
  "minimax": [
    "MiniMax-M2",
    "MiniMax-M2.1",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed"
  ],
  "moonshot": [
    "kimi-k2-0711-preview",
    "kimi-k2-0905-preview",
    "kimi-k2-thinking",
    "kimi-k2-thinking-turbo",
    "kimi-k2-turbo-preview",
    "kimi-k2.5"
  ],
  "deepseek": [
    "deepseek-chat",
    "deepseek-reasoner"
  ],
  "gemini": [
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-preview-06-17"
  ],
  "siliconflow": [
    "ByteDance-Seed/Seed-OSS-36B-Instruct",
    "MiniMaxAI/MiniMax-M2.1",
    "MiniMaxAI/MiniMax-M2.5",
    "Qwen/QwQ-32B",
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-32B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct-128K",
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-Coder-32B-Instruct"
  ],
  "openrouter": [
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-3.7-sonnet",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-opus-4",
    "anthropic/claude-opus-4.1",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-sonnet-4.6"
  ],
  "grok": [
    "grok-2",
    "grok-2-1212",
    "grok-2-latest",
    "grok-2-vision",
    "grok-2-vision-1212",
    "grok-2-vision-latest",
    "grok-3",
    "grok-3-fast",
    "grok-3-fast-latest",
    "grok-3-latest"
  ]
} as const;
