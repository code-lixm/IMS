<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from "vue";
import type { MatchingTemplate, CreateMatchingTemplateInput, UpdateMatchingTemplateInput } from "@ims/shared";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  AppDialogLayout,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { screeningTemplatesApi } from "@/api/screening-templates";

type TemplateWeights = {
  resume: number;
  skills: number;
  experience: number;
};

type TemplateThresholds = {
  passThreshold: number;
  reviewThreshold: number;
};

type TemplateRecommendationRules = {
  pass: string;
  review: string;
  reject: string;
};

type TemplateMatchPayload = {
  hints: string[];
  weights: TemplateWeights;
  thresholds: TemplateThresholds;
  recommendationRules: TemplateRecommendationRules;
};

type TemplateKeywordPayload = {
  keywords: string[];
};

const DEFAULT_WEIGHTS: TemplateWeights = {
  resume: 40,
  skills: 35,
  experience: 25,
};

const MIN_WEIGHT = 5;
const WEIGHT_STEP = 5;

const DEFAULT_THRESHOLDS: TemplateThresholds = {
  passThreshold: 80,
  reviewThreshold: 70,
};

const DEFAULT_RECOMMENDATION_RULES: TemplateRecommendationRules = {
  pass: "综合评分达到通过阈值，建议进入下一轮面试。",
  review: "综合评分处于待定区间，建议人工复核关键风险点。",
  reject: "综合评分低于待定阈值，建议暂不推进。",
};

function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw?.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collectStringTerms(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringTerms(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectStringTerms(item));
  }

  return [];
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|,|，/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampPercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundToWeightStep(value: number) {
  return Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeWeights(value: unknown): TemplateWeights {
  const candidate = value && typeof value === "object" ? value as Partial<Record<keyof TemplateWeights, unknown>> : {};
  return normalizeWeightTotal({
    resume: clampPercent(readNumber(candidate.resume, DEFAULT_WEIGHTS.resume), DEFAULT_WEIGHTS.resume),
    skills: clampPercent(readNumber(candidate.skills, DEFAULT_WEIGHTS.skills), DEFAULT_WEIGHTS.skills),
    experience: clampPercent(readNumber(candidate.experience, DEFAULT_WEIGHTS.experience), DEFAULT_WEIGHTS.experience),
  });
}

function normalizeWeightTotal(weights: TemplateWeights): TemplateWeights {
  const total = weights.resume + weights.skills + weights.experience;
  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  const normalized = {
    resume: Math.max(MIN_WEIGHT, Math.round((weights.resume / total) * 100)),
    skills: Math.max(MIN_WEIGHT, Math.round((weights.skills / total) * 100)),
    experience: Math.max(MIN_WEIGHT, Math.round((weights.experience / total) * 100)),
  };

  let diff = 100 - (normalized.resume + normalized.skills + normalized.experience);
  while (diff !== 0) {
    if (diff > 0) {
      const key = ["resume", "skills", "experience"].sort((a, b) => normalized[b as keyof TemplateWeights] - normalized[a as keyof TemplateWeights])[0] as keyof TemplateWeights;
      normalized[key] += 1;
      diff -= 1;
    } else {
      const key = ["resume", "skills", "experience"].sort((a, b) => normalized[b as keyof TemplateWeights] - normalized[a as keyof TemplateWeights]).find((item) => normalized[item as keyof TemplateWeights] > MIN_WEIGHT) as keyof TemplateWeights | undefined;
      if (!key) {
        break;
      }
      normalized[key] -= 1;
      diff += 1;
    }
  }

  return normalized;
}

function normalizeThresholds(value: unknown): TemplateThresholds {
  const candidate = value && typeof value === "object" ? value as Partial<Record<keyof TemplateThresholds, unknown>> : {};
  return {
    passThreshold: clampPercent(readNumber(candidate.passThreshold, DEFAULT_THRESHOLDS.passThreshold), DEFAULT_THRESHOLDS.passThreshold),
    reviewThreshold: clampPercent(readNumber(candidate.reviewThreshold, DEFAULT_THRESHOLDS.reviewThreshold), DEFAULT_THRESHOLDS.reviewThreshold),
  };
}

function normalizeRecommendationRules(value: unknown): TemplateRecommendationRules {
  const candidate = value && typeof value === "object" ? value as Partial<Record<keyof TemplateRecommendationRules, unknown>> : {};
  return {
    pass: typeof candidate.pass === "string" && candidate.pass.trim() ? candidate.pass : DEFAULT_RECOMMENDATION_RULES.pass,
    review: typeof candidate.review === "string" && candidate.review.trim() ? candidate.review : DEFAULT_RECOMMENDATION_RULES.review,
    reject: typeof candidate.reject === "string" && candidate.reject.trim() ? candidate.reject : DEFAULT_RECOMMENDATION_RULES.reject,
  };
}

function parseMatchPayload(raw: string | null | undefined): TemplateMatchPayload {
  const parsed = safeParseJson(raw);
  const objectValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;

  return {
    hints: objectValue && Array.isArray(objectValue.hints) ? collectStringTerms(objectValue.hints) : collectStringTerms(parsed),
    weights: normalizeWeights(objectValue?.weights),
    thresholds: normalizeThresholds(objectValue?.thresholds),
    recommendationRules: normalizeRecommendationRules(objectValue?.recommendationRules),
  };
}

function parseKeywordPayload(raw: string | null | undefined): TemplateKeywordPayload {
  const parsed = safeParseJson(raw);
  const objectValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  return {
    keywords: objectValue && Array.isArray(objectValue.keywords) ? collectStringTerms(objectValue.keywords) : collectStringTerms(parsed),
  };
}

interface Props {
  open: boolean;
  template?: MatchingTemplate | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "success"): void;
}>();

