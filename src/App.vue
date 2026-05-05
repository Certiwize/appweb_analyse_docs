<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import DocumentAnalysis from './components/DocumentAnalysis.vue'
import History from './components/History.vue'
import Login from './components/Login.vue'
import { useAuthStore } from './stores/useAuthStore'

const { t } = useI18n()
const auth = useAuthStore()
const ready = ref(false)
const currentView = ref('analysis')

onMounted(async () => {
  await auth.init()
  ready.value = true
})

async function onLogout() {
  try {
    await auth.signOut()
  } catch (err) {
    console.error('[auth] signOut', err)
  }
}

function navClass(view) {
  return view === currentView.value
    ? 'text-sm font-medium text-blue-600'
    : 'text-sm font-medium text-slate-600 hover:text-slate-900'
}
</script>

<template>
  <div v-if="!ready" class="min-h-screen flex items-center justify-center text-slate-500">
    <i class="pi pi-spin pi-spinner text-2xl"></i>
  </div>

  <Login v-else-if="!auth.user" />

  <div v-else class="min-h-full">
    <nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-900">Qualiopi Analyzer</span>
      <button :class="navClass('analysis')" @click="currentView = 'analysis'">
        {{ t('nav.analysis') }}
      </button>
      <button :class="navClass('history')" @click="currentView = 'history'">
        {{ t('nav.history') }}
      </button>
      <div class="ml-auto flex items-center gap-3">
        <span class="text-sm text-slate-600">{{ auth.user.email }}</span>
        <Button
          :label="t('auth.sign_out')"
          icon="pi pi-sign-out"
          severity="secondary"
          text
          size="small"
          @click="onLogout"
        />
      </div>
    </nav>
    <main class="px-4 py-8">
      <DocumentAnalysis v-if="currentView === 'analysis'" />
      <History v-else-if="currentView === 'history'" />
    </main>
  </div>
</template>
