<template>
  <span class="hidden" aria-hidden="true" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";

interface OnboardingStep {
  title: string;
  description: string;
  route?: string;
  selector?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

const steps: OnboardingStep[] = [
  {
    title: "首次使用引导",
    description:
      "接下来会带你快速看完候选人工作台、任务初筛、模型配置和模型对话这些高频入口。整个过程只会在首次进入时自动出现一次。",
    side: "bottom",
    align: "center",
  },
  {
    title: "候选人工作台入口",
    description:
      "这里是日常主页面。你可以搜索候选人、新建候选人、进入导入任务，或者手动触发同步。",
    route: "/candidates",
    selector: '[data-onboarding="candidates-header"]',
    side: "bottom",
    align: "start",
  },
  {
    title: "候选人列表",
    description:
      "列表支持批量选择、分享、导出，并且可以直接打开候选人的 AI 工作台继续处理。",
    route: "/candidates",
    selector: '[data-onboarding="candidates-list"]',
    side: "right",
    align: "start",
  },
  {
    title: "任务初筛",
    description:
      "这里控制新建导入是否默认开启 AI 初筛。打开后，导入完成会自动产出通过、待定或淘汰结论。",
    route: "/import",
    selector: '[data-onboarding="screening-toggle"]',
    side: "bottom",
    align: "start",
  },
  {
    title: "模型配置",
    description:
      "在系统设置里维护 AI Gateway 端点。配置好 API Key 和默认端点后，LUI 的模型列表会自动出现可选模型。",
    route: "/settings",
    selector: '[data-onboarding="gateway-endpoints"]',
    side: "left",
    align: "start",
  },
  {
    title: "Agent 管理",
    description:
      "如果团队有不同流程或角色分工，可以在这里维护不同 Agent 的提示词、工具和默认设置。",
    route: "/settings",
    selector: '[data-onboarding="agent-management"]',
    side: "left",
    align: "start",
  },
  {
    title: "会话列表",
    description:
      "进入 LUI 后，左侧会保存历史会话和候选人上下文，方便随时回到之前的分析、追问和工作流阶段。",
    route: "/lui",
    selector: '[data-onboarding="conversation-list"]',
    side: "right",
    align: "start",
  },
  {
    title: "选择 Agent",
    description:
      "先选 Agent，再决定这次对话走通用分析、候选人工作流，还是其他定制角色。",
    route: "/lui",
    selector: '[data-onboarding="agent-selector"]',
    side: "bottom",
    align: "start",
  },
  {
    title: "选择对话模型",
    description:
      "进入 LUI 后，先从这里切换本次对话要使用的模型或 Provider。模型列表来自你在设置里配置的可用端点。",
    route: "/lui",
    selector: '[data-onboarding="model-selector"]',
    side: "top",
    align: "start",
  },
  {
    title: "开始模型对话",
    description:
      "最后一步就是把内容直接丢到输入框：简历、面试纪要、候选人问题都可以直接粘贴给我，必要时再附加文件，然后发送开始处理。",
    route: "/lui",
    selector: '[data-onboarding="prompt-input"]',
    side: "top",
    align: "center",
  },
];

const authStore = useAuthStore();
const onboardingStore = useOnboardingStore();
const route = useRoute();
const router = useRouter();

let tour: ReturnType<typeof driver> | null = null;
let startTimer: number | null = null;
let handledRequestRunId = 0;
let autoStartAttempted = false;

onMounted(() => {
  onboardingStore.hydrate();
});

onBeforeUnmount(() => {
  clearStartTimer();
  destroyTour();
});

watch(
  () => onboardingStore.requestedRunId,
  (nextRunId) => {
    if (!canStartTour()) {
      return;
    }

    if (nextRunId <= handledRequestRunId) {
      return;
    }

    handledRequestRunId = nextRunId;
    autoStartAttempted = true;
    scheduleStart({ force: true });
  },
);

watch(
  () => [authStore.initialized, authStore.status, onboardingStore.canAutoStart] as const,
  ([initialized, status, canAutoStart]) => {
    if (!initialized || status !== "valid" || !canAutoStart) {
      return;
    }

    if (autoStartAttempted || onboardingStore.isActive) {
      return;
    }

    autoStartAttempted = true;
    scheduleStart();
  },
  { immediate: true },
);

watch(
  () => authStore.status,
  (status) => {
    if (status === "valid") {
      return;
    }

    autoStartAttempted = false;
    handledRequestRunId = 0;
    clearStartTimer();
    destroyTour();
  },
);

function canStartTour() {
  return authStore.initialized && authStore.status === "valid";
}

function clearStartTimer() {
  if (startTimer) {
    window.clearTimeout(startTimer);
    startTimer = null;
  }
}

function destroyTour() {
  tour?.destroy();
  tour = null;
  onboardingStore.setActive(false);
}

function createTour() {
  destroyTour();

  tour = driver({
    animate: true,
    allowClose: true,
    showProgress: true,
    overlayColor: "rgba(15, 23, 42, 0.58)",
    stagePadding: 10,
    stageRadius: 20,
    popoverClass: "ims-onboarding-popover",
    steps: steps.map((step, index) => ({
      ...(step.selector ? { element: step.selector } : {}),
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? "bottom",
        align: step.align ?? "center",
        showButtons:
          index === 0
            ? ["next", "close"]
            : ["previous", "next", "close"],
        nextBtnText: index === steps.length - 1 ? "完成" : "下一步",
        prevBtnText: "上一步",
        doneBtnText: "完成",
        onNextClick: () => {
          void moveToStep(index + 1, "next");
        },
        onPrevClick: () => {
          void moveToStep(index - 1, "previous");
        },
        onCloseClick: () => {
          finishTour("dismissed");
        },
      },
    })),
  });
}

