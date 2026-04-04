<template>
  <div class="mx-auto w-full max-w-xl space-y-5">
    <div class="space-y-2 text-center">
      <p class="text-base font-semibold tracking-tight">
        {{ suggestionTitle }}
      </p>
      <p class="text-sm font-medium leading-6 /90">
        {{ suggestionDescription }}
      </p>
    </div>
    <Suggestions class="w-full">
      <Suggestion
        v-for="(suggestion, index) in starterSuggestions"
        :key="suggestion"
        :suggestion="suggestion"
        size="default"
        variant="outline"
        class="lui-suggestion-card h-auto w-full min-w-0 justify-center whitespace-normal break-words rounded-2xl border-border/80 bg-card/92 px-6 py-6 text-center text-lg font-medium leading-8 text-card-foreground shadow-sm transition-all duration-300 hover:scale-[1.01] hover:border-primary/20 hover:bg-card hover:shadow-md"
        :style="{ animationDelay: `${index * 80}ms` }"
        @click="emit('apply', suggestion)"
      />
    </Suggestions>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

interface SceneAgentSummary {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

interface StageSuggestionsProps {
  agent: SceneAgentSummary | null;
  candidateName: string | null;
  workflowStage: "S0" | "S1" | "S2" | "completed" | null;
}

const props = defineProps<StageSuggestionsProps>();
const emit = defineEmits<{
  (e: "apply", suggestion: string): void;
}>();

const suggestionTitle = computed(() => {
  const agent = props.agent;
  const stageLabel = currentWorkflowStageLabel.value;

  if (agent && stageLabel) {
    return `${agent.name} · ${stageLabel}建议`;
  }

  if (agent) {
    return `${agent.name} 的建议`;
  }

  return stageLabel ? `${stageLabel}建议` : "试试智能体建议";
});

const suggestionDescription = computed(() => {
  const agent = props.agent;
  const stageLabel = currentWorkflowStageLabel.value;

  if (agent && stageLabel) {
    return `以下建议会优先按照当前流程的${stageLabel}目标生成，并同时遵循智能体「${agent.name}」的角色和技能约束。`;
  }

  if (agent) {
    return `以下建议会根据当前智能体「${agent.name}」的职责与技能生成，点击后会直接填入底部输入区。`;
  }

  if (stageLabel) {
    return `以下建议会围绕当前流程的${stageLabel}目标生成，点击后会直接填入底部输入区。`;
  }

  return "建议会根据当前智能体配置和上下文生成，点击后会直接填入底部输入区。";
});

const currentWorkflowStageLabel = computed(() => {
  const labels: Record<NonNullable<StageSuggestionsProps["workflowStage"]>, string> = {
    S0: "初筛阶段",
    S1: "出题阶段",
    S2: "评估阶段",
    completed: "复盘阶段",
  };

  const stage = props.workflowStage;
  return stage ? labels[stage] : null;
});

const starterSuggestions = computed(() => {
  const stageSuggestions = buildStageSuggestions(props.workflowStage, {
    candidateName: props.candidateName,
  });

  const toolAwareSuggestion = buildToolAwareSuggestion(props.agent, props.workflowStage, {
    candidateName: props.candidateName,
  });

  const agentScopedSuggestion = props.agent
    ? `${formatSuggestionSubject(props.candidateName)}，请严格按照智能体「${props.agent.name}」的职责和技能边界来推进当前任务。`
    : null;

  return uniqueSuggestions([
    ...(toolAwareSuggestion ? [toolAwareSuggestion] : []),
    ...stageSuggestions,
    ...(agentScopedSuggestion ? [agentScopedSuggestion] : []),
  ]).slice(0, 3);
});

function uniqueSuggestions(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function formatSuggestionSubject(candidateName: string | null) {
  return candidateName ? `围绕候选人「${candidateName}」` : "基于当前上下文";
}

function buildStageSuggestions(
  stage: StageSuggestionsProps["workflowStage"],
  context: { candidateName: string | null },
) {
  const subject = formatSuggestionSubject(context.candidateName);

  if (stage === "S0") {
    return [
      `请${subject}先完成一版初筛结论，并明确给出通过、待定或淘汰建议。`,
      `请${subject}梳理最关键的能力亮点、风险点和需要进一步核验的信息。`,
      `请${subject}输出一份适合进入面试前讨论的结构化初筛摘要。`,
    ];
  }

  if (stage === "S1") {
    return [
      `请${subject}按照当前轮次先生成一套结构化面试题，并说明每题想验证什么。`,
      `请${subject}区分基础题、追问题和风险验证题，形成一份可直接使用的出题清单。`,
      `请${subject}结合前序结论，指出本轮面试最需要重点追问的三个方向。`,
    ];
  }

  if (stage === "S2") {
    return [
      `请${subject}先输出一版面试评估结论，分别说明优势、不足和建议结论。`,
      `请${subject}把当前面试记录整理成一份适合给面试官团队的评估摘要。`,
      `请${subject}明确给出录用建议、风险等级以及下一步动作。`,
    ];
  }

  if (stage === "completed") {
    return [
      `请${subject}复盘整个流程，整理出最终结论和可存档摘要。`,
      `请${subject}把已生成材料压缩成一份适合汇报的最终总结。`,
      `请${subject}指出当前流程已经完成的部分、遗留问题和建议 follow-up。`,
    ];
  }

  return [
    `请${subject}先给出当前最值得优先推进的第一步。`,
    `请${subject}做一次结构化分析，并告诉我接下来该怎么推进。`,
    `请${subject}把当前问题拆成三个最值得先处理的小步骤。`,
  ];
}

function buildToolAwareSuggestion(
  agent: SceneAgentSummary | null,
  stage: StageSuggestionsProps["workflowStage"],
  context: { candidateName: string | null },
) {
  if (!agent?.tools?.length) {
    return null;
  }

  const subject = formatSuggestionSubject(context.candidateName);
  const toolsLabel = agent.tools.slice(0, 3).join("、");

  if (stage === "S0") {
    return `请${subject}优先使用 ${toolsLabel} 这些能力完成当前初筛判断，并把结果整理成结论。`;
  }

  if (stage === "S1") {
    return `请${subject}在当前出题阶段优先利用 ${toolsLabel} 相关能力，生成一份可直接使用的题纲。`;
  }

  if (stage === "S2") {
    return `请${subject}结合 ${toolsLabel} 这些能力完成评估总结，并明确给出最终建议。`;
  }

  return `请${subject}按照智能体「${agent.name}」可用的 ${toolsLabel} 能力，给我一个最合适的下一步。`;
}
</script>

<style scoped>
@keyframes luiSuggestionFadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.lui-suggestion-card {
  animation: luiSuggestionFadeUp 0.5s ease-out both;
}
</style>
