import { defineConfig, presetIcons } from "unocss";
import { presetWind } from "@unocss/preset-wind3";
import presetAnimations from "unocss-preset-animations";
import { builtinColors, presetShadcn } from "unocss-preset-shadcn";

export default defineConfig({
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn(builtinColors.map((c) => ({ color: c }))),
    presetIcons({
      scale: 1.1,
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
  content: {
    pipeline: {
      include: [
        // the default
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // include js/ts files
        "(components|src)/**/*.{js,ts}",
        "../../packages/shared/src/**/*.{js,ts}",
      ],
    },
  },
  safelist: [
    "bg-violet-50",
    "bg-violet-100",
    "bg-violet-300",
    "bg-violet-400",
    "bg-cyan-50",
    "bg-amber-50",
    "bg-slate-100",
    "bg-slate-200",
    "bg-orange-50",
    "bg-orange-100",
    "bg-rose-50",
    "bg-rose-100",
    "bg-red-100",
    "bg-sky-50",
    "bg-sky-100",
    "bg-blue-50",
    "bg-blue-100",
    "bg-blue-200",
    "bg-teal-50",
    "bg-emerald-50",
    "bg-indigo-50",
    "bg-indigo-200",
    "bg-indigo-300",
    "bg-green-100",
    "bg-purple-200",
    "bg-purple-300",
    "bg-gray-100",
    "text-violet-700",
    "text-violet-800",
    "text-violet-900",
    "text-violet-950",
    "text-cyan-700",
    "text-amber-700",
    "text-slate-600",
    "text-orange-700",
    "text-orange-800",
    "text-rose-700",
    "text-rose-800",
    "text-red-800",
    "text-sky-700",
    "text-sky-800",
    "text-blue-700",
    "text-blue-800",
    "text-blue-900",
    "text-teal-700",
    "text-emerald-700",
    "text-indigo-700",
    "text-indigo-900",
    "text-green-800",
    "text-purple-900",
    "text-gray-700",
  ],
});
