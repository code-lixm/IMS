import { createRouter, createWebHistory } from "vue-router";
import CandidatesView from "@/views/CandidatesView.vue";
import CandidateDetailView from "@/views/CandidateDetailView.vue";
import ImportView from "@/views/ImportView.vue";
import SettingsView from "@/views/SettingsView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/candidates" },
    { path: "/candidates", component: CandidatesView },
    { path: "/candidates/:id", component: CandidateDetailView },
    { path: "/import", component: ImportView },
    { path: "/settings", component: SettingsView },
  ],
});

export default router;
