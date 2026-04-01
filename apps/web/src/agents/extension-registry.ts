/**
 * 扩展注册表
 * 
 * 文件位置: apps/web/src/agents/extension-registry.ts
 * 
 * 职责:
 * - 管理扩展的状态（已安装、已激活、已禁用）
 * - 提供扩展的启用/禁用功能
 * - 提供扩展的列表查询功能
 */

import { ref } from 'vue';
import type { AgentManifest } from './host';

/**
 * 扩展注册信息
 */
export interface ExtensionRegistry {
  id: string;
  manifest: AgentManifest;
  url?: string;
  loadedAt: Date;
  status: 'active' | 'inactive' | 'error';
  error?: string;
}

/**
 * 扩展注册表管理器
 */
export class ExtensionRegistryManager {
  private registry = ref<Map<string, ExtensionRegistry>>(new Map());
  
  /**
   * 注册扩展
   */
  register(extension: ExtensionRegistry): void {
    this.registry.value.set(extension.id, extension);
  }
  
  /**
   * 注销扩展
   */
  unregister(extensionId: string): void {
    this.registry.value.delete(extensionId);
  }
  
  /**
   * 获取指定扩展
   */
  get(extensionId: string): ExtensionRegistry | undefined {
    return this.registry.value.get(extensionId);
  }
  
  /**
   * 列出所有扩展
   */
  list(): ExtensionRegistry[] {
    return Array.from(this.registry.value.values());
  }
  
  /**
   * 按状态列出扩展
   */
  listByStatus(status: ExtensionRegistry['status']): ExtensionRegistry[] {
    return this.list().filter(e => e.status === status);
  }
  
  /**
   * 激活扩展
   */
  activate(extensionId: string): void {
    const extension = this.registry.value.get(extensionId);
    if (extension) {
      extension.status = 'active';
      extension.error = undefined;
    }
  }
  
  /**
   * 停用扩展
   */
  deactivate(extensionId: string): void {
    const extension = this.registry.value.get(extensionId);
    if (extension) {
      extension.status = 'inactive';
    }
  }
  
  /**
   * 标记扩展为错误状态
   */
  markError(extensionId: string, error: string): void {
    const extension = this.registry.value.get(extensionId);
    if (extension) {
      extension.status = 'error';
      extension.error = error;
    }
  }
  
  /**
   * 清空所有扩展
   */
  clear(): void {
    this.registry.value.clear();
  }
  
  /**
   * 获取扩展数量
   */
  get count(): number {
    return this.registry.value.size;
  }
  
  /**
   * 获取活跃扩展数量
   */
  get activeCount(): number {
    return this.listByStatus('active').length;
  }
  
  /**
   * 获取停用扩展数量
   */
  get inactiveCount(): number {
    return this.listByStatus('inactive').length;
  }
  
  /**
   * 获取错误扩展数量
   */
  get errorCount(): number {
    return this.listByStatus('error').length;
  }
}

/**
 * 全局扩展注册表实例
 */
export const extensionRegistry = new ExtensionRegistryManager();