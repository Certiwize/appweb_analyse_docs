<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuthStore } from '../stores/useAuthStore'

const { t } = useI18n()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  if (!email.value || !password.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    await auth.signIn(email.value.trim(), password.value)
  } catch (err) {
    errorMessage.value = err.message || t('auth.error_generic')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 bg-slate-50">
    <form
      class="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-sm"
      @submit.prevent="submit"
    >
      <h1 class="text-xl font-bold text-slate-900">{{ t('auth.title') }}</h1>
      <p class="text-sm text-slate-500">{{ t('auth.subtitle') }}</p>

      <div class="space-y-1">
        <label class="block text-sm font-medium text-slate-700" for="email">
          {{ t('auth.email') }}
        </label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full"
        />
      </div>

      <div class="space-y-1">
        <label class="block text-sm font-medium text-slate-700" for="password">
          {{ t('auth.password') }}
        </label>
        <Password
          id="password"
          v-model="password"
          :feedback="false"
          toggleMask
          autocomplete="current-password"
          required
          inputClass="w-full"
          class="w-full"
        />
      </div>

      <Message v-if="errorMessage" severity="error" :closable="false">
        {{ errorMessage }}
      </Message>

      <Button
        type="submit"
        :label="loading ? t('auth.signing_in') : t('auth.sign_in')"
        icon="pi pi-sign-in"
        class="w-full"
        :disabled="loading || !email || !password"
        :loading="loading"
      />
    </form>
  </div>
</template>
