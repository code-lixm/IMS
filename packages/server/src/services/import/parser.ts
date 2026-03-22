import type { ParsedResume } from "./types";

const PHONE_PAT = /(?:\+?86)?1[3-9]\d{9}/g;
const EMAIL_PAT = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const YEARS_PAT = /(\d{1,2})\s*[年yrs]+[经]?[验]?/gi;
const NAME_PAT = /^[^\u4e00-\u9fff\u3400-\u4dbf]*([\u4e00-\u9fff\u3400-\u4dbf]{2,4})(?:先生|女士|同学)?/m;
const SECTION_PAT = /^(?:工作经历|项目经历|教育背景|技能特长|个人简介|联系方式|基本信息)[:：]?/im;

const SKILL_KEYWORDS = [
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "C++", "C#",
  "React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt",
  "Node.js", "Node", "Express", "Koa", "FastAPI", "Django", "Flask", "Spring",
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch",
  "Docker", "Kubernetes", "K8s", "Git", "CI/CD", "Jenkins", "GitHub Actions",
  "AWS", "Azure", "GCP", "Aliyun", "阿里云",
  "TCP/IP", "HTTP", "WebSocket", "REST", "GraphQL", "gRPC",
  "Linux", "Nginx",
  "机器学习", "深度学习", "TensorFlow", "PyTorch",
  "前端", "后端", "全栈", "移动端", "iOS", "Android", "Flutter", "React Native",
  "架构", "设计模式", "微服务", "分布式", "高并发",
];

export function parseResumeText(text: string): ParsedResume {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  const phones = text.match(PHONE_PAT);
  const phone = phones?.[0] ?? null;
  const emails = text.match(EMAIL_PAT);
  const email = emails?.[0] ?? null;

  let name: string | null = null;
  for (const line of lines.slice(0, 10)) {
    const m = line.match(NAME_PAT);
    if (m) { name = m[1]; break; }
  }

  const yearsMatch = text.match(YEARS_PAT);
  const yearsOfExperience = yearsMatch ? parseInt(yearsMatch[1], 10) : null;

  const skills: string[] = [];
  for (const line of lines) {
    for (const kw of SKILL_KEYWORDS) {
      if (line.toLowerCase().includes(kw.toLowerCase()) && !skills.includes(kw)) {
        skills.push(kw);
      }
    }
  }

  const workHistory: string[] = [];
  const education: string[] = [];
  let captureMode: "work" | "edu" | "none" = "none";

  for (const line of lines) {
    if (/工作经历|项目经历/.test(line)) { captureMode = "work"; continue; }
    if (/教育背景|毕业院校|学历/.test(line)) { captureMode = "edu"; continue; }
    if (SECTION_PAT.test(line)) { captureMode = "none"; continue; }
    if (captureMode === "work" && line.length > 10) workHistory.push(line);
    if (captureMode === "edu" && line.length > 5) education.push(line);
  }

  let position: string | null = null;
  const posMatch = text.match(/(?:应聘|申请|求职)[：:\s]*([^\n,，]{2,20})/i);
  if (posMatch) position = posMatch[1].trim();
  else {
    for (const line of lines) {
      if (line.length >= 4 && line.length <= 30 && !SECTION_PAT.test(line) && line !== name) {
        position = line; break;
      }
    }
  }

  return { name, phone, email, position, yearsOfExperience, skills: skills.slice(0, 20), education, workHistory, rawText: text };
}
