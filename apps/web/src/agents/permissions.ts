/**
 * Agent 权限系统
 * 
 * 文件位置: apps/web/src/agents/permissions.ts
 * 
 * 实现基于 ACL(访问控制列表)的权限管理
 * 每个 Agent 必须声明所需权限,运行时进行校验
 */

import type { AgentPermission, IMSContext } from './host';
import type { ZodSchema } from 'zod';

/**
 * 权限校验器
 */
export class PermissionChecker {
  private grantedPermissions: Set<AgentPermission>;

  constructor(permissions: AgentPermission[]) {
    this.grantedPermissions = new Set(permissions);
  }

  /**
   * 检查是否拥有指定权限
   */
  has(permission: AgentPermission): boolean {
    return this.grantedPermissions.has(permission);
  }

  /**
   * 检查是否拥有所有指定权限
   */
  hasAll(permissions: AgentPermission[]): boolean {
    return permissions.every(p => this.grantedPermissions.has(p));
  }

  /**
   * 检查是否拥有任一指定权限
   */
  hasAny(permissions: AgentPermission[]): boolean {
    return permissions.some(p => this.grantedPermissions.has(p));
  }

  /**
   * 校验权限,无权限时抛出错误
   */
  check(permission: AgentPermission, operation: string): void {
    if (!this.has(permission)) {
      throw new PermissionDeniedError(permission, operation);
    }
  }
}

/**
 * 权限拒绝错误
 */
export class PermissionDeniedError extends Error {
  constructor(
    public readonly permission: AgentPermission,
    public readonly operation: string
  ) {
    super(
      `Permission denied: "${permission}" is required for "${operation}"`
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * 工具权限装饰器
 * 
 * 使用示例:
 * ```ts
 * const saveCandidateTool = withPermission(
 *   'candidate:write',
 *   {
 *     description: '保存候选人信息',
 *     inputSchema: z.object({...}),
 *     execute: async (params, options) => { ... }
 *   }
 * );
 * ```
 */
export function withPermission<P extends Record<string, unknown>, R>(
  permission: AgentPermission,
  toolConfig: {
    description: string;
    inputSchema: ZodSchema<P>;
    execute: (params: P, options: { state?: unknown }) => Promise<R>;
  }
) {
  return {
    ...toolConfig,
    execute: async (params: P, options: { state?: unknown }) => {
      // 从 context 获取权限检查器
      const ctx = options.state as IMSContext & {
        _permissionChecker?: PermissionChecker;
      };

      const checker = ctx._permissionChecker;
      if (!checker) {
        throw new Error('Permission checker not initialized');
      }

      checker.check(permission, toolConfig.description);

      return toolConfig.execute(params, options);
    },
  };
}