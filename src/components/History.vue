<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownIt from 'markdown-it'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'

const { t, locale } = useI18n()
const auth = useAuthStore()

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const items = ref([])
const loading = ref(false)
const errorMessage = ref('')

const selected = ref(null)
const dialogOpen = ref(false)

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value === 'fr' ? 'fr-FR' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short'
    })
)

function formatDate(value) {
  if (!value) return ''
  try {
    return dateFormatter.value.format(new Date(value))
  } catch {
    return value
  }
}

function excerpt(text, n = 140) {
  if (!text) return ''
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > n ? `${compact.slice(0, n)}…` : compact
}

const renderedDetail = computed(() =>
  selected.value?.result_text ? md.render(selected.value.result_text) : ''
)

async function load() {
  if (!auth.user) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data, error } = await supabase
      .from('analysis_history')
      .select('id, doc_type, file_name, result_text, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    items.value = data || []
  } catch (err) {
    console.error('[history] load', err)
    errorMessage.value = err.message || t('history.error_load')
  } finally {
    loading.value = false
  }
}

function openDetail(row) {
  selected.value = row
  dialogOpen.value = true
}

onMounted(load)
</script>

<template>
  <section class="max-w-6xl mx-auto">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{{ t('history.title') }}</h1>
        <p class="text-slate-600 mt-1">{{ t('history.subtitle') }}</p>
      </div>
      <Button
        :label="t('history.refresh')"
        icon="pi pi-refresh"
        outlined
        size="small"
        :loading="loading"
        @click="load"
      />
    </header>

    <Message v-if="errorMessage" severity="error" :closable="false">
      {{ errorMessage }}
    </Message>

    <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <DataTable
        :value="items"
        :loading="loading"
        dataKey="id"
        stripedRows
        responsiveLayout="scroll"
        :rowHover="true"
        :paginator="items.length > 20"
        :rows="20"
        @row-click="(e) => openDetail(e.data)"
      >
        <template #empty>
          <div class="text-center text-slate-500 py-8">{{ t('history.empty') }}</div>
        </template>

        <Column
          field="created_at"
          :header="t('history.col_date')"
          style="width: 12rem"
        >
          <template #body="{ data }">
            <span class="text-sm text-slate-700">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column field="doc_type" :header="t('history.col_doc_type')" style="width: 14rem">
          <template #body="{ data }">
            <span class="text-sm font-medium text-slate-900">{{ data.doc_type }}</span>
          </template>
        </Column>

        <Column field="file_name" :header="t('history.col_file')" style="width: 14rem">
          <template #body="{ data }">
            <span class="text-sm text-slate-700">{{ data.file_name }}</span>
          </template>
        </Column>

        <Column :header="t('history.col_excerpt')">
          <template #body="{ data }">
            <span class="text-xs text-slate-500">{{ excerpt(data.result_text) }}</span>
          </template>
        </Column>

        <Column style="width: 4rem">
          <template #body>
            <i class="pi pi-chevron-right text-slate-400"></i>
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog
      v-model:visible="dialogOpen"
      modal
      :header="selected?.file_name || ''"
      :style="{ width: '70rem', maxWidth: '95vw' }"
    >
      <div v-if="selected" class="space-y-3">
        <div class="flex flex-wrap gap-3 text-sm text-slate-500">
          <span>{{ formatDate(selected.created_at) }}</span>
          <span>·</span>
          <span class="font-medium text-slate-700">{{ selected.doc_type }}</span>
        </div>
        <div
          class="prose prose-slate max-w-none prose-sm prose-table:text-xs prose-th:bg-slate-100 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-headings:text-slate-900 border border-slate-200 rounded-lg p-4 bg-slate-50"
          v-html="renderedDetail"
        ></div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
:deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
</style>
