<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-4">
    <div class="text-center">
      <!-- 404 数字 -->
      <div class="mb-6">
        <span class="text-8xl font-bold text-muted-foreground">4</span>
        <span class="text-8xl font-bold text-foreground">0</span>
        <span class="text-8xl font-bold text-muted-foreground">4</span>
      </div>

      <!-- 图标 -->
      <div class="mb-6 flex justify-center">
        <div class="rounded-full bg-muted p-6">
          <FileQuestion :class="'h-16 w-16 text-muted-foreground'" :stroke-width="1.5" />
        </div>
      </div>

      <!-- 标题 -->
      <h1 class="mb-3 text-2xl font-semibold text-foreground">页面未找到</h1>

      <!-- 描述 -->
      <p class="mb-8 max-w-md text-muted-foreground">
        抱歉，您访问的页面不存在或已被移除。
        <br />
        请检查 URL 是否正确，或返回首页继续浏览。
      </p>

      <!-- 操作按钮 -->
      <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button @click="goHome">
          <Home :class="'h-4 w-4'" :stroke-width="1.5" />
          返回首页
        </Button>
        <Button variant="outline" @click="goBack">
          <ArrowLeft :class="'h-4 w-4'" :stroke-width="1.5" />
          返回上页
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileQuestion, Home, ArrowLeft } from "lucide-vue-next"
import { useRouter } from "vue-router"
import { Button } from "@/components/ui/button"

const router = useRouter()

const goHome = () => {
  router.push("/candidates")
}

const goBack = () => {
  router.back()
}
</script>
