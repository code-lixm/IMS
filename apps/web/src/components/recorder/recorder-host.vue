<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import RecorderFloatingButton from "@/components/recorder/recorder-floating-button.vue"
import RecorderPanel from "@/components/recorder/recorder-panel.vue"
import { useRecorderStore } from "@/stores/recorder"

const recorderStore = useRecorderStore()
const FLOATING_BUTTON_SIZE = 48
const FLOATING_PANEL_GAP = 12
const VIEWPORT_MARGIN = 20
const DRAG_THRESHOLD_PX = 6
const STORAGE_KEY = "ims-recorder-floating-position"

const isDesktopRuntime = computed(() => typeof window !== "undefined"
  && typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined")

const floatingLeft = ref(0)
const floatingTop = ref(0)
const viewportHeight = ref(0)
const dragging = ref(false)
const hasDragged = ref(false)
const suppressClick = ref(false)

let pointerOffsetX = 0
let pointerOffsetY = 0
let pointerStartX = 0
let pointerStartY = 0
let activePointerId: number | null = null

function maxLeft() {
  return Math.max(VIEWPORT_MARGIN, window.innerWidth - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN)
}

function maxTop() {
  return Math.max(VIEWPORT_MARGIN, window.innerHeight - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN)
}

function clampPosition(left: number, top: number) {
  return {
    left: Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft()),
    top: Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop()),
  }
}

function persistPosition() {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ left: floatingLeft.value, top: floatingTop.value }),
  )
}

function applyPosition(left: number, top: number, persist = false) {
  const next = clampPosition(left, top)
  floatingLeft.value = next.left
  floatingTop.value = next.top

  if (persist) {
    persistPosition()
  }
}

function refreshViewportMetrics() {
  viewportHeight.value = window.innerHeight
}

function setDefaultPosition() {
  refreshViewportMetrics()
  applyPosition(
    window.innerWidth - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN,
    window.innerHeight - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN - 12,
  )
}

function restorePosition() {
  if (typeof window === "undefined") {
    return
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    setDefaultPosition()
    return
  }

  try {
    const parsed = JSON.parse(raw) as { left?: number, top?: number }
    if (typeof parsed.left === "number" && typeof parsed.top === "number") {
      applyPosition(parsed.left, parsed.top)
      return
    }
  }
  catch {
    // Ignore invalid persisted payloads and fall back to defaults.
  }

  setDefaultPosition()
}

function handleViewportResize() {
  refreshViewportMetrics()
  applyPosition(floatingLeft.value, floatingTop.value, true)
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value || activePointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - pointerStartX
  const deltaY = event.clientY - pointerStartY

  if (!hasDragged.value && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
    return
  }

  event.preventDefault()
  hasDragged.value = true
  applyPosition(event.clientX - pointerOffsetX, event.clientY - pointerOffsetY)
}

function finishDrag(pointerId?: number) {
  if (pointerId !== undefined && activePointerId !== pointerId) {
    return
  }

  if (!dragging.value) {
    return
  }

  dragging.value = false
  activePointerId = null
  const shouldToggle = !hasDragged.value
  suppressClick.value = true
  persistPosition()

  if (shouldToggle) {
    recorderStore.togglePanel()
  }

  window.setTimeout(() => {
    hasDragged.value = false
    suppressClick.value = false
  }, 0)
}

function handlePointerUp(event: PointerEvent) {
  finishDrag(event.pointerId)
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) {
    return
  }

  const currentTarget = event.currentTarget as HTMLElement | null
  if (!currentTarget) {
    return
  }

  const rect = currentTarget.getBoundingClientRect()
  pointerOffsetX = event.clientX - rect.left
  pointerOffsetY = event.clientY - rect.top
  pointerStartX = event.clientX
  pointerStartY = event.clientY
  activePointerId = event.pointerId
  dragging.value = true
  hasDragged.value = false
}

function handleToggle() {
  if (hasDragged.value || suppressClick.value) {
    return
  }

  recorderStore.togglePanel()
}

const floatingShellStyle = computed(() => ({
  left: `${floatingLeft.value}px`,
  top: `${floatingTop.value}px`,
}))

const floatingPanelOffsetStyle = computed(() => ({
  ...(floatingTop.value > viewportHeight.value / 2
    ? { bottom: `${FLOATING_BUTTON_SIZE + FLOATING_PANEL_GAP}px` }
    : { top: `${FLOATING_BUTTON_SIZE + FLOATING_PANEL_GAP}px` }),
}))

onMounted(() => {
  recorderStore.setSupported(isDesktopRuntime.value)
  restorePosition()
  refreshViewportMetrics()
  window.addEventListener("resize", handleViewportResize)
  window.addEventListener("pointermove", handlePointerMove)
  window.addEventListener("pointerup", handlePointerUp)
  window.addEventListener("pointercancel", handlePointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleViewportResize)
  window.removeEventListener("pointermove", handlePointerMove)
  window.removeEventListener("pointerup", handlePointerUp)
  window.removeEventListener("pointercancel", handlePointerUp)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-[90]">
    <div
      class="absolute"
      :style="floatingShellStyle"
    >
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-3 opacity-0 scale-[0.98]"
        enter-to-class="translate-y-0 opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-y-0 opacity-100 scale-100"
        leave-to-class="translate-y-3 opacity-0 scale-[0.98]"
      >
        <RecorderPanel
          v-if="recorderStore.panelOpen"
          class="absolute right-0"
          :style="floatingPanelOffsetStyle"
          :desktop-runtime="isDesktopRuntime"
          @close="recorderStore.setPanelOpen(false)"
        />
      </Transition>

      <div
        class="pointer-events-auto touch-none cursor-grab active:cursor-grabbing"
        @pointerdown="handlePointerDown"
      >
        <RecorderFloatingButton
          :panel-open="recorderStore.panelOpen"
          :status="recorderStore.status"
          :desktop-runtime="isDesktopRuntime"
          @toggle="handleToggle"
        />
      </div>
    </div>
  </div>
</template>
