import { computed, type ComputedRef, type Ref } from "vue";
import type { Task } from "./types";

interface LuiTaskQueueModuleOptions {
  tasks: Ref<Task[]>;
  isProcessing: Ref<boolean>;
}

export interface LuiTaskQueueModule {
  currentTask: ComputedRef<Task | undefined>;
  pendingTasks: ComputedRef<Task[]>;
  runningTasks: ComputedRef<Task[]>;
  completedTasks: ComputedRef<Task[]>;
  failedTasks: ComputedRef<Task[]>;
  queueLength: ComputedRef<number>;
  addTask: (type: Task["type"], description: string) => string;
  updateTask: (id: string, updates: Partial<Omit<Task, "id" | "createdAt">>) => void;
  completeTask: (id: string) => void;
  failTask: (id: string, error?: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

const MAX_CONCURRENT = 3;

export function createLuiTaskQueueModule(options: LuiTaskQueueModuleOptions): LuiTaskQueueModule {
  const { tasks, isProcessing } = options;

  const currentTask = computed(() =>
    tasks.value.find((t) => t.status === "running")
  );

  const pendingTasks = computed(() =>
    tasks.value.filter((t) => t.status === "pending")
  );

  const runningTasks = computed(() =>
    tasks.value.filter((t) => t.status === "running")
  );

  const completedTasks = computed(() =>
    tasks.value.filter((t) => t.status === "completed")
  );

  const failedTasks = computed(() =>
    tasks.value.filter((t) => t.status === "failed")
  );

  const queueLength = computed(() => tasks.value.length);

  function addTask(type: Task["type"], description: string): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date();

    tasks.value.push({
      id,
      type,
      status: "pending",
      description,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    });

    processQueue();
    return id;
  }

  function updateTask(id: string, updates: Partial<Omit<Task, "id" | "createdAt">>): void {
    const index = tasks.value.findIndex((t) => t.id === id);
    if (index >= 0) {
      tasks.value[index] = {
        ...tasks.value[index],
        ...updates,
        updatedAt: new Date(),
      };
    }
  }

  function completeTask(id: string): void {
    updateTask(id, { status: "completed", progress: 100 });
    isProcessing.value = false;
    processQueue();
  }

  function failTask(id: string, error?: string): void {
    updateTask(id, { status: "failed" });
    console.error(`Task ${id} failed:`, error);
    isProcessing.value = false;
    processQueue();
  }

  function removeTask(id: string): void {
    tasks.value = tasks.value.filter((t) => t.id !== id);
  }

  function clearCompleted(): void {
    tasks.value = tasks.value.filter((t) => t.status !== "completed");
  }

  function processQueue(): void {
    if (isProcessing.value) return;

    const running = runningTasks.value.length;
    if (running >= MAX_CONCURRENT) return;

    const nextTask = pendingTasks.value[0];
    if (!nextTask) return;

    isProcessing.value = true;
    updateTask(nextTask.id, { status: "running" });
  }

  return {
    currentTask,
    pendingTasks,
    runningTasks,
    completedTasks,
    failedTasks,
    queueLength,
    addTask,
    updateTask,
    completeTask,
    failTask,
    removeTask,
    clearCompleted,
  };
}
