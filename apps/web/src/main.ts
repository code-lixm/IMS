import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import { pinia } from "./stores";
import { initTheme } from "./composables/use-theme";

import "./styles/main.css";

initTheme();

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount("#app");
