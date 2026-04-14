import { describe, expect, test } from "bun:test";
import type { WorkspaceAgentDefinition } from "@ims/shared";
import { DEFAULT_INTERVIEW_AGENT_ID, resolveWorkspaceExecutionEngine } from "./lui-agents";

function createWorkspaceAgentDefinition(
  overrides: Partial<WorkspaceAgentDefinition> = {},
): WorkspaceAgentDefinition {
  return {
    agentId: DEFAULT_INTERVIEW_AGENT_ID,
    rootDir: "/tmp/agent_builtin_interview",
    config: {
      id: DEFAULT_INTERVIEW_AGENT_ID,
      name: "面试专家",
      description: "Workspace interview agent",
      engine: "deepagents",
      mode: "workflow",
      sceneAffinity: "interview",
      tools: ["scan_resume"],
      runtime: { temperature: 0 },
    },
    configFile: {
      path: "/tmp/agent_builtin_interview/agent.yaml",
      content: "engine: deepagents",
    },
    instructionsFile: null,
    skills: [],
    memory: {
      policyFile: null,
      seedFile: null,
      seedData: null,
    },
    ...overrides,
  };
}

describe("lui-agents", () => {
  test("keeps default interview workspace agent on builtin execution", () => {
    const definition = createWorkspaceAgentDefinition();

    expect(resolveWorkspaceExecutionEngine(definition)).toBe("builtin");
  });

  test("preserves deepagents for non-default workspace agents", () => {
    const definition = createWorkspaceAgentDefinition({
      agentId: "agent_custom_interview",
      config: {
        id: "agent_custom_interview",
        name: "Custom Interview Agent",
        engine: "deepagents",
        mode: "workflow",
        sceneAffinity: "interview",
      },
    });

    expect(resolveWorkspaceExecutionEngine(definition)).toBe("deepagents");
  });
});
