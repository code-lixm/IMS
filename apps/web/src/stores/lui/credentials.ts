import { type Ref } from "vue";
import { luiApi } from "@/api/lui";
import type { Credential } from "./types";

interface LuiCredentialModuleOptions {
  credentials: Ref<Record<string, Credential>>;
  isLoading: Ref<boolean>;
}

export interface LuiCredentialModule {
  isAuthorized: (provider: string) => boolean;
  checkAuthStatus: (provider: string) => Promise<boolean>;
  authorize: (provider: string, apiKey: string) => Promise<void>;
  revoke: (provider: string) => Promise<void>;
}

export function createLuiCredentialModule(options: LuiCredentialModuleOptions): LuiCredentialModule {
  const { credentials, isLoading } = options;

  function isAuthorized(provider: string): boolean {
    return credentials.value[provider]?.isValid ?? false;
  }

  async function checkAuthStatus(provider: string): Promise<boolean> {
    isLoading.value = true;
    try {
      const hasCredential = (await luiApi.getCredentialStatus(provider)).isAuthorized;

      credentials.value[provider] = {
        provider,
        type: "api_key",
        isValid: hasCredential,
      };
      return hasCredential;
    } finally {
      isLoading.value = false;
    }
  }

  async function authorize(provider: string, apiKey: string): Promise<void> {
    isLoading.value = true;
    try {
      if (!apiKey || apiKey.length < 10) {
        throw new Error("Invalid API key");
      }

      await luiApi.setCredential(provider, { apiKey });

      credentials.value[provider] = {
        provider,
        type: "api_key",
        isValid: true,
      };
    } finally {
      isLoading.value = false;
    }
  }

  async function revoke(provider: string): Promise<void> {
    isLoading.value = true;
    try {
      await luiApi.deleteCredential(provider);

      delete credentials.value[provider];
    } finally {
      isLoading.value = false;
    }
  }

  return {
    isAuthorized,
    checkAuthStatus,
    authorize,
    revoke,
  };
}
