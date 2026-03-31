<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <DialogHeader>
        <DialogTitle>选择分享设备</DialogTitle>
        <DialogDescription>
          已选择 {{ selectedCount }} 位候选人，请选择目标设备进行分享
        </DialogDescription>
      </DialogHeader>

      <div class="mt-4 space-y-4">
        <!-- 设备发现控制 -->
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            <template v-if="discovering">
              <span class="inline-flex items-center gap-2"
                ><span
                  class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"
                /></span>
              正在发现设备...
            </template>
            <template v-else>
              设备发现已停止
            </template>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="discovering"
            @click="startDiscover"
          >
            <RefreshCw v-if="!discovering" class="mr-1 h-3.5 w-3.5" />
            {{ discovering ? '发现中...' : '重新发现' }}
          </Button>
        </div>

        <!-- 在线设备列表 -->
        <div class="space-y-2">
          <label class="text-sm font-medium">在线设备</label>
          <div
            v-if="onlineDevices.length === 0"
            class="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
          >
            未发现在线设备
          </div>
          <div v-else class="grid gap-2">
            <button
              v-for="device in onlineDevices"
              :key="device.deviceId || `${device.ip}:${device.apiPort}`"
              type="button"
              class="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
              :class="{
                'border-primary bg-primary/5': selectedDevice?.deviceId === device.deviceId,
              }"
              @click="selectDevice(device)"
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10"
              >
                <Monitor class="h-4 w-4 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ device.deviceName }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ device.ip }}:{{ device.apiPort }}
                </p>
              </div>
              <Check
                v-if="selectedDevice?.deviceId === device.deviceId"
                class="h-4 w-4 shrink-0 text-primary"
              />
            </button>
          </div>
        </div>

        <!-- 最近联系设备 -->
        <div v-if="recentDevices.length > 0" class="space-y-2">
          <label class="text-sm font-medium">最近联系</label>
          <div class="grid gap-2">
            <button
              v-for="device in recentDevices"
              :key="device.deviceId"
              type="button"
              class="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
              :class="{
                'border-primary bg-primary/5': selectedDevice?.deviceId === device.deviceId,
              }"
              @click="selectRecentDevice(device)"
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"
              >
                <History class="h-4 w-4 text-muted-foreground" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ device.deviceName }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  上次联系：{{ formatLastSeen(device.lastSeen) }}
                </p>
              </div>
              <Check
                v-if="selectedDevice?.deviceId === device.deviceId"
                class="h-4 w-4 shrink-0 text-primary"
              />
            </button>
          </div>
        </div>
      </div>

      <DialogFooter class="mt-6">
        <Button variant="secondary" @click="emit('update:open', false)"
          >取消</Button
        >
        <Button
          :disabled="!selectedDevice || isSending"
          :loading="isSending"
          @click="handleSend"
        >
          {{ isSending ? '发送中...' : `发送给 ${selectedDevice?.name || '设备'}` }}
        </Button>
      </DialogFooter>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Monitor, History, RefreshCw, Check } from "lucide-vue-next";
import Dialog from "@/components/ui/dialog.vue";
import DialogDescription from "@/components/ui/dialog-description.vue";
import DialogFooter from "@/components/ui/dialog-footer.vue";
import DialogHeader from "@/components/ui/dialog-header.vue";
import DialogTitle from "@/components/ui/dialog-title.vue";
import Button from "@/components/ui/button.vue";
import { shareApi } from "@/api/share";
import type { ShareDevicesData } from "@ims/shared";

interface DeviceSelectDialogProps {
  open: boolean;
  selectedCount: number;
}

const props = defineProps<DeviceSelectDialogProps>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "send", device: { ip: string; port: number; deviceId?: string; name: string }): void;
}>();

const discovering = ref(false);
const isSending = ref(false);
const onlineDevices = ref<ShareDevicesData["onlineDevices"]>([]);
const recentDevices = ref<ShareDevicesData["recentContacts"]>([]);
const selectedDevice = ref<{
  ip: string;
  port: number;
  deviceId?: string;
  name: string;
} | null>(null);

async function fetchDevices() {
  try {
    const data = await shareApi.devices();
    onlineDevices.value = data.onlineDevices;
    recentDevices.value = data.recentContacts;
  } catch (error) {
    console.error("获取设备列表失败:", error);
  }
}

async function startDiscover() {
  if (discovering.value) return;

  discovering.value = true;
  try {
    await shareApi.discoverStart();
    // 轮询设备列表
    await pollDevices();
  } catch (error) {
    console.error("启动设备发现失败:", error);
  } finally {
    discovering.value = false;
  }
}

async function pollDevices() {
  const maxAttempts = 10;
  const interval = 1000;

  for (let i = 0; i < maxAttempts; i++) {
    await fetchDevices();
    if (onlineDevices.value.length > 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // 停止发现
  try {
    await shareApi.discoverStop();
  } catch (error) {
    console.error("停止设备发现失败:", error);
  }
}

function selectDevice(device: ShareDevicesData["onlineDevices"][number]) {
  selectedDevice.value = {
    ip: device.ip,
    port: device.apiPort,
    deviceId: device.deviceId,
    name: device.deviceName,
  };
}

function selectRecentDevice(device: ShareDevicesData["recentContacts"][number]) {
  selectedDevice.value = {
    ip: "", // 最近联系设备可能没有当前IP
    port: 0,
    deviceId: device.deviceId,
    name: device.deviceName,
  };
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

async function handleSend() {
  if (!selectedDevice.value) return;

  isSending.value = true;
  try {
    emit("send", selectedDevice.value);
  } finally {
    isSending.value = false;
  }
}

// 当对话框打开时，自动开始发现
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      selectedDevice.value = null;
      fetchDevices();
      startDiscover();
    }
  },
  { immediate: true },
);
</script>