import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(scriptDir, "..");
const srcRoot = join(projectRoot, "src");

function collectSourceFiles(root, current = root) {
  const entries = readdirSync(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    const relativePath = relative(root, absolutePath);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(root, absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!/\.(ts|vue)$/.test(entry.name)) {
      continue;
    }

    if (/\.test\.ts$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) {
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

const files = collectSourceFiles(srcRoot);

const rules = [
  {
    name: "no-direct-fetch",
    pattern: /\bfetch\s*\(/g,
    allow: ["api/client.ts"],
    message: "禁止在 API 客户端之外直接调用 fetch()",
  },
  {
    name: "no-alert",
    pattern: /\balert\s*\(/g,
    allow: [],
    message: "禁止使用 alert() 作为用户反馈",
  },
  {
    name: "no-empty-catch",
    pattern: /catch\s*\{[\s\S]*?\}/g,
    allow: [],
    message: "禁止空 catch，至少显式命名错误或说明处理方式",
  },
  {
    name: "no-swallowed-catch-chain",
    pattern: /\.catch\s*\(\s*\(\)\s*=>\s*undefined\s*\)/g,
    allow: [],
    message: "禁止使用 .catch(() => undefined) 吞错",
  },
  {
    name: "no-ts-ignore",
    pattern: /@ts-ignore|@ts-expect-error/g,
    allow: [],
    message: "禁止使用 ts-ignore / ts-expect-error",
  },
  {
    name: "no-as-any",
    pattern: /\sas\s+any\b/g,
    allow: [],
    message: "禁止使用 as any 绕过类型系统",
  },
  {
    name: "no-console-error-outside-normalize",
    pattern: /console\.error\s*\(/g,
    allow: ["lib/errors/normalize.ts"],
    message: "console.error 仅允许保留在统一错误上报入口",
  },
];

const violations = [];

for (const relativePath of files) {
  const absolutePath = join(srcRoot, relativePath);
  const content = readFileSync(absolutePath, "utf8");

  for (const rule of rules) {
    if (rule.allow.includes(relativePath)) {
      continue;
    }

    const matches = content.match(rule.pattern);
    if (!matches || matches.length === 0) {
      continue;
    }

    violations.push({
      file: relative(projectRoot, absolutePath),
      rule: rule.name,
      message: rule.message,
      count: matches.length,
    });
  }
}

if (violations.length > 0) {
  console.error("前端治理检查失败：\n");
  for (const violation of violations) {
    console.error(`- [${violation.rule}] ${violation.file} (${violation.count}): ${violation.message}`);
  }
  process.exit(1);
}

console.log(`前端治理检查通过，共扫描 ${files.length} 个文件。`);
