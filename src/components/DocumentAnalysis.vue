<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownIt from 'markdown-it'
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

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

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

const analysisCount = ref(0)

const renderedResult = computed(() => (resultText.value ? md.render(resultText.value) : ''))

const totalCost = computed(() => analysisCount.value * settings.pricePerAnalysis)

function onPriceChange(value) {
  settings.setPricePerAnalysis(value)
}

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

function readableDocType() {
  if (isCustom.value) return customTypeName.value.trim()
  return selectedType.value?.name || selectedType.value?.code || ''
}

async function loadAnalysisCount() {
  if (!auth.user) return
  const { count, error } = await supabase
    .from('analysis_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
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
  if (!auth.user) return
  const { error } = await supabase.from('analysis_history').insert({
    user_id: auth.user.id,
    doc_type: docTypeReadable,
    file_name: fileName,
    result_text: text,
    admin_comment: ''
  })
  if (error) console.error('[history] insert', error)
}

async function sendDocument() {
  if (!canSubmit.value) return
  errorMessage.value = ''
  successMessage.value = ''
  resultText.value = ''

  const webhookUrl = settings.webhookUrl
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

    await persistHistory({
      docTypeReadable,
      fileName: file.value.name,
      text
    })
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
      <div class="flex flex-wrap items-center gap-2">
        <Tag :value="t('analysis.count_label', { n: analysisCount })" severity="info" />
        <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1">
          <label class="text-xs text-slate-600">{{ t('analysis.price_label') }}</label>
          <InputNumber
            :modelValue="settings.pricePerAnalysis"
            @update:modelValue="onPriceChange"
            mode="decimal"
            :minFractionDigits="0"
            :maxFractionDigits="2"
            :min="0"
            suffix=" €"
            inputClass="!w-20 !py-0.5 !text-sm text-right"
            :showButtons="false"
          />
        </div>
        <Tag
          :value="t('analysis.total_cost_label', { total: totalCost.toFixed(2) })"
          severity="success"
        />
      </div>
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
            :auto="false"
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
          <div
            class="prose prose-slate max-w-none prose-sm prose-table:text-xs prose-th:bg-slate-100 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-headings:text-slate-900 border border-slate-200 rounded-lg p-4 bg-slate-50 max-h-[32rem] overflow-auto"
            v-html="renderedResult"
          ></div>
          <Button :label="t('analysis.copy')" icon="pi pi-copy" outlined @click="copyResult" />
        </div>
      </div>
    </div>
  </section>
</template>
