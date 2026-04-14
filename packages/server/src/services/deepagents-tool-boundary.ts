import { TOOL_NAMES, type ToolName } from "./lui-tools";

export const DEEPAGENTS_BUILTIN_TOOL_NAMES = [
  "write_todos",
  "ls",
  "read_file",
  "write_file",
  "edit_file",
  "glob",
  "grep",
  "execute",
  "task",
  "start_async_task",
  "check_async_task",
  "update_async_task",
  "cancel_async_task",
  "list_async_tasks",
] as const;

export type DeepagentsBuiltinToolName = (typeof DEEPAGENTS_BUILTIN_TOOL_NAMES)[number];

export const IMS_BUSINESS_TOOL_NAMES = TOOL_NAMES;

export type ImsBusinessToolName = ToolName;

export interface PartitionedAgentToolNames {
  builtin: DeepagentsBuiltinToolName[];
  business: ImsBusinessToolName[];
  unknown: string[];
}

const BUILTIN_TOOL_SET = new Set<string>(DEEPAGENTS_BUILTIN_TOOL_NAMES);
const BUSINESS_TOOL_SET = new Set<string>(IMS_BUSINESS_TOOL_NAMES);

export function partitionAgentToolNames(toolNames: readonly string[] | null | undefined): PartitionedAgentToolNames {
  const builtin: DeepagentsBuiltinToolName[] = [];
  const business: ImsBusinessToolName[] = [];
  const unknown: string[] = [];

  for (const toolName of toolNames ?? []) {
    if (BUILTIN_TOOL_SET.has(toolName)) {
      builtin.push(toolName as DeepagentsBuiltinToolName);
      continue;
    }

    if (BUSINESS_TOOL_SET.has(toolName)) {
      business.push(toolName as ImsBusinessToolName);
      continue;
    }

    unknown.push(toolName);
  }

  return { builtin, business, unknown };
}
