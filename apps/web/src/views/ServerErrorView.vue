<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-4">
    <div class="text-center">
      <!-- 500 数字 -->
      <div class="mb-6">
        <span class="text-8xl font-bold text-foreground">5</span>
        <span class="text-8xl font-bold text-destructive">0</span>
        <span class="text-8xl font-bold text-foreground">0</span>
      </div>

      <!-- 图标 -->
      <div class="mb-6 flex justify-center">
        <div class="rounded-full bg-destructive/10 p-6">
          <ServerCrash :class="'h-16 w-16 text-destructive'" :stroke-width="1.5" />
        </div>
      </div>

      <!-- 标题 -->
      <h1 class="mb-3 text-2xl font-semibold text-foreground">服务器错误</h1>

      <!-- 描述 -->
      <p class="mb-8 max-w-md text-muted-foreground">
        抱歉，服务器遇到了问题，无法完成您的请求。
        <br />
        请稍后再试，或联系管理员获取帮助。
      </p>

      <!-- 操作按钮 -->
      <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button @click="retry">
          <RefreshCw :class="'h-4 w-4'" :stroke-width="1.5" />
          重新尝试
        </Button>
        <Button variant="outline" @click="goHome">
          <Home :class="'h-4 w-4'" :stroke-width="1.5" />
          返回首页
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ServerCrash, RefreshCw, Home } from "lucide-vue-next"
import { useRouter } from "vue-router"
import Button from "@/components/ui/button.vue"

const router = useRouter()

const retry = () => {
  window.location.reload()
}

const goHome = () => {
  router.push("/candidates")
}
</script>
