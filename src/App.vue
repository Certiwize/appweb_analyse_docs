<script setup>
import { onMounted } from 'vue'
import DocumentAnalysis from './components/DocumentAnalysis.vue'
import { useAuthStore } from './stores/useAuthStore'
import { useAnalysisSettingsStore } from './stores/useAnalysisSettingsStore'

const auth = useAuthStore()
const settings = useAnalysisSettingsStore()

onMounted(async () => {
  await auth.init()
  if (auth.currentOrganization) {
    await Promise.all([settings.fetchWebhookUrl(), settings.fetchSystemPrompt()])
  }
})
</script>

<template>
  <div class="min-h-full">
    <nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-900">Qualiopi Analyzer</span>
      <a class="text-sm text-blue-600 font-medium" href="#">Analyse Docs</a>
    </nav>
    <main class="px-4 py-8">
      <DocumentAnalysis />
    </main>
  </div>
</template>
