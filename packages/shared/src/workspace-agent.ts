export interface WorkspaceAgentRuntimeConfig {
  provider?: string;
  model?: string;
  temperature?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface WorkspaceAgentConfigDocument {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  sceneAffinity?: "general" | "interview";
  systemPrompt?: string;
  tools?: string[];
  skills?: string[];
  runtime?: WorkspaceAgentRuntimeConfig;
  [key: string]: WorkspaceAgentConfigValue | undefined;
}

export type WorkspaceAgentConfigScalar = string | number | boolean | null;

export type WorkspaceAgentConfigValue =
  | WorkspaceAgentConfigScalar
  | WorkspaceAgentConfigScalar[]
  | WorkspaceAgentConfigObject
  | WorkspaceAgentConfigObject[];

export interface WorkspaceAgentConfigObject {
  [key: string]: WorkspaceAgentConfigValue | undefined;
}

export interface WorkspaceAgentFileRef {
  path: string;
  content: string;
}

export interface WorkspaceSkillDefinition {
  skillId: string;
  directoryName: string;
  file: WorkspaceAgentFileRef;
  references: WorkspaceAgentFileRef[];
}

export interface WorkspaceAgentMemoryDefinition {
  policyFile: WorkspaceAgentFileRef | null;
  seedFile: WorkspaceAgentFileRef | null;
  seedData: unknown | null;
}

export interface WorkspaceAgentDefinition {
  agentId: string;
  rootDir: string;
  config: WorkspaceAgentConfigDocument;
  configFile: WorkspaceAgentFileRef;
  instructionsFile: WorkspaceAgentFileRef | null;
  skills: WorkspaceSkillDefinition[];
  memory: WorkspaceAgentMemoryDefinition;
}

export type WorkspaceAgentLoadErrorCode =
  | "WORKSPACE_ROOT_MISSING"
  | "AGENT_WORKSPACE_MISSING"
  | "AGENT_CONFIG_MISSING"
  | "AGENT_CONFIG_INVALID"
  | "AGENT_CONFIG_UNSUPPORTED"
  | "AGENT_MARKDOWN_INVALID"
  | "MEMORY_POLICY_INVALID"
  | "MEMORY_SEED_INVALID"
  | "SKILLS_DIR_INVALID"
  | "SKILL_FILE_MISSING"
  | "SKILL_FILE_INVALID";

export interface WorkspaceAgentLoadError {
  code: WorkspaceAgentLoadErrorCode;
  message: string;
  path: string;
  details?: string;
}

export interface WorkspaceAgentLoadResult {
  ok: boolean;
  definition: WorkspaceAgentDefinition | null;
  errors: WorkspaceAgentLoadError[];
}

export interface WorkspaceAgentCatalogResult {
  ok: boolean;
  agents: WorkspaceAgentDefinition[];
  errors: WorkspaceAgentLoadError[];
}
