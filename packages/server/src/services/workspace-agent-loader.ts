import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  WorkspaceAgentCatalogResult,
  WorkspaceAgentDefinition,
  WorkspaceAgentFileRef,
  WorkspaceAgentLoadError,
  WorkspaceAgentLoadResult,
  WorkspaceAgentMemoryDefinition,
  WorkspaceSkillDefinition,
} from "@ims/shared";
import { config } from "../config";
import { parseWorkspaceAgentYaml } from "./workspace-agent-yaml";

const AGENT_CONFIG_FILE = "agent.yaml";
const AGENT_MARKDOWN_FILE = "agent.md";
const MEMORY_DIR = "memory";
const MEMORY_POLICY_FILE = "policy.md";
const MEMORY_SEED_FILE = "seeds.json";
const SKILLS_DIR = "skills";
const SKILL_MARKDOWN_FILE = "SKILL.md";
const SKILL_REFERENCES_DIR = "references";
const BUNDLED_INTERVIEW_AGENT_ID = "agent_builtin_interview";
const BUNDLED_INTERVIEW_AGENT_FILE = "interview-manager.md";
const BUNDLED_MEMORY_FILE = "interview-learning.md";

function createLoadError(error: WorkspaceAgentLoadError): WorkspaceAgentLoadError {
  return error;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(path: string, code: WorkspaceAgentLoadError["code"], message: string): Promise<WorkspaceAgentLoadError | null> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { code, path, message };
    }
    return null;
  } catch {
    return { code, path, message };
  }
}

