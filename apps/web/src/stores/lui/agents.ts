import { computed, type ComputedRef, type Ref } from "vue";
import { luiApi } from "@/api/lui";
import { useAppNotifications } from "@/composables/use-app-notifications";
import { reportAppError } from "@/lib/errors/normalize";
import { convertAgent, type Agent } from "./types";

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
  displayName?: string;
  description: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  systemPrompt: string;
  tools: string[];
  temperature: number;
  sceneAffinity?: "general" | "interview";
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
      agents.value = data.items.map(convertAgent);

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
      const result = await luiApi.createAgent({
        name: input.name,
        displayName: input.displayName ?? input.name,
        description: input.description,
        engine: input.engine,
        mode: input.mode,
        temperature: input.temperature,
        systemPrompt: input.systemPrompt,
        tools: input.tools,
        sceneAffinity: input.sceneAffinity,
      });
      const agent = convertAgent(result);

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
      const result = await luiApi.updateAgent(id, {
        name: input.name,
        displayName: input.displayName,
        description: input.description,
        engine: input.engine,
        mode: input.mode,
        temperature: input.temperature,
        systemPrompt: input.systemPrompt,
        tools: input.tools,
        isDefault: input.isDefault,
        sceneAffinity: input.sceneAffinity,
      });
      if (input.isDefault !== undefined) {
        await loadAgents();
        const refreshed = agents.value.find((agent) => agent.id === id);
        if (refreshed) {
          return refreshed;
        }
      }

      const index = agents.value.findIndex((a) => a.id === id);
      if (index >= 0) {
        const updated = convertAgent(result);

        // 如果设置为默认，取消其他智能体的默认状态
        if (updated.isDefault) {
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
      const data = await luiApi.listAgents();
      agents.value = data.items.map(convertAgent);
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
