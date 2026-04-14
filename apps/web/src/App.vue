<template>
  <div class="min-h-screen bg-background">
    <router-view />
    <OnboardingTourHost />
    <AppNotificationCenter />

    <!-- Auth initializing overlay -->
    <Transition name="fade">
      <div
        v-if="authStore.loading && !authStore.initialized"
        class="fixed inset-0 z-[100] bg-background/70 backdrop-blur-md"
      >
        <div class="relative flex h-full items-center justify-center px-6">
          <div class="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border/60 bg-background/80 px-8 py-8 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-background/80 dark:shadow-black/30">
            <div class="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/12 to-transparent" />

            <div class="relative flex flex-col items-center gap-5 text-center">
              <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 bg-background/90 shadow-sm">
                <div class="loading-brand-ring absolute inset-0 rounded-2xl border border-foreground/8" />
                <div class="loading-brand-core flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Briefcase class="h-5 w-5" />
                </div>
              </div>

              <div class="space-y-1">
                <p class="text-base font-semibold tracking-[0.14em] text-foreground">IMS</p>
                <p class="text-sm text-muted-foreground">正在验证登录状态…</p>
              </div>

              <div class="flex items-center gap-1.5">
                <span class="loading-dot" />
                <span class="loading-dot loading-dot-delay-1" />
                <span class="loading-dot loading-dot-delay-2" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Briefcase } from "lucide-vue-next";
import AppNotificationCenter from "@/components/app-notification-center.vue";
import OnboardingTourHost from "@/components/onboarding-tour-host.vue";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/composables/use-theme";

const authStore = useAuthStore();
void useTheme();
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.28s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.loading-brand-ring {
  animation: loading-ring-pulse 2.4s ease-in-out infinite;
}

.loading-brand-core {
  animation: loading-core-float 2.2s ease-in-out infinite;
}

.loading-dot {
  height: 0.38rem;
  width: 0.38rem;
  border-radius: 9999px;
  background: hsl(var(--foreground));
  opacity: 0.22;
  animation: loading-dot-bounce 1.1s ease-in-out infinite;
}

.loading-dot-delay-1 {
  animation-delay: 0.14s;
}

.loading-dot-delay-2 {
  animation-delay: 0.28s;
}

@keyframes loading-core-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-1px) scale(1.02);
  }
}

@keyframes loading-ring-pulse {
  0%,
  100% {
    opacity: 0.42;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.04);
  }
}

@keyframes loading-dot-bounce {
  0%,
  80%,
  100% {
    opacity: 0.32;
    transform: translateY(0) scale(0.92);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px) scale(1.06);
  }
}
</style>