const isSubmitting = ref(false);
const error = ref<string | null>(null);

const isEditing = computed(() => !!props.template);

const formData = ref({
  name: "",
  description: "",
  prompt: "",
  matchHints: "",
  keywords: "",
  weightResume: DEFAULT_WEIGHTS.resume,
  weightSkills: DEFAULT_WEIGHTS.skills,
  weightExperience: DEFAULT_WEIGHTS.experience,
  passThreshold: DEFAULT_THRESHOLDS.passThreshold,
  reviewThreshold: DEFAULT_THRESHOLDS.reviewThreshold,
  recommendationPass: DEFAULT_RECOMMENDATION_RULES.pass,
  recommendationReview: DEFAULT_RECOMMENDATION_RULES.review,
  recommendationReject: DEFAULT_RECOMMENDATION_RULES.reject,
  isDefault: false,
});

const totalWeight = computed(() => formData.value.weightResume + formData.value.weightSkills + formData.value.weightExperience);
const firstWeightBoundary = computed(() => formData.value.weightResume);
const secondWeightBoundary = computed(() => formData.value.weightResume + formData.value.weightSkills);
const thresholdPreview = computed(() => {
  return `通过 ≥ ${formData.value.passThreshold} · 待定 ${formData.value.reviewThreshold}-${Math.max(formData.value.reviewThreshold, formData.value.passThreshold - 1)} · 淘汰 < ${formData.value.reviewThreshold}`;
});

const weightTrackRef = ref<HTMLElement | null>(null);
const activeWeightHandle = ref<"first" | "second" | null>(null);

function applyWeightBoundaries(first: number, second: number) {
  const roundedFirst = roundToWeightStep(first);
  const roundedSecond = roundToWeightStep(second);
  const nextFirst = Math.max(MIN_WEIGHT, Math.min(100 - MIN_WEIGHT * 2, roundedFirst));
  const nextSecond = Math.max(nextFirst + MIN_WEIGHT, Math.min(100 - MIN_WEIGHT, roundedSecond));

  formData.value.weightResume = nextFirst;
  formData.value.weightSkills = nextSecond - nextFirst;
  formData.value.weightExperience = 100 - nextSecond;
}

