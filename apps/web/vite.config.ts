import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import vueDevTools from "vite-plugin-vue-devtools";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { mockDevServerPlugin } from "vite-plugin-mock-dev-server";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const mockEnabled = env.VITE_MOCK === "true"

  return {
    plugins: [
      vueDevTools({ componentInspector: true }),
      vue(),
      tailwindcss(),
      AutoImport({
        imports: ["vue", "vue-router", "pinia"],
        dts: "src/auto-imports.d.ts",
      }),
      Components({
        dts: "src/components.d.ts",
        dirs: ["src/components/ui", "src/components/lui", "src/agents"],
      }),
      mockDevServerPlugin({
        enabled: mockEnabled,
        log: mockEnabled ? "info" : "silent",
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      port: 9091,
      host: process.env.VITE_DEV_HOST || true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:9092",
          changeOrigin: true,
        },
      },
    },
  }
});