function scheduleStart(options?: { force?: boolean }) {
  clearStartTimer();
  startTimer = window.setTimeout(() => {
    void startTour(options);
  }, 420);
}

async function startTour(options?: { force?: boolean }) {
  if (!canStartTour()) {
    return;
  }

  if (!options?.force && !onboardingStore.canAutoStart) {
    return;
  }

  clearStartTimer();
  createTour();
  onboardingStore.setActive(true);
  await nextTick();
  tour?.drive(0);
}

async function moveToStep(targetIndex: number, direction: "next" | "previous") {
  if (targetIndex < 0) {
    return;
  }

  if (targetIndex >= steps.length) {
    finishTour("completed");
    return;
  }

  const targetStep = steps[targetIndex];
  await ensureStepReady(targetStep);

  if (!tour) {
    return;
  }

  if (direction === "next") {
    tour.moveNext();
    return;
  }

  tour.movePrevious();
}

async function ensureStepReady(step: OnboardingStep) {
  if (step.route && route.path !== step.route) {
    await router.push(step.route);
  }

  await nextTick();

  if (step.selector) {
    await waitForElement(step.selector);
  }
}

function waitForElement(selector: string, timeoutMs = 8000) {
  return new Promise<Element>((resolve, reject) => {
    const immediateMatch = document.querySelector(selector);
    if (immediateMatch) {
      resolve(immediateMatch);
      return;
    }

    const observer = new MutationObserver(() => {
      const nextMatch = document.querySelector(selector);
      if (!nextMatch) {
        return;
      }

      observer.disconnect();
      window.clearTimeout(timeoutId);
      resolve(nextMatch);
    });

    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Onboarding target not found: ${selector}`));
    }, timeoutMs);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }).catch(() => {
    return document.body;
  });
}

function finishTour(result: "completed" | "dismissed") {
  if (result === "completed") {
    onboardingStore.markCompleted();
  } else {
    onboardingStore.dismiss();
  }

  destroyTour();
}
</script>
