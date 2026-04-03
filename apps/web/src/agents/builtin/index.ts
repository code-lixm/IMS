/**
 * 自动导入所有内置 Agent
 * 
 * 这个文件会在应用启动时被导入，从而触发所有 Agent 的自动注册
 */

// 导入所有内置 Agent
import './resume-analyzer';
import './interview-coordinator';
import './tech-interviewer';
import './hr-interviewer';
import './salary-advisor';
import './search-assistant';
import './email-agent';

// 导出所有 Manifest（用于 UI 展示）
export { resumeAnalyzerManifest } from './resume-analyzer';
export { interviewCoordinatorManifest } from './interview-coordinator';
export { techInterviewerManifest } from './tech-interviewer';
export { hrInterviewerManifest } from './hr-interviewer';
export { salaryAdvisorManifest } from './salary-advisor';
export { searchAssistantManifest } from './search-assistant';
export { emailAgentManifest } from './email-agent';

// 导出所有 Factory 函数（用于测试）
export { createResumeAnalyzerAgent } from './resume-analyzer';
export { createInterviewCoordinatorAgent } from './interview-coordinator';
export { createTechInterviewerAgent } from './tech-interviewer';
export { createHRInterviewerAgent } from './hr-interviewer';
export { createSalaryAdvisorAgent } from './salary-advisor';
export { createSearchAssistantAgent } from './search-assistant';
export { createEmailAgent } from './email-agent';
