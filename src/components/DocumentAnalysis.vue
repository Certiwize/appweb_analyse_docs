<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import Dropdown from 'primevue/dropdown'
import FileUpload from 'primevue/fileupload'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'

import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../utils/fetchWithTimeout'
import { useAuthStore } from '../stores/useAuthStore'
import { useAnalysisSettingsStore } from '../stores/useAnalysisSettingsStore'
import { useDocTypesStore } from '../stores/useDocTypesStore'

const { t } = useI18n()
const auth = useAuthStore()
const settings = useAnalysisSettingsStore()
const docTypesStore = useDocTypesStore()

const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'jpg', 'jpeg', 'png']
const MAX_FILE_SIZE = 10 * 1024 * 1024

const selectedType = ref(null)
const customTypeName = ref('')
const customPrompt = ref('')
const file = ref(null)

const loading = ref(false)
const progress = ref(0)
const progressTimer = ref(null)

const resultText = ref('')
const successMessage = ref('')
const errorMessage = ref('')

const conformityScore = ref(null)
const adminComment = ref('')
const lastHistoryId = ref(null)

const analysisCount = ref(0)

const docTypeOptions = computed(() => docTypesStore.getTypesForDropdown(t))

const isCustom = computed(() => selectedType.value?.code === 'custom')

const canSubmit = computed(() => {
  if (!file.value) return false
  if (isCustom.value) return customTypeName.value.trim().length > 0
  return Boolean(selectedType.value)
})

const missingHint = computed(() => {
  const missing = []
  if (!selectedType.value) missing.push(t('analysis.missing_type'))
  else if (isCustom.value && !customTypeName.value.trim()) missing.push(t('analysis.missing_custom_name'))
  if (!file.value) missing.push(t('analysis.missing_file'))
  return missing.join(' · ')
})

const scoreSeverity = computed(() => {
  const v = conformityScore.value
  if (v === null || v === undefined) return 'secondary'
  if (v >= 80) return 'success'
  if (v >= 50) return 'warn'
  return 'danger'
})

function readableDocType() {
  if (isCustom.value) return customTypeName.value.trim()
  return selectedType.value?.name || selectedType.value?.code || ''
}

async function loadAnalysisCount() {
  if (!auth.currentOrganizationId) return
  const { count, error } = await supabase
    .from('analysis_history')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', auth.currentOrganizationId)
  if (!error) analysisCount.value = count || 0
}

function onFileSelect(event) {
  const f = event.files?.[0]
  if (!f) return
  const ext = f.name.split('.').pop()?.toLowerCase()
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    errorMessage.value = t('analysis.error_extension')
    file.value = null
    return
  }
  if (f.size > MAX_FILE_SIZE) {
    errorMessage.value = t('analysis.error_size')
    file.value = null
    return
  }
  errorMessage.value = ''
  file.value = f
}

function onFileClear() {
  file.value = null
}

function startProgress() {
  progress.value = 0
  if (progressTimer.value) clearInterval(progressTimer.value)
  progressTimer.value = setInterval(() => {
    const v = progress.value
    if (v < 30) progress.value = Math.min(30, v + 3)
    else if (v < 60) progress.value = Math.min(60, v + 2)
    else if (v < 90) progress.value = Math.min(90, v + 1)
  }, 1000)
}

function stopProgress() {
  if (progressTimer.value) {
    clearInterval(progressTimer.value)
    progressTimer.value = null
  }
}

async function finishProgress() {
  progress.value = 100
  await new Promise((r) => setTimeout(r, 500))
  loading.value = false
  progress.value = 0
}

function sanitizeJsonString(raw) {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code < 0x20) {
      if (raw[i] === '\n') out += '\\n'
      else if (raw[i] === '\r') out += '\\r'
      else if (raw[i] === '\t') out += '\\t'
    } else {
      out += raw[i]
    }
  }
  return out
}

async function parseWebhookResponse(response) {
  const rawText = await response.text()
  try {
    return JSON.parse(rawText)
  } catch {
    try {
      return JSON.parse(sanitizeJsonString(rawText))
    } catch {
      return { text: rawText, raw_response: true }
    }
  }
}

