<template>
  <div class="extension-manager">
    <div class="header">
      <h2>Agent 扩展管理</h2>
      <button @click="showLoadDialog = true" class="btn-primary">
        加载扩展
      </button>
    </div>
    
    <!-- 扩展列表 -->
    <div class="extension-list">
      <div 
        v-for="ext in extensions" 
        :key="ext.id" 
        class="extension-card"
        :class="{ inactive: ext.status === 'inactive', error: ext.status === 'error' }"
      >
        <div class="extension-header">
          <h3>{{ ext.manifest.name }}</h3>
          <span class="status-badge" :class="ext.status">
            {{ statusText(ext.status) }}
          </span>
        </div>
        
        <p class="description">{{ ext.manifest.description }}</p>
        
        <div class="capabilities">
          <span 
            v-for="cap in ext.manifest.capabilities" 
            :key="cap" 
            class="capability-tag"
          >
            {{ cap }}
          </span>
        </div>
        
        <div class="permissions">
          <strong>权限:</strong>
          <span v-for="perm in ext.manifest.permissions" :key="perm" class="permission-tag">
            {{ perm }}
          </span>
        </div>
        
        <div class="actions">
          <button 
            v-if="ext.status === 'active'" 
            @click="deactivateExtension(ext.id)"
            class="btn-secondary"
          >
            停用
          </button>
          <button 
            v-else-if="ext.status === 'inactive'" 
            @click="activateExtension(ext.id)"
            class="btn-secondary"
          >
            激活
          </button>
          <button @click="unloadExtension(ext.id)" class="btn-danger">
            卸载
          </button>
        </div>
        
        <div v-if="ext.error" class="error-message">
          {{ ext.error }}
        </div>
      </div>
    </div>
    
    <!-- 加载对话框 -->
    <div v-if="showLoadDialog" class="dialog-overlay">
      <div class="dialog">
        <h3>加载 Agent 扩展</h3>
        
        <div class="form-group">
          <label>扩展 URL (HTTPS)</label>
          <input 
            v-model="loadUrl" 
            type="url" 
            placeholder="https://example.com/agent-extension.js"
          />
        </div>
        
        <div class="form-group">
          <label>或选择本地文件</label>
          <input type="file" @change="handleFileSelect" accept=".js,.ts" />
        </div>
        
        <div class="form-group">
          <label>权限白名单 (可选)</label>
          <select v-model="selectedPermissions" multiple>
            <option value="candidate:read">candidate:read</option>
            <option value="candidate:write">candidate:write</option>
            <option value="candidate:create">candidate:create</option>
            <option value="candidate:delete">candidate:delete</option>
            <option value="interview:read">interview:read</option>
            <option value="interview:write">interview:write</option>
            <option value="interview:create">interview:create</option>
            <option value="resume:read">resume:read</option>
            <option value="resume:parse">resume:parse</option>
            <option value="system:read">system:read</option>
            <option value="system:settings">system:settings</option>
            <option value="system:extensions">system:extensions</option>
          </select>
        </div>
        
        <div class="dialog-actions">
          <button @click="showLoadDialog = false" class="btn-secondary">
            取消
          </button>
          <button @click="loadExtension" class="btn-primary" :disabled="!canLoad">
            加载
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { extensionLoader } from '@/agents/extension-loader';
import { extensionRegistry } from '@/agents/extension-registry';

const showLoadDialog = ref(false);
const loadUrl = ref('');
const selectedFile = ref<File | null>(null);
const selectedPermissions = ref<string[]>([]);

const extensions = computed(() => extensionRegistry.list());

const canLoad = computed(() => loadUrl.value || selectedFile.value);

function statusText(status: string) {
  const map: Record<string, string> = {
    active: '已激活',
    inactive: '已停用',
    error: '错误',
  };
  return map[status] || status;
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0];
  }
}

async function loadExtension() {
  try {
    let extension: Awaited<ReturnType<typeof extensionLoader.loadFromURL>> | undefined;
    
    if (loadUrl.value) {
      extension = await extensionLoader.loadFromURL(loadUrl.value, {
        allowedPermissions: selectedPermissions.value.length > 0 
          ? selectedPermissions.value 
          : undefined,
      });
    } else if (selectedFile.value) {
      extension = await extensionLoader.loadFromFile(selectedFile.value, {
        allowedPermissions: selectedPermissions.value.length > 0 
          ? selectedPermissions.value 
          : undefined,
      });
    }
    
    if (extension) {
      extensionRegistry.register({
        id: extension.manifest.id,
        manifest: extension.manifest,
        url: loadUrl.value || undefined,
        loadedAt: new Date(),
        status: 'active',
      });
    }
    
    showLoadDialog.value = false;
    loadUrl.value = '';
    selectedFile.value = null;
    selectedPermissions.value = [];
  } catch (error) {
    alert(`加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

async function unloadExtension(extensionId: string) {
  if (confirm('确定要卸载此扩展吗?')) {
    extensionLoader.unload(extensionId);
    extensionRegistry.unregister(extensionId);
  }
}

function activateExtension(extensionId: string) {
  extensionRegistry.activate(extensionId);
}

function deactivateExtension(extensionId: string) {
  extensionRegistry.deactivate(extensionId);
}
</script>

<style scoped>
.extension-manager {
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.extension-list {
  display: grid;
  gap: 16px;
}

.extension-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.extension-card.inactive {
  opacity: 0.6;
}

.extension-card.error {
  border-color: #ef4444;
}

.extension-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.extension-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #dcfce7;
  color: #166534;
}

.status-badge.inactive {
  background: #f3f4f6;
  color: #6b7280;
}

.status-badge.error {
  background: #fee2e2;
  color: #991b1b;
}

.description {
  color: #6b7280;
  margin: 8px 0;
}

.capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}

.capability-tag {
  padding: 4px 8px;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 4px;
  font-size: 12px;
}

.permissions {
  margin: 12px 0;
  font-size: 14px;
}

.permission-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.error-message {
  margin-top: 12px;
  padding: 8px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 4px;
  font-size: 14px;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 500px;
  max-width: 90%;
}

.dialog h3 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
}

.form-group select {
  height: 120px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.btn-primary {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-danger {
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-danger:hover {
  background: #dc2626;
}
</style>