async function readTextFile(path: string, code: WorkspaceAgentLoadError["code"], message: string): Promise<{ ok: true; file: WorkspaceAgentFileRef } | { ok: false; error: WorkspaceAgentLoadError }> {
  try {
    const content = await readFile(path, "utf8");
    return { ok: true, file: { path, content } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code,
        path,
        message,
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function loadTextFilesRecursively(rootDir: string): Promise<{ files: WorkspaceAgentFileRef[]; errors: WorkspaceAgentLoadError[] }> {
  const files: WorkspaceAgentFileRef[] = [];
  const errors: WorkspaceAgentLoadError[] = [];

  if (!(await pathExists(rootDir))) {
    return { files, errors };
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await loadTextFilesRecursively(entryPath);
      files.push(...nested.files);
      errors.push(...nested.errors);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const result = await readTextFile(entryPath, "SKILL_FILE_INVALID", `读取 supporting file ${entryPath} 失败`);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    files.push(result.file);
  }

  return { files, errors };
}

async function loadOptionalMarkdown(path: string): Promise<{ file: WorkspaceAgentFileRef | null; error: WorkspaceAgentLoadError | null }> {
  if (!(await pathExists(path))) {
    return { file: null, error: null };
  }

  const result = await readTextFile(path, "AGENT_MARKDOWN_INVALID", "读取 agent.md 失败");
  if (!result.ok) {
    return { file: null, error: result.error };
  }

  return { file: result.file, error: null };
}

async function loadOptionalJson(path: string, code: WorkspaceAgentLoadError["code"], message: string): Promise<{ file: WorkspaceAgentFileRef | null; data: unknown | null; error: WorkspaceAgentLoadError | null }> {
  if (!(await pathExists(path))) {
    return { file: null, data: null, error: null };
  }

  const result = await readTextFile(path, code, message);
  if (!result.ok) {
    return { file: null, data: null, error: result.error };
  }

  try {
    return {
      file: result.file,
      data: JSON.parse(result.file.content),
      error: null,
    };
  } catch (error) {
    return {
      file: result.file,
      data: null,
      error: {
        code,
        path,
        message,
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function loadMemory(agentRootDir: string): Promise<{ memory: WorkspaceAgentMemoryDefinition; errors: WorkspaceAgentLoadError[] }> {
  const memoryDir = join(agentRootDir, MEMORY_DIR);
  if (!(await pathExists(memoryDir))) {
    return {
      memory: { policyFile: null, seedFile: null, seedData: null },
      errors: [],
    };
  }

  const dirError = await ensureDirectory(memoryDir, "MEMORY_POLICY_INVALID", "memory 必须是目录");
  if (dirError) {
    return {
      memory: { policyFile: null, seedFile: null, seedData: null },
      errors: [dirError],
    };
  }

  const policyResult = await loadOptionalMarkdown(join(memoryDir, MEMORY_POLICY_FILE));
  const seedResult = await loadOptionalJson(join(memoryDir, MEMORY_SEED_FILE), "MEMORY_SEED_INVALID", "读取 memory/seeds.json 失败");

  return {
    memory: {
      policyFile: policyResult.file,
      seedFile: seedResult.file,
      seedData: seedResult.data,
    },
    errors: [
      ...(policyResult.error ? [policyResult.error] : []),
      ...(seedResult.error ? [seedResult.error] : []),
    ],
  };
}

async function loadSkills(agentRootDir: string): Promise<{ skills: WorkspaceSkillDefinition[]; errors: WorkspaceAgentLoadError[] }> {
  const skillsDir = join(agentRootDir, SKILLS_DIR);
  if (!(await pathExists(skillsDir))) {
    return { skills: [], errors: [] };
  }

  const dirError = await ensureDirectory(skillsDir, "SKILLS_DIR_INVALID", "skills 必须是目录");
  if (dirError) {
    return { skills: [], errors: [dirError] };
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: WorkspaceSkillDefinition[] = [];
  const errors: WorkspaceAgentLoadError[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillFilePath = join(skillsDir, entry.name, SKILL_MARKDOWN_FILE);
    if (!(await pathExists(skillFilePath))) {
      errors.push(createLoadError({
        code: "SKILL_FILE_MISSING",
        path: skillFilePath,
        message: `技能目录 ${entry.name} 缺少 SKILL.md`,
      }));
      continue;
    }

    const result = await readTextFile(skillFilePath, "SKILL_FILE_INVALID", `读取技能 ${entry.name} 的 SKILL.md 失败`);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }

    const referencesDir = join(skillsDir, entry.name, SKILL_REFERENCES_DIR);
    const references: WorkspaceAgentFileRef[] = [];
    if (await pathExists(referencesDir)) {
      const referenceDirError = await ensureDirectory(referencesDir, "SKILL_FILE_INVALID", `技能 ${entry.name} 的 references 必须是目录`);
      if (referenceDirError) {
        errors.push(referenceDirError);
      } else {
        const referenceEntries = await readdir(referencesDir, { withFileTypes: true });
        for (const referenceEntry of referenceEntries) {
          if (!referenceEntry.isFile()) {
            continue;
          }

          const referencePath = join(referencesDir, referenceEntry.name);
          const referenceResult = await readTextFile(
            referencePath,
            "SKILL_FILE_INVALID",
            `读取技能 ${entry.name} 的 reference 文件 ${referenceEntry.name} 失败`,
          );
          if (!referenceResult.ok) {
            errors.push(referenceResult.error);
            continue;
          }

          references.push(referenceResult.file);
        }
      }
    }

    const auxiliaryFiles = await loadTextFilesRecursively(join(skillsDir, entry.name));
    errors.push(...auxiliaryFiles.errors);
    for (const auxiliaryFile of auxiliaryFiles.files) {
      if (auxiliaryFile.path === skillFilePath || references.some((reference) => reference.path === auxiliaryFile.path)) {
        continue;
      }
      references.push(auxiliaryFile);
    }

    skills.push({
      skillId: entry.name,
      directoryName: entry.name,
      file: result.file,
      references,
    });
  }

  return { skills, errors };
}

async function loadBundledInterviewWorkspaceOverlay(): Promise<Pick<WorkspaceAgentDefinition, "instructionsFile" | "skills" | "memory"> | null> {
  const rootDir = config.bundledInterviewOpencodeDir;
  const rootError = await ensureDirectory(rootDir, "WORKSPACE_ROOT_MISSING", "内置 interview-opencode 目录不存在");
  if (rootError) {
    return null;
  }

  const agentFileResult = await loadOptionalMarkdown(join(rootDir, "agents", BUNDLED_INTERVIEW_AGENT_FILE));
  const memoryFileResult = await loadOptionalMarkdown(join(rootDir, "memory", BUNDLED_MEMORY_FILE));
  const skillsRoot = join(rootDir, SKILLS_DIR);
  const skills: WorkspaceSkillDefinition[] = [];

  if (await pathExists(skillsRoot)) {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = join(skillsRoot, entry.name);
      const skillFilePath = join(skillDir, SKILL_MARKDOWN_FILE);
      if (!(await pathExists(skillFilePath))) {
        continue;
      }

        const skillFileResult = await readTextFile(skillFilePath, "SKILL_FILE_INVALID", `读取内置技能 ${entry.name} 的 SKILL.md 失败`);
      if (!skillFileResult.ok) {
        continue;
      }

      const supportingFiles = await loadTextFilesRecursively(skillDir);
      const references = supportingFiles.files.filter((file) => file.path !== skillFilePath);
      skills.push({
        skillId: entry.name,
        directoryName: entry.name,
        file: skillFileResult.file,
        references,
      });
    }
  }

  return {
    instructionsFile: agentFileResult.file,
    skills,
    memory: {
      policyFile: memoryFileResult.file,
      seedFile: null,
      seedData: null,
    },
  };
}

async function createBundledInterviewWorkspaceDefinition(agentId: string): Promise<WorkspaceAgentDefinition | null> {
  const bundledOverlay = await loadBundledInterviewWorkspaceOverlay();
  if (!bundledOverlay) {
    return null;
  }

  const rootDir = join(config.agentWorkspacesDir, agentId);

  return {
    agentId,
    rootDir,
    config: {
      id: agentId,
      name: "面试专家",
      description: "Workspace-native interview expert using bundled interview-opencode overlay.",
      engine: "deepagents",
      mode: "workflow",
      sceneAffinity: "interview",
      tools: ["scan_resume", "sanitize_interview_notes", "screen_resumes", "generate_wechat_summary"],
      skills: bundledOverlay.skills.map((skill) => skill.skillId),
      runtime: {
        temperature: 0,
      },
    },
    configFile: {
      path: join(rootDir, AGENT_CONFIG_FILE),
      content: [
        `id: ${agentId}`,
        "name: 面试专家",
        'description: Workspace-native interview expert using bundled interview-opencode overlay.',
        "engine: deepagents",
        "mode: workflow",
        "sceneAffinity: interview",
        "runtime:",
        "  temperature: 0",
      ].join("\n"),
    },
    instructionsFile: bundledOverlay.instructionsFile,
    skills: bundledOverlay.skills,
    memory: bundledOverlay.memory,
  };
}

function validateParsedConfig(agentId: string, configFile: WorkspaceAgentFileRef, parsed: WorkspaceAgentDefinition["config"]): WorkspaceAgentLoadError[] {
  const errors: WorkspaceAgentLoadError[] = [];

  if (parsed.id && parsed.id !== agentId) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: `agent.yaml 中的 id=${parsed.id} 与目录名 ${agentId} 不一致`,
    });
  }

  if (parsed.tools !== undefined && !Array.isArray(parsed.tools)) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 tools 必须是字符串数组",
    });
  }

  if (parsed.skills !== undefined && !Array.isArray(parsed.skills)) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 skills 必须是字符串数组",
    });
  }

  if (parsed.runtime !== undefined && (typeof parsed.runtime !== "object" || parsed.runtime === null || Array.isArray(parsed.runtime))) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 runtime 必须是对象",
    });
  }

  if (parsed.engine !== undefined && parsed.engine !== "builtin" && parsed.engine !== "deepagents") {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 engine 只能是 builtin 或 deepagents",
    });
  }

  if (parsed.mode !== undefined && !["all", "chat", "ask", "workflow"].includes(parsed.mode)) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 mode 只能是 all、chat、ask 或 workflow",
    });
  }

  if (parsed.sceneAffinity !== undefined && !["general", "interview"].includes(parsed.sceneAffinity)) {
    errors.push({
      code: "AGENT_CONFIG_INVALID",
      path: configFile.path,
      message: "agent.yaml 的 sceneAffinity 只能是 general 或 interview",
    });
  }

  return errors;
}