async function persistHistory({ docTypeReadable, fileName, text }) {
  if (!auth.currentOrganizationId || !auth.user) return null
  const { data, error } = await supabase
    .from('analysis_history')
    .insert({
      organization_id: auth.currentOrganizationId,
      user_id: auth.user.id,
      doc_type: docTypeReadable,
      file_name: fileName,
      result_text: text,
      conformity_score: null,
      admin_comment: ''
    })
    .select('id')
    .single()
  if (error) {
    console.error('[history] insert', error)
    return null
  }
  return data?.id || null
}

async function sendDocument() {
  if (!canSubmit.value) return
  errorMessage.value = ''
  successMessage.value = ''
  resultText.value = ''
  conformityScore.value = null
  adminComment.value = ''
  lastHistoryId.value = null

  let webhookUrl = settings.webhookUrl
  if (!webhookUrl) {
    try {
      webhookUrl = await settings.fetchWebhookUrl()
    } catch {
      /* fallback handled below */
    }
  }
  if (!webhookUrl) {
    errorMessage.value = t('analysis.error_no_webhook')
    return
  }

  const docTypeReadable = readableDocType()
  const docTypeCode = isCustom.value ? customTypeName.value.trim() : selectedType.value.code
  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('fileName', file.value.name)
  formData.append('docType', docTypeCode)
  if (customPrompt.value.trim()) formData.append('customPrompt', customPrompt.value.trim())
  formData.append('systemPrompt', settings.systemPrompt)

  loading.value = true
  startProgress()

  try {
    const response = await fetchWithTimeout(webhookUrl, { method: 'POST', body: formData }, 60_000)
    if (!response.ok) {
      throw new Error(t('analysis.error_http', { status: response.status }))
    }
    const result = await parseWebhookResponse(response)
    const text = typeof result?.text === 'string' ? result.text : JSON.stringify(result, null, 2)
    resultText.value = text

    const id = await persistHistory({
      docTypeReadable,
      fileName: file.value.name,
      text
    })
    lastHistoryId.value = id
    analysisCount.value += 1
    successMessage.value = t('analysis.success')
  } catch (err) {
    console.error('[analysis] sendDocument', err)
    errorMessage.value = err.message || t('analysis.error_generic')
  } finally {
    stopProgress()
    await finishProgress()
  }
}

async function copyResult() {
  if (!resultText.value) return
  try {
    await navigator.clipboard.writeText(resultText.value)
    successMessage.value = t('analysis.copied')
  } catch {
    errorMessage.value = t('analysis.error_copy')
  }
}

async function saveEvaluation() {
  if (!lastHistoryId.value) return
  try {
    const { error } = await supabase
      .from('analysis_history')
      .update({
        conformity_score: conformityScore.value,
        admin_comment: adminComment.value
      })
      .eq('id', lastHistoryId.value)
      .eq('organization_id', auth.currentOrganizationId)
    if (error) throw error
    successMessage.value = t('analysis.eval_saved')
  } catch (err) {
    errorMessage.value = err.message || t('analysis.error_generic')
  }
}

function returnToList() {
  selectedType.value = null
  customTypeName.value = ''
}

onMounted(async () => {
  await loadAnalysisCount()
})

onBeforeUnmount(() => {
  stopProgress()
})
</script>

