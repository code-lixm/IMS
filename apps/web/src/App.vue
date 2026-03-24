<template>
  <div class="min-h-screen bg-background">
    <router-view />
    <AppNotificationCenter />
  </div>
</template>

<script setup lang="ts">
import AppNotificationCenter from "@/components/app-notification-center.vue";
</script>