function updateActiveWeightHandle(clientX: number) {
  const track = weightTrackRef.value;
  if (!track || !activeWeightHandle.value) {
    return;
  }

  const rect = track.getBoundingClientRect();
  const percent = ((clientX - rect.left) / rect.width) * 100;

  if (activeWeightHandle.value === "first") {
    applyWeightBoundaries(percent, secondWeightBoundary.value);
  } else {
    applyWeightBoundaries(firstWeightBoundary.value, percent);
  }
}

function stopWeightDrag() {
  activeWeightHandle.value = null;
  window.removeEventListener("pointermove", handleWeightPointerMove);
  window.removeEventListener("pointerup", stopWeightDrag);
}

function handleWeightPointerMove(event: PointerEvent) {
  updateActiveWeightHandle(event.clientX);
}

function startWeightDrag(handle: "first" | "second", event: PointerEvent) {
  if (isSubmitting.value) {
    return;
  }

  event.preventDefault();
  activeWeightHandle.value = handle;
  updateActiveWeightHandle(event.clientX);
  window.addEventListener("pointermove", handleWeightPointerMove);
  window.addEventListener("pointerup", stopWeightDrag);
}

function adjustWeightHandle(handle: "first" | "second", delta: number) {
  if (handle === "first") {
    applyWeightBoundaries(firstWeightBoundary.value + delta, secondWeightBoundary.value);
  } else {
    applyWeightBoundaries(firstWeightBoundary.value, secondWeightBoundary.value + delta);
  }
}

function handleWeightKeydown(handle: "first" | "second", event: KeyboardEvent) {
  const step = event.shiftKey ? WEIGHT_STEP * 2 : WEIGHT_STEP;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
    event.preventDefault();
    adjustWeightHandle(handle, -step);
  }
  if (event.key === "ArrowRight" || event.key === "ArrowUp") {
    event.preventDefault();
    adjustWeightHandle(handle, step);
  }
}

onUnmounted(() => {
  stopWeightDrag();
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.template) {
        const matchPayload = parseMatchPayload(props.template.matchHintsJson);
        const keywordPayload = parseKeywordPayload(props.template.keywordsJson);
        formData.value = {
          name: props.template.name,
          description: props.template.description || "",
          prompt: props.template.prompt || "",
          matchHints: matchPayload.hints.join("\n"),
          keywords: keywordPayload.keywords.join("\n"),
          weightResume: matchPayload.weights.resume,
          weightSkills: matchPayload.weights.skills,
          weightExperience: matchPayload.weights.experience,
          passThreshold: matchPayload.thresholds.passThreshold,
          reviewThreshold: matchPayload.thresholds.reviewThreshold,
          recommendationPass: matchPayload.recommendationRules.pass,
          recommendationReview: matchPayload.recommendationRules.review,
          recommendationReject: matchPayload.recommendationRules.reject,
          isDefault: props.template.isDefault,
        };
      } else {
        formData.value = {
          name: "",
          description: "",
          prompt: "",
          matchHints: "",
          keywords: "",
          weightResume: DEFAULT_WEIGHTS.resume,
          weightSkills: DEFAULT_WEIGHTS.skills,
          weightExperience: DEFAULT_WEIGHTS.experience,
          passThreshold: DEFAULT_THRESHOLDS.passThreshold,
          reviewThreshold: DEFAULT_THRESHOLDS.reviewThreshold,
          recommendationPass: DEFAULT_RECOMMENDATION_RULES.pass,
          recommendationReview: DEFAULT_RECOMMENDATION_RULES.review,
          recommendationReject: DEFAULT_RECOMMENDATION_RULES.reject,
          isDefault: false,
        };
      }
      error.value = null;
    }
  }
);

