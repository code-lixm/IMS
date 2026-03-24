<template>
  <div class="relative">
    <Button
      v-if="!currentCandidate"
      variant="outline"
      size="sm"
      class="h-8 gap-1.5 text-xs"
      @click="open = !open"
    >
      <User class="h-3.5 w-3.5" />
      关联候选人
    </Button>

    <div v-else class="flex items-center gap-2">
      <Badge variant="secondary" class="h-6 gap-1 px-2 text-xs">
        <User class="h-3 w-3" />
        {{ currentCandidate.name }}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        class="h-6 w-6"
        @click="handleRemove"
      >
        <X class="h-3 w-3" />
      </Button>
    </div>

    <Dialog v-model:open="open">
      <template #content>
        <div class="space-y-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="搜索候选人..."
              class="pl-9"
              @input="debouncedSearch"
            />
          </div>

          <ScrollArea class="h-64">
            <div v-if="isLoading" class="flex items-center justify-center py-8">
              <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
            </div>

            <div v-else-if="candidates.length === 0" class="py-8 text-center text-sm text-muted-foreground">
              <User class="mx-auto mb-2 h-8 w-8 opacity-20" />
              <p>{{ searchQuery ? "未找到匹配的候选人" : "暂无候选人" }}</p>
            </div>

            <ul v-else class="space-y-1 p-1">
              <li v-for="candidate in candidates" :key="candidate.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  :class="selectedId === candidate.id ? 'bg-accent' : ''"
                  @click="handleSelect(candidate)"
                >
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate font-medium">{{ candidate.name }}</span>
                    <span v-if="candidate.position" class="text-xs text-muted-foreground">
                      {{ candidate.position }}
                    </span>
                  </div>
                  <Badge v-if="candidate.tags?.length" variant="secondary" class="text-xs">
                    {{ candidate.tags[0] }}
                  </Badge>
                </button>
              </li>
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="open = false">取消</Button>
          <Button :disabled="!selectedId" @click="handleConfirm">确认</Button>
        </DialogFooter>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { Loader2, Search, User, X } from "lucide-vue-next"
import { candidatesApi } from "@/api/candidates"
import { useAppNotifications } from "@/composables/use-app-notifications"
import { reportAppError } from "@/lib/errors/normalize"
import Button from "@/components/ui/button.vue"
import Badge from "@/components/ui/badge.vue"
import Input from "@/components/ui/input.vue"
import ScrollArea from "@/components/ui/scroll-area.vue"
import Dialog from "@/components/ui/dialog.vue"
import DialogFooter from "@/components/ui/dialog-footer.vue"

interface CandidateSelectorProps {
  modelValue?: string | null
}

interface CandidateInfo {
  id: string
  name: string
  position?: string | null
  tags?: string[]
}

const props = defineProps<CandidateSelectorProps>()
const emit = defineEmits<{
  (e: "update:modelValue", value: string | null): void
  (e: "select", candidate: CandidateInfo | null): void
}>()

const open = ref(false)
const searchQuery = ref("")
const candidates = ref<CandidateInfo[]>([])
const selectedId = ref<string | null>(null)
const isLoading = ref(false)
const currentCandidate = ref<CandidateInfo | null>(null)
const { notifyError } = useAppNotifications()

// Watch for external changes
watch(() => props.modelValue, async (newVal) => {
  if (newVal && newVal !== currentCandidate.value?.id) {
    await loadCandidate(newVal)
  } else if (!newVal) {
    currentCandidate.value = null
  }
}, { immediate: true })

async function loadCandidate(id: string) {
  try {
    const data = await candidatesApi.get(id)
    currentCandidate.value = {
      id: data.candidate.id,
      name: data.candidate.name,
      position: data.candidate.position,
      tags: data.candidate.tags,
    }
  } catch (_error) {
    currentCandidate.value = null
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchCandidates()
  }, 300)
}

async function searchCandidates() {
  if (!searchQuery.value.trim()) {
    candidates.value = []
    return
  }

  isLoading.value = true
  try {
    const data = await candidatesApi.list({ search: searchQuery.value, pageSize: 20 })
    candidates.value = data.items.map(c => ({
      id: c.id,
      name: c.name,
      position: c.position,
      tags: c.tags,
    }))
  } catch (err) {
    notifyError(reportAppError("candidate-selector/search", err, {
      title: "候选人搜索失败",
      fallbackMessage: "暂时无法搜索候选人",
    }))
    candidates.value = []
  } finally {
    isLoading.value = false
  }
}

function handleSelect(candidate: CandidateInfo) {
  selectedId.value = candidate.id
}

function handleConfirm() {
  if (selectedId.value) {
    const candidate = candidates.value.find((c: CandidateInfo) => c.id === selectedId.value)
    if (candidate) {
      currentCandidate.value = candidate
      emit("update:modelValue", candidate.id)
      emit("select", candidate)
    }
  }
  open.value = false
  selectedId.value = null
  searchQuery.value = ""
  candidates.value = []
}

function handleRemove() {
  currentCandidate.value = null
  emit("update:modelValue", null)
  emit("select", null)
}
</script>
