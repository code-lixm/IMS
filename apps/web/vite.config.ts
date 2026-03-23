import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import vueDevTools from "vite-plugin-vue-devtools";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";

export default defineConfig({
  plugins: [
    vueDevTools({ componentInspector: true }),
    vue(),
    AutoImport({
      imports: ["vue", "vue-router", "pinia"],
      dts: "src/auto-imports.d.ts",
    }),
    Components({
      dts: "src/components.d.ts",
      dirs: ["src/components/ui"],
    }),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