export async function loadWorkspaceAgentDefinition(agentId: string): Promise<WorkspaceAgentLoadResult> {
  const trimmedAgentId = agentId.trim();
  const rootDir = config.agentWorkspacesDir;
  const workspaceDir = join(rootDir, trimmedAgentId);

  const rootError = await ensureDirectory(rootDir, "WORKSPACE_ROOT_MISSING", "工作区根目录不存在");
  if (rootError) {
    return { ok: false, definition: null, errors: [rootError] };
  }

  const workspaceError = await ensureDirectory(workspaceDir, "AGENT_WORKSPACE_MISSING", `智能体工作区 ${trimmedAgentId} 不存在`);
  if (workspaceError) {
    if (trimmedAgentId === BUNDLED_INTERVIEW_AGENT_ID) {
      const bundledDefinition = await createBundledInterviewWorkspaceDefinition(trimmedAgentId);
      if (bundledDefinition) {
        return { ok: true, definition: bundledDefinition, errors: [] };
      }
    }
    return { ok: false, definition: null, errors: [workspaceError] };
  }

  const configPath = join(workspaceDir, AGENT_CONFIG_FILE);
  if (!(await pathExists(configPath))) {
    if (trimmedAgentId === BUNDLED_INTERVIEW_AGENT_ID) {
      const bundledDefinition = await createBundledInterviewWorkspaceDefinition(trimmedAgentId);
      if (bundledDefinition) {
        return { ok: true, definition: bundledDefinition, errors: [] };
      }
    }
    return {
      ok: false,
      definition: null,
      errors: [{ code: "AGENT_CONFIG_MISSING", path: configPath, message: "缺少 agent.yaml" }],
    };
  }

  const configFileResult = await readTextFile(configPath, "AGENT_CONFIG_INVALID", "读取 agent.yaml 失败");
  if (!configFileResult.ok) {
    return { ok: false, definition: null, errors: [configFileResult.error] };
  }

  const parsedConfigResult = parseWorkspaceAgentYaml(configFileResult.file.content, configPath);
  if (!parsedConfigResult.ok) {
    return { ok: false, definition: null, errors: [parsedConfigResult.error] };
  }

  const markdownResult = await loadOptionalMarkdown(join(workspaceDir, AGENT_MARKDOWN_FILE));
  const memoryResult = await loadMemory(workspaceDir);
  const skillResult = await loadSkills(workspaceDir);
  const validationErrors = validateParsedConfig(trimmedAgentId, configFileResult.file, parsedConfigResult.value);
  const errors = [
    ...validationErrors,
    ...(markdownResult.error ? [markdownResult.error] : []),
    ...memoryResult.errors,
    ...skillResult.errors,
  ];

  const definition: WorkspaceAgentDefinition = {
    agentId: trimmedAgentId,
    rootDir: workspaceDir,
    config: {
      ...parsedConfigResult.value,
      id: parsedConfigResult.value.id ?? trimmedAgentId,
    },
    configFile: configFileResult.file,
    instructionsFile: markdownResult.file,
    skills: skillResult.skills,
    memory: memoryResult.memory,
  };

  if (trimmedAgentId === BUNDLED_INTERVIEW_AGENT_ID) {
    const bundledOverlay = await loadBundledInterviewWorkspaceOverlay();
    if (bundledOverlay) {
      const mergedSkills = [...bundledOverlay.skills];
      const existingSkillIds = new Set(mergedSkills.map((skill) => skill.skillId));
      for (const localSkill of definition.skills) {
        if (!existingSkillIds.has(localSkill.skillId)) {
          mergedSkills.push(localSkill);
        }
      }

      definition.instructionsFile = bundledOverlay.instructionsFile ?? definition.instructionsFile;
      definition.skills = mergedSkills;
      definition.memory = {
        policyFile: bundledOverlay.memory.policyFile ?? definition.memory.policyFile,
        seedFile: definition.memory.seedFile,
        seedData: definition.memory.seedData,
      };
    }
  }

  return {
    ok: errors.length === 0,
    definition,
    errors,
  };
}

export async function loadWorkspaceAgentCatalog(): Promise<WorkspaceAgentCatalogResult> {
  const rootDir = config.agentWorkspacesDir;
  const rootError = await ensureDirectory(rootDir, "WORKSPACE_ROOT_MISSING", "工作区根目录不存在");
  if (rootError) {
    return { ok: false, agents: [], errors: [rootError] };
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const agents: WorkspaceAgentDefinition[] = [];
  const errors: WorkspaceAgentLoadError[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const result = await loadWorkspaceAgentDefinition(entry.name);
    if (result.definition) {
      agents.push(result.definition);
    }
    errors.push(...result.errors);
  }

  return {
    ok: errors.length === 0,
    agents,
    errors,
  };
}
