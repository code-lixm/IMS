<template>
  <Dialog
    :open="open"
    content-class="sm:max-w-lg max-h-[85vh] overflow-hidden rounded-[8px] border-0 bg-[#F8FAFD] p-0 shadow-[0_14px_32px_-18px_rgba(15,23,42,0.35)]"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <AppDialogLayout body-class="space-y-4">
        <template #header>
          <DialogHeader>
            <DialogTitle>选择分享设备</DialogTitle>
            <DialogDescription>
              已选择 {{ selectedCount }} 位候选人，请选择目标设备进行分享
            </DialogDescription>
          </DialogHeader>
        </template>

        <!-- 设备发现控制 -->
        <div class="flex items-center justify-between rounded-[6px] bg-white px-4 py-3">
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
          <label class="text-sm font-medium text-[#1A1A1A]">在线设备</label>
          <div
            v-if="onlineDevices.length === 0"
            class="rounded-[6px] border-0 bg-[#F1F5FB] p-6 text-center text-sm text-[#4B5563]"
          >
            未发现在线设备
          </div>
          <div v-else class="grid gap-2.5">
            <Card
              v-for="device in onlineDevices"
              :key="device.deviceId || `${device.ip}:${device.apiPort}`"
              as="button"
              type="button"
              :class="[
                'flex w-full items-center gap-3 rounded-[6px] border-0 px-3 py-3 text-left shadow-none transition-colors',
                isOnlineDeviceSelected(device)
                  ? 'bg-[#EEF4FF] hover:bg-[#EEF4FF]'
                  : 'bg-[#FFFFFF] hover:bg-[#F9FAFB]',
              ]"
              @click="selectDevice(device)"
            >
              <div
                :class="[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] transition-colors',
                  isOnlineDeviceSelected(device) ? 'bg-[#0062FF]' : 'bg-[#F3F4F6]',
                ]"
              >
                <Monitor
                  :class="[
                    'h-4 w-4 transition-colors',
                    isOnlineDeviceSelected(device) ? 'text-white' : 'text-[#4B5563]',
                  ]"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-[#1A1A1A]">{{ device.deviceName }}</p>
                <p class="truncate text-xs text-[#4B5563]">
                  {{ device.ip }}:{{ device.apiPort }}
                </p>
              </div>
              <Badge
                :variant="isOnlineDeviceSelected(device) ? 'default' : 'outline'"
                class="shrink-0 rounded-[6px] px-2 py-0.5 text-[11px]"
              >
                <Check v-if="isOnlineDeviceSelected(device)" class="h-3 w-3" />
                {{ isOnlineDeviceSelected(device) ? '已选' : '在线' }}
              </Badge>
            </Card>
          </div>
        </div>

        <!-- 最近联系设备 -->
        <div v-if="recentDevices.length > 0" class="space-y-2">
          <label class="text-sm font-medium text-[#1A1A1A]">最近联系</label>
          <div class="grid gap-2.5">
            <Card
              v-for="device in recentDevices"
              :key="device.deviceId"
              as="button"
              type="button"
              :class="[
                'flex w-full items-center gap-3 rounded-[6px] border-0 px-3 py-3 text-left shadow-none transition-colors',
                isRecentDeviceSelected(device)
                  ? 'bg-[#EEF4FF] hover:bg-[#EEF4FF]'
                  : 'bg-[#FFFFFF] hover:bg-[#F9FAFB]',
              ]"
              @click="selectRecentDevice(device)"
            >
              <div
                :class="[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] transition-colors',
                  isRecentDeviceSelected(device) ? 'bg-[#0062FF]' : 'bg-[#F3F4F6]',
                ]"
              >
                <History
                  :class="[
                    'h-4 w-4 transition-colors',
                    isRecentDeviceSelected(device) ? 'text-white' : 'text-[#4B5563]',
                  ]"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-[#1A1A1A]">{{ device.deviceName }}</p>
                <p class="truncate text-xs text-[#4B5563]">
                  上次联系：{{ formatLastSeen(device.lastSeen) }}
                </p>
              </div>
              <Badge
                :variant="isRecentDeviceSelected(device) ? 'default' : 'outline'"
                class="shrink-0 rounded-[6px] px-2 py-0.5 text-[11px]"
              >
                <Check v-if="isRecentDeviceSelected(device)" class="h-3 w-3" />
                {{ isRecentDeviceSelected(device) ? '已选' : '最近' }}
              </Badge>
            </Card>
          </div>
        </div>
        <template #footer>
          <Button variant="secondary" @click="emit('update:open', false)">取消</Button>
          <Button
            :disabled="!selectedDevice || isSending"
            :loading="isSending"
            @click="handleSend"
          >
            {{ isSending ? '发送中...' : `发送给 ${selectedDevice?.name || '设备'}` }}
          </Button>
        </template>
      </AppDialogLayout>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Monitor, History, RefreshCw, Check } from "lucide-vue-next";
import { Dialog } from "@/components/ui/dialog";
import { AppDialogLayout } from "@/components/ui/dialog";
import { DialogDescription } from "@/components/ui/dialog";
import { DialogHeader } from "@/components/ui/dialog";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  } catch (_error) {
  }
}

async function startDiscover() {
  if (discovering.value) return;

  discovering.value = true;
  try {
    await shareApi.discoverStart();
    // 轮询设备列表
    await pollDevices();
  } catch (_error) {
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
  } catch (_error) {
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

function isOnlineDeviceSelected(device: ShareDevicesData["onlineDevices"][number]) {
  if (!selectedDevice.value) return false;
  if (device.deviceId && selectedDevice.value.deviceId) {
    return selectedDevice.value.deviceId === device.deviceId;
  }
  return selectedDevice.value.ip === device.ip && selectedDevice.value.port === device.apiPort;
}

function isRecentDeviceSelected(device: ShareDevicesData["recentContacts"][number]) {
  return Boolean(selectedDevice.value?.deviceId && selectedDevice.value.deviceId === device.deviceId);
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
