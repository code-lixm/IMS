import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import type { Agent } from "./types";

interface LuiAgentModuleOptions {
  agents: Ref<Agent[]>;
  selectedId: Ref<string | null>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
}

export interface LuiAgentModule {
  selectedAgent: ComputedRef<Agent | undefined>;
  defaultAgent: ComputedRef<Agent | undefined>;
  loadAgents: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  createAgent: (input: CreateAgentInput) => Promise<Agent>;
  updateAgent: (id: string, input: UpdateAgentInput) => Promise<Agent>;
  deleteAgent: (id: string) => Promise<void>;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  defaultModel: string;
  defaultTemperature: number;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  isDefault?: boolean;
}

export function createLuiAgentModule(options: LuiAgentModuleOptions): LuiAgentModule {
  const { agents, selectedId, isLoading, error } = options;
  const { notifyError } = useAppNotifications();

  const selectedAgent = computed(() =>
    agents.value.find((agent) => agent.id === selectedId.value)
  );

  const defaultAgent = computed(() =>
    agents.value.find((agent) => agent.isDefault)
  );

  async function loadAgents() {
    isLoading.value = true;
    error.value = null;

    try {
      const data = await luiApi.listAgents();
      agents.value = data.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        systemPrompt: item.systemPrompt ?? "",
        tools: item.tools ?? [],
        defaultModel: item.mode === "all" ? "gpt-4" : "gpt-3.5-turbo",
        defaultTemperature: item.temperature,
        isDefault: item.isDefault,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // 如果没有选中智能体，选择默认智能体
      if (!selectedId.value && defaultAgent.value) {
        selectedId.value = defaultAgent.value.id;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load agents";
      notifyError(reportAppError("lui/load-agents", err, {
        title: "加载智能体失败",
        fallbackMessage: "暂时无法获取智能体列表",
      }));
    } finally {
      isLoading.value = false;
    }
  }

  function selectAgent(id: string | null) {
    selectedId.value = id;
  }

  async function createAgent(input: CreateAgentInput) {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await luiApi.createAgent(input);
      const now = new Date();
      const agent: Agent = {
        id: result.id,
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        tools: input.tools,
        defaultModel: input.defaultModel,
        defaultTemperature: input.defaultTemperature,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      agents.value = [...agents.value, agent];
      return agent;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to create agent";
      notifyError(reportAppError("lui/create-agent", err, {
        title: "创建智能体失败",
        fallbackMessage: "暂时无法创建新智能体",
      }));
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function updateAgent(id: string, input: UpdateAgentInput) {
    isLoading.value = true;
    error.value = null;

    try {
      await luiApi.updateAgent(id, input);
      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        const updated: Agent = {
          ...agents.value[index],
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
          ...(input.tools !== undefined && { tools: input.tools }),
          ...(input.defaultModel !== undefined && { defaultModel: input.defaultModel }),
          ...(input.defaultTemperature !== undefined && { defaultTemperature: input.defaultTemperature }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          updatedAt: new Date(),
        };

        // 如果设置为默认，取消其他智能体的默认状态
        if (input.isDefault) {
          agents.value = agents.value.map((a) =>
            a.id === id ? updated : { ...a, isDefault: false }
          );
        } else {
          agents.value[index] = updated;
        }

        return updated;
      }
      throw new Error("Agent not found");
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to update agent";
      notifyError(reportAppError("lui/update-agent", err, {
        title: "更新智能体失败",
        fallbackMessage: "暂时无法更新智能体配置",
      }));
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteAgent(id: string) {
    isLoading.value = true;
    error.value = null;

    try {
      await luiApi.deleteAgent(id);
      agents.value = agents.value.filter((a) => a.id !== id);
      if (selectedId.value === id) {
        selectedId.value = defaultAgent.value?.id ?? agents.value[0]?.id ?? null;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to delete agent";
      notifyError(reportAppError("lui/delete-agent", err, {
        title: "删除智能体失败",
        fallbackMessage: "暂时无法删除智能体",
      }));
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    selectedAgent,
    defaultAgent,
    loadAgents,
    selectAgent,
    createAgent,
    updateAgent,
    deleteAgent,
  };
}