async function handleSubmit() {
  if (!formData.value.name.trim()) {
    error.value = "请输入模板名称";
    return;
  }

  if (!formData.value.prompt.trim()) {
    error.value = "请输入模板内容";
    return;
  }

  if (formData.value.passThreshold <= formData.value.reviewThreshold) {
    error.value = "通过阈值必须高于待定阈值";
    return;
  }

  isSubmitting.value = true;
  error.value = null;

  const matchPayload: TemplateMatchPayload = {
    hints: splitLines(formData.value.matchHints),
    weights: {
      resume: formData.value.weightResume,
      skills: formData.value.weightSkills,
      experience: formData.value.weightExperience,
    },
    thresholds: {
      passThreshold: formData.value.passThreshold,
      reviewThreshold: formData.value.reviewThreshold,
    },
    recommendationRules: {
      pass: formData.value.recommendationPass.trim(),
      review: formData.value.recommendationReview.trim(),
      reject: formData.value.recommendationReject.trim(),
    },
  };
  const keywordPayload: TemplateKeywordPayload = {
    keywords: splitLines(formData.value.keywords),
  };

  try {
    if (isEditing.value && props.template) {
      const updateData: UpdateMatchingTemplateInput = {
        name: formData.value.name,
        description: formData.value.description,
        prompt: formData.value.prompt,
        matchHintsJson: JSON.stringify(matchPayload),
        keywordsJson: JSON.stringify(keywordPayload),
        isDefault: formData.value.isDefault,
      };
      await screeningTemplatesApi.update(props.template.id, updateData);
    } else {
      const createData: CreateMatchingTemplateInput = {
        name: formData.value.name,
        description: formData.value.description,
        prompt: formData.value.prompt,
        matchHintsJson: JSON.stringify(matchPayload),
        keywordsJson: JSON.stringify(keywordPayload),
        isDefault: formData.value.isDefault,
      };
      await screeningTemplatesApi.create(createData);
    }
    emit("success");
    emit("update:open", false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "操作失败";
  } finally {
    isSubmitting.value = false;
  }
}

function handleClose() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog
    :open="open"
    content-class="sm:max-w-[860px] max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="handleClose"
  >
    <template #content>
      <AppDialogLayout body-class="space-y-4">
        <template #header>
          <DialogHeader>
            <DialogTitle>{{ isEditing ? "筛选模板编辑态" : "新建筛选模板" }}</DialogTitle>
          </DialogHeader>
        </template>

        <section class="space-y-4 rounded-[6px] border-0 bg-[#FFFFFF] p-4 shadow-none">
          <div>
            <p class="text-[16px] font-semibold text-[#1A1A1A]">基础信息</p>
            <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">名称、说明和模板正文会直接用于导入页的筛选模板选择。</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
              <Label for="name">模板名称 <span class="text-destructive">*</span></Label>
              <Input
                id="name"
                v-model="formData.name"
                placeholder="输入模板名称"
                :disabled="isSubmitting"
              />
            </div>

            <div class="space-y-2">
              <Label for="description">描述</Label>
              <Input
                id="description"
                v-model="formData.description"
                placeholder="输入模板描述（可选）"
                :disabled="isSubmitting"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label for="prompt">
              模板内容 <span class="text-destructive">*</span>
              <span class="text-xs text-muted-foreground ml-2">支持 Markdown 格式</span>
            </Label>
            <Textarea
              id="prompt"
              v-model="formData.prompt"
              placeholder="输入模板内容..."
              :rows="8"
              :disabled="isSubmitting"
            />
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
          <div class="space-y-4 rounded-[6px] border-0 bg-[#FFFFFF] p-4 shadow-none">
            <div>
              <p class="text-[16px] font-semibold text-[#1A1A1A]">权重配置</p>
              <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">用于解释模板评分侧重点，同时写入模板匹配配置。</p>
            </div>

            <div class="space-y-3 rounded-[6px] bg-[#F3F6FA] p-3">
              <div class="grid gap-3 lg:grid-cols-3">
                <div class="flex items-start justify-between rounded-[6px] bg-[#FFFFFF] px-4 py-3">
                  <div class="min-w-0">
                    <p class="text-[14px] font-semibold text-[#1A1A1A]">简历完整度</p>
                    <p class="mt-1 text-[12px] leading-5 text-[#6B7280]">信息结构与基础字段</p>
                  </div>
                  <span class="ml-3 shrink-0 text-right leading-none text-[#2563EB]">
                    <span class="inline-flex items-end">
                      <span class="text-[44px] font-semibold tracking-[-0.05em]">{{ formData.weightResume }}</span>
                      <span class="mb-1 ml-1 text-[15px] font-semibold text-[#5B7FD6]">%</span>
                    </span>
                  </span>
                </div>
                <div class="flex items-start justify-between rounded-[6px] bg-[#FFFFFF] px-4 py-3">
                  <div class="min-w-0">
                    <p class="text-[14px] font-semibold text-[#1A1A1A]">技能匹配</p>
                    <p class="mt-1 text-[12px] leading-5 text-[#6B7280]">岗位关键词与能力栈</p>
                  </div>
                  <span class="ml-3 shrink-0 text-right leading-none text-[#2563EB]">
                    <span class="inline-flex items-end">
                      <span class="text-[44px] font-semibold tracking-[-0.05em]">{{ formData.weightSkills }}</span>
                      <span class="mb-1 ml-1 text-[15px] font-semibold text-[#5B7FD6]">%</span>
                    </span>
                  </span>
                </div>
                <div class="flex items-start justify-between rounded-[6px] bg-[#FFFFFF] px-4 py-3">
                  <div class="min-w-0">
                    <p class="text-[14px] font-semibold text-[#1A1A1A]">项目经历</p>
                    <p class="mt-1 text-[12px] leading-5 text-[#6B7280]">实践深度与相关经验</p>
                  </div>
                  <span class="ml-3 shrink-0 text-right leading-none text-[#2563EB]">
                    <span class="inline-flex items-end">
                      <span class="text-[44px] font-semibold tracking-[-0.05em]">{{ formData.weightExperience }}</span>
                      <span class="mb-1 ml-1 text-[15px] font-semibold text-[#5B7FD6]">%</span>
                    </span>
                  </span>
                </div>
              </div>

              <div class="rounded-[6px] bg-[#FFFFFF] px-3 py-3">
                <div
                  ref="weightTrackRef"
                  class="relative h-6 select-none rounded-full bg-[#E5E7EB]"
                  :class="isSubmitting ? 'opacity-60' : 'cursor-ew-resize'"
                  aria-label="权重配置拖拽条"
                >
                  <div class="absolute inset-0 overflow-hidden rounded-full">
                    <div class="flex h-full w-full">
                      <div class="h-full bg-[#1D4ED8]" :style="{ width: `${formData.weightResume}%` }" />
                      <div class="h-full bg-[#10B981]" :style="{ width: `${formData.weightSkills}%` }" />
                      <div class="h-full bg-[#F97316]" :style="{ width: `${formData.weightExperience}%` }" />
                    </div>
                  </div>

                  <button
                    type="button"
                    class="absolute top-1/2 z-10 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#FFFFFF] bg-[#94A3B8] outline-none transition focus-visible:ring-2 focus-visible:ring-[#0062FF] disabled:cursor-not-allowed"
                    :class="activeWeightHandle === 'first' ? 'bg-[#64748B]' : 'hover:bg-[#7C8CA1]'"
                    :style="{ left: `${firstWeightBoundary}%` }"
                    :disabled="isSubmitting"
                    aria-label="调整简历完整度和技能匹配的分界点"
                    @pointerdown="startWeightDrag('first', $event)"
                    @keydown="handleWeightKeydown('first', $event)"
                  />
                  <button
                    type="button"
                    class="absolute top-1/2 z-10 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[#FFFFFF] bg-[#94A3B8] outline-none transition focus-visible:ring-2 focus-visible:ring-[#0062FF] disabled:cursor-not-allowed"
                    :class="activeWeightHandle === 'second' ? 'bg-[#64748B]' : 'hover:bg-[#7C8CA1]'"
                    :style="{ left: `${secondWeightBoundary}%` }"
                    :disabled="isSubmitting"
                    aria-label="调整技能匹配和项目经历的分界点"
                    @pointerdown="startWeightDrag('second', $event)"
                    @keydown="handleWeightKeydown('second', $event)"
                  />
                </div>

                <div class="mt-2 flex flex-col gap-1 text-[11px] text-[#6B7280] sm:flex-row sm:items-center sm:justify-between">
                  <span>拖动两个控制点调整三段占比</span>
                  <span>按 5% 调整，Shift 为 10%</span>
                </div>
              </div>
            </div>

            <div class="rounded-[6px] bg-[#EEF4FF] px-3 py-2 text-xs leading-5 text-[#4B5563]">
              当前权重合计固定为 <span class="font-semibold text-[#1A1A1A]">{{ totalWeight }}%</span>。三段权重共享 100%，更适合直接比较模板侧重点。
            </div>
          </div>

          <div class="space-y-4 rounded-[6px] border-0 bg-[#FFFFFF] p-4 shadow-none">
            <div>
              <p class="text-[16px] font-semibold text-[#1A1A1A]">阈值</p>
              <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">模板级阈值作为编辑态说明保存，实际批次阈值仍由模板组控制。</p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div class="space-y-2">
                <Label for="template-pass-threshold">通过阈值</Label>
                <Input id="template-pass-threshold" v-model.number="formData.passThreshold" type="number" min="1" max="100" :disabled="isSubmitting" />
              </div>
              <div class="space-y-2">
                <Label for="template-review-threshold">待定阈值</Label>
                <Input id="template-review-threshold" v-model.number="formData.reviewThreshold" type="number" min="1" max="99" :disabled="isSubmitting" />
              </div>
            </div>

            <div class="rounded-[6px] bg-[#F9FAFB] px-3 py-2 text-xs leading-5 text-[#4B5563]">
              {{ thresholdPreview }}
            </div>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-3 rounded-[6px] border-0 bg-[#FFFFFF] p-4 shadow-none">
            <div>
              <p class="text-[16px] font-semibold text-[#1A1A1A]">匹配提示词</p>
              <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">每行一个提示词，用于模板自动推荐。</p>
            </div>
            <Textarea id="match-hints" v-model="formData.matchHints" :rows="4" placeholder="例如：中后台\n复杂表单\n招聘系统" :disabled="isSubmitting" />
            <Textarea id="keywords" v-model="formData.keywords" :rows="4" placeholder="关键词，例如：Vue\nTypeScript\n数据建模" :disabled="isSubmitting" />
          </div>

          <div class="space-y-3 rounded-[6px] border-0 bg-[#FFFFFF] p-4 shadow-none">
            <div>
              <p class="text-[16px] font-semibold text-[#1A1A1A]">推荐规则</p>
              <p class="mt-1 text-[12px] leading-5 text-[#4B5563]">按通过、待定、淘汰三段维护筛选解释口径。</p>
            </div>
            <Textarea id="recommend-pass" v-model="formData.recommendationPass" :rows="2" :disabled="isSubmitting" />
            <Textarea id="recommend-review" v-model="formData.recommendationReview" :rows="2" :disabled="isSubmitting" />
            <Textarea id="recommend-reject" v-model="formData.recommendationReject" :rows="2" :disabled="isSubmitting" />
          </div>
        </section>

        <div class="flex items-center justify-between rounded-[6px] border-0 bg-[#FFFFFF] px-4 py-3">
          <div>
            <p class="text-sm font-medium text-[#1A1A1A]">设为默认模板</p>
            <p class="mt-1 text-xs text-[#4B5563]">默认模板会作为未指定分组时的候选模板。</p>
          </div>
          <Checkbox
            id="isDefault"
            :checked="formData.isDefault"
            @update:checked="formData.isDefault = $event"
            :disabled="isSubmitting"
          />
        </div>

        <div v-if="error" class="text-sm text-destructive">
          {{ error }}
        </div>

        <template #footer>
          <Button variant="outline" :disabled="isSubmitting" @click="handleClose">
            取消
          </Button>
          <Button :disabled="isSubmitting" @click="handleSubmit">
            {{ isSubmitting ? "保存中..." : isEditing ? "保存" : "创建" }}
          </Button>
        </template>
      </AppDialogLayout>
    </template>
  </Dialog>
</template>
