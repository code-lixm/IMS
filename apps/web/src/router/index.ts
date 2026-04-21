import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { pinia } from "@/stores";
import CandidatesView from "@/views/CandidatesView.vue";
import CandidateDetailView from "@/views/CandidateDetailView.vue";
import ImportView from "@/views/ImportView.vue";
import LoginView from "@/views/LoginView.vue";
import SettingsView from "@/views/SettingsView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import ServerErrorView from "@/views/ServerErrorView.vue";
import LUIView from "@/views/LUIView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/candidates" },
    { path: "/login", component: LoginView, meta: { guestOnly: true } },
    { path: "/candidates", component: CandidatesView, meta: { requiresAuth: true } },
    { path: "/candidates/:id", component: CandidateDetailView, meta: { requiresAuth: true } },
    { path: "/import", component: ImportView, meta: { requiresAuth: true } },
    { path: "/settings", component: SettingsView, meta: { requiresAuth: true } },
    { path: "/lui", component: LUIView, meta: { requiresAuth: true } },
    { path: "/500", component: ServerErrorView },
    { path: "/:pathMatch(.*)*", component: NotFoundView },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore(pinia);
  await authStore.ensureStatus();

  const isAuthenticated = authStore.status === "valid";
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
  const guestOnly = to.matched.some((record) => record.meta.guestOnly);
  const forceReauth = typeof to.query.reauth === "string" && to.query.reauth === "1";

  if (requiresAuth && !isAuthenticated) {
    return { path: "/login", query: { redirect: to.fullPath, reauth: "1" } };
  }

  if (guestOnly && isAuthenticated && !forceReauth) {
    const redirect = typeof to.query.redirect === "string" ? to.query.redirect : "/candidates";
    return redirect;
  }

  return true;
});

export default router;