<template>
  <section class="max-w-6xl mx-auto">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{{ t('analysis.title') }}</h1>
        <p class="text-slate-600 mt-1">{{ t('analysis.subtitle') }}</p>
      </div>
      <Tag :value="t('analysis.count_label', { n: analysisCount })" severity="info" />
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- LEFT — UPLOAD -->
      <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">
            {{ t('analysis.doc_type') }} <span class="text-red-500">*</span>
          </label>
          <Dropdown
            v-model="selectedType"
            :options="docTypeOptions"
            optionLabel="name"
            :placeholder="t('analysis.select_type')"
            filter
            class="w-full"
          />
        </div>

        <div v-if="isCustom" class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <label class="block text-sm font-medium text-blue-900">
            {{ t('analysis.custom_type_label') }}
          </label>
          <InputText v-model="customTypeName" class="w-full" :placeholder="t('analysis.custom_type_placeholder')" />
          <Button :label="t('analysis.return_to_list')" link @click="returnToList" />
        </div>

        <div class="bg-violet-50 border border-violet-200 rounded-lg p-4">
          <label class="block text-sm font-medium text-violet-900 mb-2">
            {{ t('analysis.custom_prompt') }}
          </label>
          <Textarea
            v-model="customPrompt"
            autoResize
            rows="3"
            class="w-full"
            :placeholder="t('analysis.custom_prompt_placeholder')"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-2">
            {{ t('analysis.upload_label') }}
          </label>
          <FileUpload
            :customUpload="true"
            :auto="true"
            :multiple="false"
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            :maxFileSize="MAX_FILE_SIZE"
            :showUploadButton="false"
            :showCancelButton="false"
            :chooseLabel="t('analysis.choose_drop')"
            @select="onFileSelect"
            @clear="onFileClear"
            @remove="onFileClear"
          >
            <template #empty>
              <div class="flex flex-col items-center justify-center py-8 text-slate-500">
                <i class="pi pi-cloud-upload text-4xl mb-2"></i>
                <p>{{ t('analysis.drop_text') }}</p>
              </div>
            </template>
          </FileUpload>
        </div>

        <div>
          <Button
            :label="loading ? t('analysis.analyzing') : t('analysis.analyze_btn')"
            icon="pi pi-bolt"
            size="large"
            severity="primary"
            class="w-full"
            :disabled="!canSubmit || loading"
            :loading="loading"
            @click="sendDocument"
          />
          <p v-if="!canSubmit" class="mt-2 text-sm text-orange-600">
            {{ missingHint }}
          </p>
        </div>

        <Message v-if="successMessage" severity="success" :closable="true" @close="successMessage = ''">
          {{ successMessage }}
        </Message>
        <Message v-if="errorMessage" severity="error" :closable="true" @close="errorMessage = ''">
          {{ errorMessage }}
        </Message>
      </div>

      <!-- RIGHT — RESULT -->
      <div class="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 class="text-lg font-semibold text-slate-900">{{ t('analysis.result_title') }}</h2>

        <div
          v-if="!loading && !resultText"
          class="border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center py-16 text-slate-400"
        >
          <i class="pi pi-sparkles text-5xl mb-3"></i>
          <p>{{ t('analysis.placeholder_result') }}</p>
        </div>

        <div v-if="loading" class="space-y-3">
          <div class="flex items-center gap-3 text-slate-600">
            <i class="pi pi-spin pi-spinner"></i>
            <span>{{ t('analysis.analyzing') }}…</span>
          </div>
          <ProgressBar :value="progress" />
        </div>

        <div v-if="!loading && resultText" class="space-y-3">
          <Textarea
            :modelValue="resultText"
            readonly
            rows="14"
            class="w-full font-mono text-sm"
          />
          <Button :label="t('analysis.copy')" icon="pi pi-copy" outlined @click="copyResult" />

          <div class="border-t border-slate-200 pt-4 space-y-3">
            <h3 class="text-md font-semibold text-slate-900">{{ t('analysis.eval_title') }}</h3>
            <div class="flex items-center gap-3">
              <label class="text-sm text-slate-700">{{ t('analysis.score') }}</label>
              <InputNumber
                v-model="conformityScore"
                :min="0"
                :max="100"
                showButtons
                buttonLayout="horizontal"
                class="w-40"
              />
              <Tag
                v-if="conformityScore !== null"
                :value="`${conformityScore}/100`"
                :severity="scoreSeverity"
              />
            </div>
            <Textarea
              v-model="adminComment"
              autoResize
              rows="3"
              class="w-full"
              :placeholder="t('analysis.admin_comment_placeholder')"
            />
            <Button
              :label="t('analysis.save_eval')"
              icon="pi pi-save"
              severity="success"
              :disabled="!lastHistoryId"
              @click="saveEvaluation"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
