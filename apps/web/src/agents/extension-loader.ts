/**
 * Agent 扩展加载器
 * 
 * 文件位置: apps/web/src/agents/extension-loader.ts
 * 
 * 职责:
 * - 从远程 URL 加载 ESM 模块
 * - 从本地文件加载扩展
 * - 验证扩展的完整性和权限
 * - 注册扩展到 AgentHost
 */

import { agentHost, type AgentManifest, type AgentFactory } from './host';
import type { Component } from 'vue';

/**
 * Agent 扩展定义
 */
export interface AgentExtension {
  manifest: AgentManifest;
  factory: AgentFactory;
  
  // 可选的 UI 扩展
  ui?: {
    // 设置面板组件（动态导入）
    settingsComponent?: () => Promise<Component>;
    // 自定义消息渲染组件
    messageRenderer?: () => Promise<Component>;
  };
}

/**
 * 加载选项
 */
export interface LoadOptions {
  /** 权限白名单，为空则使用 manifest 声明的权限 */
  allowedPermissions?: string[];
  
  /** 是否沙箱运行（iframe 隔离） */
  sandbox?: boolean;
  
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * Agent 扩展加载器
 * 
 * 支持从以下来源加载第三方 Agent：
 * 1. 本地文件（开发调试）
 * 2. 远程 URL（ESM 模块）
 * 3. npm 包（已安装依赖）
 */
export class AgentExtensionLoader {
  private loadedExtensions = new Map<string, AgentExtension>();
  
  /**
   * 从远程 URL 加载 ESM 模块
   * 
   * 安全要求：
   * 1. 必须通过 HTTPS 加载
   * 2. 必须声明所需权限
   * 3. 可选沙箱隔离
   */
  async loadFromURL(url: string, options: LoadOptions = {}): Promise<AgentExtension> {
    // 安全检查
    if (!url.startsWith('https://') && !url.startsWith('blob:')) {
      throw new Error('Agent extension must be loaded via HTTPS or blob URL');
    }
    
    // 设置超时
    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // 动态导入 ESM 模块
      const module = await import(/* @vite-ignore */ url);
      clearTimeout(timeoutId);
      
      const extension = module.default as AgentExtension;
      
      // 验证 manifest
      this.validateManifest(extension.manifest);
      
      // 验证权限
      this.validatePermissions(extension.manifest, options.allowedPermissions);
      
      // 标记为扩展类型
      extension.manifest.category = 'extension';
      
      // 注册到 AgentHost
      agentHost.register(extension.manifest, extension.factory);
      
      this.loadedExtensions.set(extension.manifest.id, extension);
      
      return extension;
    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error(`Failed to load agent extension from ${url}: ${error}`);
    }
  }
  
  /**
   * 从本地文件加载（开发调试用）
   */
  async loadFromFile(file: File, options: LoadOptions = {}): Promise<AgentExtension> {
    const text = await file.text();
    
    // 创建 Blob URL
    const blob = new Blob([text], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    try {
      return await this.loadFromURL(url, options);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  
  /**
   * 卸载扩展
   */
  unload(extensionId: string): void {
    agentHost.unload(extensionId);
    this.loadedExtensions.delete(extensionId);
  }
  
  /**
   * 列出已加载的扩展
   */
  listLoaded(): AgentExtension[] {
    return Array.from(this.loadedExtensions.values());
  }
  
  /**
   * 获取指定扩展
   */
  get(extensionId: string): AgentExtension | undefined {
    return this.loadedExtensions.get(extensionId);
  }
  
  // ==================== 私有方法 ====================
  
  private validateManifest(manifest: AgentManifest): void {
    const required = ['id', 'name', 'description', 'model'];
    for (const field of required) {
      if (!(field in manifest)) {
        throw new Error(`Agent manifest missing required field: ${field}`);
      }
    }
    
    // ID 格式校验
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error('Agent ID must be lowercase alphanumeric with hyphens only');
    }
    
    // 检查 ID 冲突
    if (agentHost.getManifest(manifest.id)) {
      throw new Error(`Agent with ID "${manifest.id}" already exists`);
    }
  }
  
  private validatePermissions(
    manifest: AgentManifest, 
    allowedPermissions?: string[]
  ): void {
    if (!allowedPermissions) {
      // 未指定白名单时，使用 manifest 声明的权限
      // 但仍需确保权限在系统允许的范围内
      const systemPermissions = [
        'candidate:read', 'candidate:write', 'candidate:create', 'candidate:delete',
        'interview:read', 'interview:write', 'interview:create',
        'resume:read', 'resume:parse',
        'system:read', 'system:settings', 'system:extensions',
      ];
      
      const invalid = manifest.permissions?.filter(
        p => !systemPermissions.includes(p)
      );
      
      if (invalid?.length) {
        throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
      }
      
      return;
    }
    
    // 检查是否超出白名单
    const requested = manifest.permissions || [];
    const unauthorized = requested.filter(
      p => !allowedPermissions.includes(p)
    );
    
    if (unauthorized.length) {
      throw new Error(
        `Agent requests unauthorized permissions: ${unauthorized.join(', ')}`
      );
    }
  }
}

/**
 * 全局扩展加载器实例
 */
export const extensionLoader = new AgentExtensionLoader();