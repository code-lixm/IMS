export function statusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    partial_success: "secondary",
    processing: "secondary",
    failed: "destructive",
    queued: "outline",
    cancelled: "outline",
  };
  return map[status] ?? "outline";
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    processing: "处理中",
    partial_success: "部分成功",
    queued: "排队中",
    cancelled: "已取消",
  };
  return map[status] ?? status;
}

export function fileStatusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    failed: "destructive",
    processing: "secondary",
    queued: "outline",
    cancelled: "outline",
  };
  return map[status] ?? "outline";
}

export function fileStatusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "成功",
    failed: "失败",
    processing: "处理中",
    queued: "排队",
    cancelled: "取消",
  };
  return map[status] ?? status;
}

export function formatImportTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
